import { describe, expect, it } from 'vitest'
import { CreateMessageSchema, MessageEventSchema, MessageSchema } from './schemas'

const valid = {
  id: '1', customerName: 'A', rawContent: 'x', assignedSector: 'STOCK', sentiment: 'CALM',
  urgencyScore: 0.5, confidenceScore: 1, summary: 's', suggestedAction: 'a',
  correctedSector: null, status: 'COMPLETED', createdAt: '2026-01-01T00:00:00Z', processedAt: null, resolvedAt: null,
}

describe('CreateMessageSchema', () => {
  it('aplica trim', () => {
    expect(CreateMessageSchema.parse({ customerName: '  Ana ', rawContent: ' oi ' })).toEqual({ customerName: 'Ana', rawContent: 'oi' })
  })
  it('rejeita vazio / só espaços com mensagens em português', () => {
    const r = CreateMessageSchema.safeParse({ customerName: '   ', rawContent: '' })
    expect(r.success).toBe(false)
    const msgs = r.error!.issues.map((i) => i.message)
    expect(msgs).toContain('Informe o nome do cliente')
    expect(msgs).toContain('Escreva a mensagem')
  })
  it('rejeita campos ausentes', () => {
    expect(CreateMessageSchema.safeParse({}).success).toBe(false)
  })
})

describe('MessageSchema', () => {
  it('aceita mensagem válida', () => {
    expect(MessageSchema.safeParse(valid).success).toBe(true)
  })
  it('rejeita enums inválidos e scores fora de 0..1', () => {
    expect(MessageSchema.safeParse({ ...valid, assignedSector: 'X' }).success).toBe(false)
    expect(MessageSchema.safeParse({ ...valid, sentiment: 'HAPPY' }).success).toBe(false)
    expect(MessageSchema.safeParse({ ...valid, status: 'DONE' }).success).toBe(false)
    expect(MessageSchema.safeParse({ ...valid, urgencyScore: 1.1 }).success).toBe(false)
    expect(MessageSchema.safeParse({ ...valid, confidenceScore: -0.1 }).success).toBe(false)
  })
  it('exige campos nullable presentes (undefined não vale)', () => {
    const { summary: _s, ...rest } = valid
    expect(MessageSchema.safeParse(rest).success).toBe(false)
  })
})

describe('MessageEventSchema', () => {
  it('valida tipo e mensagem', () => {
    expect(MessageEventSchema.safeParse({ type: 'message.created', message: valid }).success).toBe(true)
    expect(MessageEventSchema.safeParse({ type: 'other', message: valid }).success).toBe(false)
  })
})
