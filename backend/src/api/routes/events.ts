import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { MessageEvent } from '../../schemas/api.js'
import type { ServerDeps } from '../server.js'

// Evento nomeado (e não comentário ": ping"): o EventSource do navegador não expõe comentários,
// e o cliente precisa enxergar o batimento para detectar conexões zumbis (ver frontend/src/lib/sse.ts).
const HEARTBEAT_MS = 15_000

export const eventsRoutes: FastifyPluginAsyncZod<ServerDeps> = async (app, { bus, corsOrigin }) => {
  app.get('/api/events', async (req, reply) => {
    // Assina antes de enviar os cabeçalhos para não perder eventos entre os dois passos.
    const send = (e: MessageEvent) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    const unsubscribe = await bus.subscribe(send)

    // hijack: o corpo é um fluxo longo e o cors do Fastify não roda nesta resposta.
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': corsOrigin,
    })
    reply.raw.write('retry: 3000\n\n')

    const heartbeat = setInterval(() => reply.raw.write('event: ping\ndata: {}\n\n'), HEARTBEAT_MS)
    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })
}
