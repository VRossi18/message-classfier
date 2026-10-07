import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from '../src/api/server.js'
import type { MessageRow } from '../src/db/schema.js'
import type { EventBus } from '../src/events/bus.js'
import type { ClassifyQueue } from '../src/queue/classify.queue.js'
import type { MessagesRepo } from '../src/repo/messages.js'
import type { MessageEvent } from '../src/schemas/api.js'

function makeRow(input: { customerName: string; rawContent: string }): MessageRow {
  return {
    id: randomUUID(),
    ...input,
    assignedSector: null,
    sentiment: null,
    urgencyScore: null,
    confidenceScore: null,
    summary: null,
    suggestedAction: null,
    correctedSector: null,
    status: 'PENDING',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    processedAt: null,
    resolvedAt: null,
    classifier: null,
  }
}

function makeDeps() {
  const rows = new Map<string, MessageRow>()
  const events: MessageEvent[] = []
  const enqueued: string[] = []
  const repo = {
    insert: vi.fn(async (input: { customerName: string; rawContent: string }) => {
      const r = makeRow(input)
      rows.set(r.id, r)
      return r
    }),
    list: vi.fn(async () => [...rows.values()]),
    getById: vi.fn(async (id: string) => rows.get(id)),
    setStatus: vi.fn(async (id: string, status: MessageRow['status']) => {
      const r = rows.get(id)
      if (!r) return undefined
      r.status = status
      return r
    }),
    applyClassification: vi.fn(),
    resolve: vi.fn(async (id: string) => {
      const r = rows.get(id)
      if (!r) return undefined
      r.resolvedAt ??= new Date('2026-01-02T09:00:00Z')
      return r
    }),
    reopen: vi.fn(async (id: string) => {
      const r = rows.get(id)
      if (!r) return undefined
      r.resolvedAt = null
      return r
    }),
    correctSector: vi.fn(async (id: string, sector: MessageRow['correctedSector']) => {
      const r = rows.get(id)
      if (!r) return undefined
      r.correctedSector = sector
      return r
    }),
    metrics: vi.fn(async () => ({
      total: 1,
      sentiments: { CALM: 1, NEUTRAL: 0, ANGRY: 0, CRITICAL: 0 },
      corrected: 0,
      completed: 1,
      accuracy: 1,
    })),
  } as unknown as MessagesRepo
  const bus: EventBus = {
    publish: vi.fn(async (e) => {
      events.push(e)
    }),
    subscribe: vi.fn(async () => () => true),
    close: vi.fn(async () => {}),
  }
  const queue: ClassifyQueue & { enqueue: ReturnType<typeof vi.fn> } = {
    enqueue: vi.fn(async (id: string) => {
      enqueued.push(id)
    }),
    close: vi.fn(async () => {}),
  }
  return { repo, bus, queue, rows, events, enqueued }
}

let d: ReturnType<typeof makeDeps>
const build = () => buildServer({ repo: d.repo, bus: d.bus, queue: d.queue, corsOrigin: 'http://front.test' })

beforeEach(() => {
  d = makeDeps()
})

describe('GET /health', () => {
  it('responde ok', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})

describe('POST /api/messages', () => {
  it('201: persiste, publica message.created e enfileira; corpo aparado', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      payload: { customerName: '  Ana ', rawContent: ' boleto ' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ customerName: 'Ana', rawContent: 'boleto', status: 'PENDING', createdAt: '2026-01-01T10:00:00.000Z' })
    expect(d.repo.insert).toHaveBeenCalledWith({ customerName: 'Ana', rawContent: 'boleto' })
    expect(d.enqueued).toEqual([body.id])
    expect(d.events).toHaveLength(1)
    expect(d.events[0]).toMatchObject({ type: 'message.created', message: { id: body.id } })
    await app.close()
  })

  it.each([
    ['campos ausentes', {}],
    ['nome vazio', { customerName: '', rawContent: 'x' }],
    ['nome só espaços', { customerName: '   ', rawContent: 'x' }],
    ['mensagem vazia', { customerName: 'A', rawContent: '' }],
    ['nome > 200', { customerName: 'a'.repeat(201), rawContent: 'x' }],
    ['mensagem > 5000', { customerName: 'A', rawContent: 'a'.repeat(5001) }],
    ['tipo errado', { customerName: 1, rawContent: 'x' }],
  ])('400: %s', async (_n, payload) => {
    const app = await build()
    const res = await app.inject({ method: 'POST', url: '/api/messages', payload })
    expect(res.statusCode).toBe(400)
    expect(d.repo.insert).not.toHaveBeenCalled()
    expect(d.queue.enqueue).not.toHaveBeenCalled()
    await app.close()
  })

  it('400 devolve { error, details } em pt-BR, sem mensagens técnicas em inglês', async () => {
    const app = await build()
    const res = await app.inject({ method: 'POST', url: '/api/messages', payload: { customerName: '', rawContent: 'x' } })
    const body = res.json() as { error: string; details: { field: string; message: string }[] }
    expect(body.error).toBe('Dados inválidos')
    expect(body.details[0]?.field).toBe('customerName')
    expect(body.details[0]?.message).not.toMatch(/too small|invalid/i)
    await app.close()
  })

  it('aceita nos limites exatos (200 / 5000)', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      payload: { customerName: 'a'.repeat(200), rawContent: 'b'.repeat(5000) },
    })
    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it('503: fila falha -> mensagem vira FAILED e evento message.updated é publicado', async () => {
    d.queue.enqueue.mockRejectedValueOnce(new Error('redis down'))
    const app = await build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      payload: { customerName: 'Ana', rawContent: 'oi' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'Fila indisponível' })
    const [row] = [...d.rows.values()]
    expect(row?.status).toBe('FAILED')
    expect(d.events.map((e) => [e.type, e.message.status])).toEqual([
      ['message.created', 'PENDING'],
      ['message.updated', 'FAILED'],
    ])
    await app.close()
  })
})

