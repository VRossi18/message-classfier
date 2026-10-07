import type { Message, Metrics, Sentiment } from './schemas'

/** Precisão da IA = 1 - (corrigidas pelo humano / concluídas). */
export function computeMetrics(messages: Message[]): Metrics {
  const sentiments: Record<Sentiment, number> = { CALM: 0, NEUTRAL: 0, ANGRY: 0, CRITICAL: 0 }
  let completed = 0
  let corrected = 0
  for (const m of messages) {
    if (m.sentiment) sentiments[m.sentiment]++
    if (m.status === 'COMPLETED') {
      completed++
      if (m.correctedSector && m.correctedSector !== m.assignedSector) corrected++
    }
  }
  return {
    total: messages.length,
    sentiments,
    corrected,
    completed,
    accuracy: completed === 0 ? null : 1 - corrected / completed,
  }
}
