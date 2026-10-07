import { Queue, Worker } from 'bullmq'
import postgres from 'postgres'
import { buildServer } from '../../src/api/server.js'
import { createDb, runMigrations } from '../../src/db/client.js'
import { createRedisBus, type EventBus } from '../../src/events/bus.js'
import type { LlmClassifier } from '../../src/llm/types.js'
import {
  CLASSIFY_ATTEMPTS,
  CLASSIFY_QUEUE,
  createQueueConnection,
  type ClassifyJob,
  type ClassifyQueue,
} from '../../src/queue/classify.queue.js'
import { createMessagesRepo } from '../../src/repo/messages.js'
import type { MessageDto } from '../../src/schemas/api.js'
import { markFailed, processMessage } from '../../src/worker/processor.js'

// Banco e Redis db próprios, para nunca tocar nos dados de desenvolvimento.
export const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://dev:devpassword@localhost:5432/routing_db'
export const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, '/routing_test')
export const REDIS_URL = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '') + '/1'
export const ORIGIN = 'http://localhost:5173'

export async function servicesUp() {
  try {
    const admin = postgres(ADMIN_URL, { max: 1, connect_timeout: 3 })
    await admin`select 1`
    await admin.end()
    const r = createQueueConnection(REDIS_URL)
    await r.ping()
    r.disconnect()
    return true
  } catch {
    return false
  }
}

export async function ensureTestDb() {
  const admin = postgres(ADMIN_URL, { max: 1 })
  const exists = await admin`select 1 from pg_database where datname = 'routing_test'`
  if (exists.length === 0) await admin.unsafe('create database routing_test')
  await admin.end()
}

export async function poll<T>(fn: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('timeout')
}

export interface Harness {
  app: Awaited<ReturnType<typeof buildServer>>
  base: string
  repo: ReturnType<typeof createMessagesRepo>
  bus: EventBus
  queue: ClassifyQueue
  /** Quantidade de ouvintes SSE ativos registrados no barramento. */
  activeListeners(): number
  failedJobs: string[]
  /** Reconstrói a API (mesmo banco/Redis), simulando um restart. */
  restartApi(): Promise<void>
  stop(): Promise<void>
}

/** Sobe API + worker reais (Postgres + Redis) com o classificador informado e backoff curto. */
export async function startHarness(classifier: LlmClassifier, opts: { threshold?: number } = {}): Promise<Harness> {
  await ensureTestDb()
  const { db, sql } = createDb(TEST_URL)
  await runMigrations(db)
  await sql`truncate table messages`
  const repo = createMessagesRepo(db)

  const flush = createQueueConnection(REDIS_URL)
  await flush.flushdb()
  flush.disconnect()

  const realBus = createRedisBus(REDIS_URL)
  let active = 0
  const bus: EventBus = {
    publish: (e) => realBus.publish(e),
    close: () => realBus.close(),
    async subscribe(l) {
      const un = await realBus.subscribe(l)
      active++
      let done = false
      return () => {
        if (!done) {
          done = true
          active--
        }
        un()
      }
    },
  }

  // Fila equivalente à de produção, com backoff curto para os testes de retentativa.
  const qConn = createQueueConnection(REDIS_URL)
  const bq = new Queue<ClassifyJob>(CLASSIFY_QUEUE, { connection: qConn })
  const queue: ClassifyQueue = {
    async enqueue(id) {
      await bq.add(
        'classify',
        { messageId: id },
        { attempts: CLASSIFY_ATTEMPTS, backoff: { type: 'fixed', delay: 100 }, removeOnComplete: 1000, removeOnFail: 1000, jobId: id },
      )
    },
    async close() {
      await bq.close()
      qConn.disconnect()
    },
  }

  const wConn = createQueueConnection(REDIS_URL)
  const deps = { repo, bus, classifier, confidenceThreshold: opts.threshold ?? 0.5 }
  const worker = new Worker<ClassifyJob>(CLASSIFY_QUEUE, (job) => processMessage(deps, job.data.messageId), {
    connection: wConn,
    concurrency: 5,
  })
  const failedJobs: string[] = []
  // Mesma lógica de src/entrypoints/worker.ts.
  worker.on('failed', (job) => {
    if (job && job.attemptsMade >= CLASSIFY_ATTEMPTS) {
      failedJobs.push(job.data.messageId)
      void markFailed(deps, job.data.messageId)
    }
  })
  await worker.waitUntilReady()

  const h = { base: '' } as Harness
  const start = async () => {
    h.app = await buildServer({ repo, bus, queue, corsOrigin: ORIGIN })
    h.base = await h.app.listen({ port: 0, host: '127.0.0.1' })
  }
  await start()
  Object.assign(h, {
    repo,
    bus,
    queue,
    failedJobs,
    activeListeners: () => active,
    async restartApi() {
      await h.app.close()
      await start()
    },
    async stop() {
      await h.app.close()
      await worker.close()
      await queue.close()
      await bus.close()
      wConn.disconnect()
      await sql.end()
    },
  })
  return h
}

export const post = (base: string, customerName: string, rawContent: string) =>
  fetch(`${base}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customerName, rawContent }),
  })

export const list = async (base: string) => (await (await fetch(`${base}/api/messages`)).json()) as MessageDto[]

export const patch = (base: string, id: string, correctedSector: string) =>
  fetch(`${base}/api/messages/${id}/correction`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correctedSector }),
  })

export interface SseClient {
  events: Array<{ type: string; message: MessageDto }>
  status: number
  headers: Headers
  closed: Promise<void>
  abort(): void
}

export async function openSse(base: string): Promise<SseClient> {
  const ctrl = new AbortController()
  const res = await fetch(`${base}/api/events`, { signal: ctrl.signal, headers: { Origin: ORIGIN } })
  const events: SseClient['events'] = []
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  const closed = (async () => {
    let buf = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value)
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const m = /^data: (.+)$/m.exec(chunk)
          if (m) events.push(JSON.parse(m[1]!))
        }
      }
    } catch {
      /* abortado */
    }
  })()
  return { events, status: res.status, headers: res.headers, closed, abort: () => ctrl.abort() }
}