describe('GET /api/messages e /api/metrics', () => {
  it('lista mensagens como DTO', async () => {
    const app = await build()
    await app.inject({ method: 'POST', url: '/api/messages', payload: { customerName: 'A', rawContent: 'x' } })
    const res = await app.inject({ method: 'GET', url: '/api/messages' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].createdAt).toBe('2026-01-01T10:00:00.000Z')
    await app.close()
  })
  it('retorna métricas do repo', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/api/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.json().accuracy).toBe(1)
    await app.close()
  })
})

describe('PATCH /api/messages/:id/correction', () => {
  it('200: corrige, publica message.updated', async () => {
    const row = makeRow({ customerName: 'A', rawContent: 'x' })
    d.rows.set(row.id, row)
    const app = await build()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/messages/${row.id}/correction`,
      payload: { correctedSector: 'SALES' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().correctedSector).toBe('SALES')
    expect(d.events).toEqual([expect.objectContaining({ type: 'message.updated' })])
    await app.close()
  })

  it('404: id inexistente, sem evento', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/messages/${randomUUID()}/correction`,
      payload: { correctedSector: 'SALES' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'Mensagem não encontrada' })
    expect(d.events).toHaveLength(0)
    await app.close()
  })

  it('400: id não-UUID, setor inválido ou corpo ausente', async () => {
    const app = await build()
    const id = randomUUID()
    const bad = [
      { url: '/api/messages/abc/correction', payload: { correctedSector: 'SALES' } },
      { url: `/api/messages/${id}/correction`, payload: { correctedSector: 'NOPE' } },
      { url: `/api/messages/${id}/correction`, payload: {} },
    ]
    for (const b of bad) {
      const res = await app.inject({ method: 'PATCH', ...b })
      expect(res.statusCode).toBe(400)
    }
    expect(d.repo.correctSector).not.toHaveBeenCalled()
    await app.close()
  })

  it('aceita HUMAN_REVIEW como correção', async () => {
    const row = makeRow({ customerName: 'A', rawContent: 'x' })
    d.rows.set(row.id, row)
    const app = await build()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/messages/${row.id}/correction`,
      payload: { correctedSector: 'HUMAN_REVIEW' },
    })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})

describe('POST /api/messages/:id/resolve e /reopen', () => {
  const seed = (status: MessageRow['status'], resolvedAt: Date | null = null) => {
    const row = { ...makeRow({ customerName: 'A', rawContent: 'x' }), status, resolvedAt }
    d.rows.set(row.id, row)
    return row
  }
  const call = async (action: 'resolve' | 'reopen', id: string) => {
    const app = await build()
    const res = await app.inject({ method: 'POST', url: `/api/messages/${id}/${action}` })
    await app.close()
    return res
  }

  it('resolve uma mensagem COMPLETED, devolve resolvedAt e publica message.updated', async () => {
    const row = seed('COMPLETED')
    const res = await call('resolve', row.id)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: row.id, resolvedAt: '2026-01-02T09:00:00.000Z' })
    expect(d.events).toHaveLength(1)
    expect(d.events[0]).toMatchObject({ type: 'message.updated', message: { id: row.id, resolvedAt: '2026-01-02T09:00:00.000Z' } })
  })

  it.each(['PENDING', 'PROCESSING', 'FAILED'] as const)('409 ao resolver mensagem %s, sem alterar nada', async (status) => {
    const row = seed(status)
    const res = await call('resolve', row.id)
    expect(res.statusCode).toBe(409)
    expect(d.repo.resolve).not.toHaveBeenCalled()
    expect(d.events).toHaveLength(0)
  })

  it('resolver duas vezes é idempotente: mantém a data e não publica de novo', async () => {
    const row = seed('COMPLETED', new Date('2026-01-01T12:00:00Z'))
    const res = await call('resolve', row.id)
    expect(res.statusCode).toBe(200)
    expect(res.json().resolvedAt).toBe('2026-01-01T12:00:00.000Z')
    expect(d.repo.resolve).not.toHaveBeenCalled()
    expect(d.events).toHaveLength(0)
  })

  it('reabre uma resolvida, zera resolvedAt e publica message.updated', async () => {
    const row = seed('COMPLETED', new Date('2026-01-01T12:00:00Z'))
    const res = await call('reopen', row.id)
    expect(res.statusCode).toBe(200)
    expect(res.json().resolvedAt).toBeNull()
    expect(d.events[0]).toMatchObject({ type: 'message.updated', message: { id: row.id, resolvedAt: null } })
  })

  it('reabrir uma mensagem já aberta é idempotente', async () => {
    const row = seed('COMPLETED')
    const res = await call('reopen', row.id)
    expect(res.statusCode).toBe(200)
    expect(d.repo.reopen).not.toHaveBeenCalled()
    expect(d.events).toHaveLength(0)
  })

  it.each(['resolve', 'reopen'] as const)('404 em %s para id inexistente e 400 para id não-UUID', async (action) => {
    expect((await call(action, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
    expect((await call(action, 'abc')).statusCode).toBe(400)
  })
})

describe('CORS', () => {
  it('devolve a origem configurada', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://front.test' } })
    expect(res.headers['access-control-allow-origin']).toBe('http://front.test')
    await app.close()
  })
})
