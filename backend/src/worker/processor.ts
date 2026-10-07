import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import type { EventBus } from '../events/bus.js'
import type { LlmClassifier } from '../llm/types.js'
import type { MessagesRepo } from '../repo/messages.js'
import { toDto } from '../repo/messages.js'
import { CLASSIFY_ATTEMPTS } from '../queue/classify.queue.js'
import { routeSector } from '../routing.js'

export interface ProcessorDeps {
  repo: MessagesRepo
  bus: EventBus
  classifier: LlmClassifier
  confidenceThreshold: number
  /** Recebe uma linha estruturada por classificação (sem o texto do cliente). */
  log?: (entry: Record<string, unknown>) => void
}

export async function processMessage(deps: ProcessorDeps, messageId: string): Promise<void> {
  const { repo, bus, classifier, confidenceThreshold } = deps

  const processing = await repo.setStatus(messageId, 'PROCESSING')
  if (!processing) return // mensagem removida: nada a fazer
  await bus.publish({ type: 'message.updated', message: toDto(processing) })

  const started = Date.now()
  const result = await classifier.classify(processing.rawContent)
  const sector = routeSector(result, confidenceThreshold)
  const done = await repo.applyClassification(messageId, result, sector, classifier.name)
  deps.log?.({
    event: 'classified',
    messageId,
    classifier: classifier.name,
    ms: Date.now() - started,
    sector,
    sentiment: result.sentiment,
    confidence: result.confidenceScore,
  })
  if (done) await bus.publish({ type: 'message.updated', message: toDto(done) })
}

/**
 * Chamado quando um job falha. A mensagem só é marcada como FAILED quando não haverá nova tentativa:
 * as tentativas acabaram ou o erro é irrecuperável (ex.: chave da API inválida), caso em que o
 * BullMQ não repete e a mensagem ficaria em PROCESSING para sempre.
 */
export function shouldMarkFailed(job: Pick<Job, 'attemptsMade'>, err: Error): boolean {
  return err instanceof UnrecoverableError || job.attemptsMade >= CLASSIFY_ATTEMPTS
}

/** Chamado quando as tentativas se esgotaram. */
export async function markFailed(deps: Pick<ProcessorDeps, 'repo' | 'bus'>, messageId: string): Promise<void> {
  const row = await deps.repo.setStatus(messageId, 'FAILED')
  if (row) await deps.bus.publish({ type: 'message.updated', message: toDto(row) })
}
