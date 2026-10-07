import type { EventBus } from '../events/bus.js'
import type { LlmClassifier } from '../llm/types.js'
import type { MessagesRepo } from '../repo/messages.js'
import { toDto } from '../repo/messages.js'
import { routeSector } from '../routing.js'

export interface ProcessorDeps {
  repo: MessagesRepo
  bus: EventBus
  classifier: LlmClassifier
  confidenceThreshold: number
}

export async function processMessage(deps: ProcessorDeps, messageId: string): Promise<void> {
  const { repo, bus, classifier, confidenceThreshold } = deps

  const processing = await repo.setStatus(messageId, 'PROCESSING')
  if (!processing) return // mensagem removida: nada a fazer
  await bus.publish({ type: 'message.updated', message: toDto(processing) })

  const result = await classifier.classify(processing.rawContent)
  const done = await repo.applyClassification(messageId, result, routeSector(result, confidenceThreshold))
  if (done) await bus.publish({ type: 'message.updated', message: toDto(done) })
}

/** Chamado quando as tentativas se esgotaram. */
export async function markFailed(deps: Pick<ProcessorDeps, 'repo' | 'bus'>, messageId: string): Promise<void> {
  const row = await deps.repo.setStatus(messageId, 'FAILED')
  if (row) await deps.bus.publish({ type: 'message.updated', message: toDto(row) })
}
