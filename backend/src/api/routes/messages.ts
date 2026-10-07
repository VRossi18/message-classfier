import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { toDto } from '../../repo/messages.js'
import { CorrectionBody, CreateMessageBody, IdParams } from '../../schemas/api.js'
import type { ServerDeps } from '../server.js'

export const messagesRoutes: FastifyPluginAsyncZod<ServerDeps> = async (app, { repo, bus, queue }) => {
  app.get('/api/messages', async () => (await repo.list()).map(toDto))

  app.post('/api/messages', { schema: { body: CreateMessageBody } }, async (req, reply) => {
    const row = await repo.insert(req.body)
    await bus.publish({ type: 'message.created', message: toDto(row) })
    try {
      await queue.enqueue(row.id)
    } catch (err) {
      // Sem fila a mensagem nunca seria processada: sinaliza a falha em vez de deixá-la PENDING.
      req.log.error({ err }, 'falha ao enfileirar')
      const failed = await repo.setStatus(row.id, 'FAILED')
      if (failed) await bus.publish({ type: 'message.updated', message: toDto(failed) })
      return reply.code(503).send({ error: 'Fila indisponível' })
    }
    return reply.code(201).send(toDto(row))
  })

  app.patch(
    '/api/messages/:id/correction',
    { schema: { params: IdParams, body: CorrectionBody } },
    async (req, reply) => {
      const row = await repo.correctSector(req.params.id, req.body.correctedSector)
      if (!row) return reply.code(404).send({ error: 'Mensagem não encontrada' })
      const dto = toDto(row)
      await bus.publish({ type: 'message.updated', message: dto })
      return dto
    },
  )

  app.get('/api/metrics', async () => repo.metrics())
}
