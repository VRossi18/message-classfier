import { describe, expect, it } from 'vitest'
import type { Message } from './schemas'
import { COLUMNS, DEFAULT_ACTION, SECTOR_LABEL, SENTIMENT_LABEL, SENTIMENT_STYLE, columnFor, effectiveSector } from './sectors'

const base: Message = {
  id: '1', customerName: 'A', rawContent: 'x', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'COMPLETED', createdAt: '2026-01-01T00:00:00Z', processedAt: null,
}

describe('sectors', () => {
  it('effectiveSector prioriza a correção', () => {
    expect(effectiveSector(base)).toBeNull()
    expect(effectiveSector({ ...base, assignedSector: 'STOCK' })).toBe('STOCK')
    expect(effectiveSector({ ...base, assignedSector: 'STOCK', correctedSector: 'SALES' })).toBe('SALES')
  })
  it('columnFor: setor normal vai para sua coluna', () => {
    expect(columnFor({ ...base, assignedSector: 'SUPPORT', sentiment: 'ANGRY' })).toBe('SUPPORT')
  })
  it('columnFor: CRITICAL vence mesmo com correção; correção para HUMAN_REVIEW vai a Urgente', () => {
    expect(columnFor({ ...base, assignedSector: 'STOCK', sentiment: 'CRITICAL', correctedSector: 'SALES' })).toBe('URGENT')
    expect(columnFor({ ...base, assignedSector: 'STOCK', sentiment: 'CALM', correctedSector: 'HUMAN_REVIEW' })).toBe('URGENT')
  })
  it('columnFor: CRITICAL sem setor ainda é Urgente', () => {
    expect(columnFor({ ...base, sentiment: 'CRITICAL' })).toBe('URGENT')
  })
  it('tabelas cobrem todos os setores e sentimentos', () => {
    expect(COLUMNS.map((c) => c.id)).toEqual(['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'URGENT'])
    expect(Object.keys(SECTOR_LABEL)).toHaveLength(5)
    expect(Object.keys(DEFAULT_ACTION)).toHaveLength(5)
    expect(Object.keys(SENTIMENT_LABEL).sort()).toEqual(Object.keys(SENTIMENT_STYLE).sort())
  })
})
