import { z } from 'zod'
import type { ClassificationResult, Sentiment } from '../src/schemas/classification.js'
import { SentimentSchema } from '../src/schemas/classification.js'

export const EvalCaseSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** Setores aceitáveis; `null` = ambígua, o ideal é a confiança ficar abaixo do limite (revisão humana). */
  expectedSectors: z.array(z.enum(['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES'])).min(1).nullable(),
  expectedSentiment: SentimentSchema,
  note: z.string().optional(),
})
export type EvalCase = z.infer<typeof EvalCaseSchema>

export interface EvalOutcome {
  case: EvalCase
  result?: ClassificationResult
  error?: string
  ms: number
}

export interface Ratio {
  correct: number
  total: number
  /** 0..1, ou null quando não há casos. */
  rate: number | null
}

export interface EvalReport {
  total: number
  errors: number
  /** Só casos com setor esperado. */
  sector: Ratio
  /** Exato: CALM, NEUTRAL, ANGRY e CRITICAL. */
  sentimentStrict: Ratio
  /** Tolerante: tranquilo (CALM, NEUTRAL) contra hostil (ANGRY, CRITICAL). */
  sentimentTolerant: Ratio
  /** Casos ambíguos que ficaram abaixo do limite de confiança (iriam para revisão humana). */
  ambiguousFlagged: Ratio
  /** Casos claros que, por baixa confiança, iriam para revisão humana sem necessidade. */
  clearWronglyFlagged: Ratio
  /** confusion[esperado][previsto], só casos com um único setor aceitável. */
  confusion: Record<string, Record<string, number>>
  latency: { p50: number | null; p95: number | null; max: number | null }
  failures: { id: string; reason: string }[]
}

const ratio = (correct: number, total: number): Ratio => ({ correct, total, rate: total === 0 ? null : correct / total })

/** Percentil por posto mais próximo (suficiente para dezenas de amostras). */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank] ?? null
}

const hostile = (s: Sentiment) => s === 'ANGRY' || s === 'CRITICAL'

export function scoreOutcomes(outcomes: EvalOutcome[], confidenceThreshold: number): EvalReport {
  const sector = { c: 0, t: 0 }
  const strict = { c: 0, t: 0 }
  const tolerant = { c: 0, t: 0 }
  const ambiguous = { c: 0, t: 0 }
  const clearFlagged = { c: 0, t: 0 }
  const confusion: EvalReport['confusion'] = {}
  const failures: EvalReport['failures'] = []
  const latencies: number[] = []
  let errors = 0

  for (const o of outcomes) {
    latencies.push(o.ms)
    if (!o.result) {
      errors++
      failures.push({ id: o.case.id, reason: `erro: ${o.error ?? 'sem resultado'}` })
      continue
    }
    const { result } = o
    const exp = o.case

    strict.t++
    if (result.sentiment === exp.expectedSentiment) strict.c++
    else failures.push({ id: exp.id, reason: `sentimento ${result.sentiment}, esperado ${exp.expectedSentiment}` })
    tolerant.t++
    if (hostile(result.sentiment) === hostile(exp.expectedSentiment)) tolerant.c++

    const flagged = result.confidenceScore < confidenceThreshold
    if (exp.expectedSectors === null) {
      ambiguous.t++
      if (flagged) ambiguous.c++
      else failures.push({ id: exp.id, reason: `ambígua com confiança ${result.confidenceScore} (>= ${confidenceThreshold}): não iria para revisão` })
      continue
    }

    sector.t++
    if (exp.expectedSectors.includes(result.sector)) sector.c++
    else failures.push({ id: exp.id, reason: `setor ${result.sector}, esperado ${exp.expectedSectors.join(' ou ')}` })

    clearFlagged.t++
    if (flagged) {
      clearFlagged.c++
      failures.push({ id: exp.id, reason: `caso claro com confiança baixa (${result.confidenceScore}): iria para revisão` })
    }

    if (exp.expectedSectors.length === 1) {
      const row = (confusion[exp.expectedSectors[0]!] ??= {})
      row[result.sector] = (row[result.sector] ?? 0) + 1
    }
  }

  return {
    total: outcomes.length,
    errors,
    sector: ratio(sector.c, sector.t),
    sentimentStrict: ratio(strict.c, strict.t),
    sentimentTolerant: ratio(tolerant.c, tolerant.t),
    ambiguousFlagged: ratio(ambiguous.c, ambiguous.t),
    clearWronglyFlagged: ratio(clearFlagged.c, clearFlagged.t),
    confusion,
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: percentile(latencies, 100) },
    failures,
  }
}

const pct = (r: Ratio) => (r.rate === null ? '—' : `${(r.rate * 100).toFixed(1)}% (${r.correct}/${r.total})`)

/** Texto legível para o terminal. */
export function formatReport(report: EvalReport, header: string): string {
  const lines = [
    header,
    '='.repeat(header.length),
    `casos: ${report.total}   erros de chamada: ${report.errors}`,
    `setor correto ................ ${pct(report.sector)}`,
    `sentimento exato ............. ${pct(report.sentimentStrict)}`,
    `sentimento tolerante ......... ${pct(report.sentimentTolerant)}   (tranquilo x hostil)`,
    `ambíguas p/ revisão humana ... ${pct(report.ambiguousFlagged)}   (quanto maior, melhor)`,
    `claros enviados à revisão .... ${pct(report.clearWronglyFlagged)}   (quanto menor, melhor)`,
    `latência ms .................. p50 ${report.latency.p50 ?? '—'}  p95 ${report.latency.p95 ?? '—'}  máx ${report.latency.max ?? '—'}`,
    '',
    'confusão de setor (linha = esperado, coluna = previsto):',
  ]
  const cols = ['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES']
  lines.push(`${''.padEnd(11)}${cols.map((c) => c.padStart(10)).join('')}`)
  for (const exp of cols) {
    const row = report.confusion[exp] ?? {}
    lines.push(`${exp.padEnd(11)}${cols.map((c) => String(row[c] ?? 0).padStart(10)).join('')}`)
  }
  if (report.failures.length > 0) {
    lines.push('', 'divergências:')
    for (const f of report.failures) lines.push(`  - ${f.id}: ${f.reason}`)
  }
  return lines.join('\n')
}
