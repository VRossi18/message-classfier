import { applyEvent } from '@/hooks/useMessages'
import { computeMetrics } from './metrics'
import { columnFor } from './sectors'
import type { Message } from './schemas'

const base: Message = {
  id: '1', customerName: 'A', rawContent: 'x', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00Z', processedAt: null,
}
const done = (o: Partial<Message>): Message => ({ ...base, status: 'COMPLETED', ...o })

describe('columnFor', () => {
  it('deixa mensagens não classificadas na fila de entrada', () => {
    expect(columnFor(base)).toBeNull()
  })
  it('manda CRITICAL e HUMAN_REVIEW para Urgente', () => {
    expect(columnFor(done({ assignedSector: 'STOCK', sentiment: 'CRITICAL' }))).toBe('URGENT')
    expect(columnFor(done({ assignedSector: 'HUMAN_REVIEW', sentiment: 'NEUTRAL' }))).toBe('URGENT')
  })
  it('a correção humana prevalece', () => {
    expect(columnFor(done({ assignedSector: 'STOCK', sentiment: 'CALM', correctedSector: 'SALES' }))).toBe('SALES')
  })
})

describe('computeMetrics', () => {
  it('é null sem concluídas e calcula precisão com correções', () => {
    expect(computeMetrics([base]).accuracy).toBeNull()
    const m = computeMetrics([
      done({ id: 'a', assignedSector: 'STOCK', sentiment: 'CALM' }),
      done({ id: 'b', assignedSector: 'STOCK', sentiment: 'ANGRY', correctedSector: 'SALES' }),
    ])
    expect(m.accuracy).toBe(0.5)
    expect(m.sentiments.ANGRY).toBe(1)
  })
})

describe('applyEvent', () => {
  it('insere novas e substitui existentes', () => {
    const created = applyEvent([], { type: 'message.created', message: base })
    expect(created).toHaveLength(1)
    const updated = applyEvent(created, { type: 'message.updated', message: { ...base, status: 'PROCESSING' } })
    expect(updated).toHaveLength(1)
    expect(updated[0]?.status).toBe('PROCESSING')
  })
})
