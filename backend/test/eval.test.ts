import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FakeClassifier } from '../src/llm/fake.js'
import type { ClassificationResult } from '../src/schemas/classification.js'
import { EvalCaseSchema, formatReport, percentile, scoreOutcomes, type EvalCase, type EvalOutcome } from '../eval/metrics.js'

const result = (o: Partial<ClassificationResult> = {}): ClassificationResult => ({
  sector: 'FINANCIAL', sentiment: 'NEUTRAL', urgencyScore: 0.3, confidenceScore: 0.9, summary: 's', suggestedAction: 'a', ...o,
})
const c = (o: Partial<EvalCase> = {}): EvalCase => ({
  id: 'x', text: 't', expectedSectors: ['FINANCIAL'], expectedSentiment: 'NEUTRAL', ...o,
})
const outcome = (cs: EvalCase, r?: Partial<ClassificationResult>, ms = 100): EvalOutcome => ({ case: cs, result: result(r), ms })

describe('percentile', () => {
  it('posto mais próximo e bordas', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([5], 95)).toBe(5)
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(v, 50)).toBe(5)
    expect(percentile(v, 95)).toBe(10)
    expect(percentile([10, 1, 5], 100)).toBe(10)
  })
})

describe('scoreOutcomes', () => {
  it('acurácia de setor e sentimento, estrita e tolerante', () => {
    const r = scoreOutcomes(
      [
        outcome(c({ id: 'a' })),
        outcome(c({ id: 'b' }), { sector: 'SALES' }), // setor errado
        outcome(c({ id: 'd', expectedSentiment: 'CRITICAL' }), { sentiment: 'ANGRY' }), // exato errado, tolerante certo
        outcome(c({ id: 'e', expectedSentiment: 'CALM' }), { sentiment: 'ANGRY' }), // ambos errados
      ],
      0.5,
    )
    expect(r.sector).toEqual({ correct: 3, total: 4, rate: 0.75 })
    expect(r.sentimentStrict).toEqual({ correct: 2, total: 4, rate: 0.5 })
    expect(r.sentimentTolerant).toEqual({ correct: 3, total: 4, rate: 0.75 })
    expect(r.failures.map((f) => f.id).sort()).toEqual(['b', 'd', 'e'])
  })

  it('vários setores aceitáveis (mistura): qualquer um conta e não entra na matriz', () => {
    const mix = c({ id: 'm', expectedSectors: ['FINANCIAL', 'STOCK'] })
    const r = scoreOutcomes([outcome(mix, { sector: 'STOCK' }), outcome(mix, { sector: 'SALES' })], 0.5)
    expect(r.sector.correct).toBe(1)
    expect(r.confusion).toEqual({})
  })

  it('ambíguas: acerto = confiança abaixo do limite; claros com confiança baixa são falsos encaminhamentos', () => {
    const amb = c({ id: 'amb', expectedSectors: null })
    const r = scoreOutcomes(
      [
        outcome(amb, { confidenceScore: 0.2 }), // vai para revisão: correto
        outcome(amb, { confidenceScore: 0.9 }), // seria classificada com confiança: erro
        outcome(c({ id: 'claro1' }), { confidenceScore: 0.3 }), // claro mas encaminhado: ruim
        outcome(c({ id: 'claro2' }), { confidenceScore: 0.9 }),
      ],
      0.5,
    )
    expect(r.ambiguousFlagged).toEqual({ correct: 1, total: 2, rate: 0.5 })
    expect(r.clearWronglyFlagged).toEqual({ correct: 1, total: 2, rate: 0.5 })
    expect(r.sector.total).toBe(2) // ambíguas não entram na acurácia de setor
  })

  it('erros de chamada contam à parte e não distorcem as taxas', () => {
    const r = scoreOutcomes([outcome(c()), { case: c({ id: 'falhou' }), error: 'timeout', ms: 30000 }], 0.5)
    expect(r.errors).toBe(1)
    expect(r.sector.total).toBe(1)
    expect(r.failures).toContainEqual({ id: 'falhou', reason: 'erro: timeout' })
    expect(r.latency.max).toBe(30000)
  })

  it('matriz de confusão por setor esperado', () => {
    const r = scoreOutcomes(
      [outcome(c()), outcome(c(), { sector: 'SALES' }), outcome(c({ expectedSectors: ['STOCK'] }), { sector: 'STOCK' })],
      0.5,
    )
    expect(r.confusion).toEqual({ FINANCIAL: { FINANCIAL: 1, SALES: 1 }, STOCK: { STOCK: 1 } })
  })

  it('sem casos: taxas nulas, sem divisão por zero', () => {
    const r = scoreOutcomes([], 0.5)
    expect(r.sector.rate).toBeNull()
    expect(r.latency.p95).toBeNull()
  })

  it('formatReport mostra as taxas e lista as divergências', () => {
    const text = formatReport(scoreOutcomes([outcome(c({ id: 'b' }), { sector: 'SALES' })], 0.5), 'Teste')
    expect(text).toContain('Teste')
    expect(text).toContain('setor correto')
    expect(text).toContain('b: setor SALES, esperado FINANCIAL')
  })
})

describe('eval/cases.json', () => {
  const cases = z.array(EvalCaseSchema).parse(JSON.parse(readFileSync(path.join(import.meta.dirname, '../eval/cases.json'), 'utf8')))

  it('é válido, com ids únicos e cobertura de todos os setores, ambíguas e injeção', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30)
    expect(new Set(cases.map((x) => x.id)).size).toBe(cases.length)
    for (const s of ['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES'] as const) {
      expect(cases.filter((x) => x.expectedSectors?.length === 1 && x.expectedSectors[0] === s).length).toBeGreaterThanOrEqual(6)
    }
    expect(cases.filter((x) => x.expectedSectors === null).length).toBeGreaterThanOrEqual(3)
    expect(cases.filter((x) => x.id.startsWith('inj-')).length).toBeGreaterThanOrEqual(2)
    for (const sent of ['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL'] as const) {
      expect(cases.some((x) => x.expectedSentiment === sent)).toBe(true)
    }
  })

  it('o harness roda de ponta a ponta com o classificador fake, sem rede', async () => {
    const fake = new FakeClassifier()
    const outcomes = await Promise.all(cases.map(async (cs) => ({ case: cs, result: await fake.classify(cs.text), ms: 1 })))
    const report = scoreOutcomes(outcomes, 0.5)
    expect(report.total).toBe(cases.length)
    expect(report.errors).toBe(0)
    expect(report.sector.rate).toBeGreaterThan(0.5) // o fake é uma heurística razoável nos casos claros
  })
})
