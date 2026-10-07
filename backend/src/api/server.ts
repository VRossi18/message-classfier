import cors from '@fastify/cors'
import Fastify, { type FastifyError } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { EventBus } from '../events/bus.js'
import type { ClassifyQueue } from '../queue/classify.queue.js'
import type { MessagesRepo } from '../repo/messages.js'
import { eventsRoutes } from './routes/events.js'
import { messagesRoutes } from './routes/messages.js'

// Mensagens de validação do Zod em português (afeta só os erros devolvidos pela API).
z.config(z.locales.pt())

export interface ServerDeps {
  repo: MessagesRepo
  bus: EventBus
  queue: ClassifyQueue
  corsOrigin: string
}

export async function buildServer(deps: ServerDeps) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Erros de validação em pt-BR, no mesmo formato { error } das demais respostas.
  app.setErrorHandler((error, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: 'Dados inválidos',
        details: error.validation.map((v) => ({
          field: v.instancePath.replace(/^\//, '') || 'corpo',
          message: v.message,
        })),
      })
    }
    const err = error as FastifyError
    req.log.error({ err })
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    return reply.code(status).send({ error: status === 500 ? 'Erro interno' : err.message })
  })

  await app.register(cors, { origin: deps.corsOrigin, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] })

  app.get('/health', async () => ({ status: 'ok' }))
  await app.register(messagesRoutes, deps)
  await app.register(eventsRoutes, deps)
  return app
}
