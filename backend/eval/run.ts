import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { loadConfig } from '../src/config.js'
import { createClassifier } from '../src/llm/index.js'
import type { LlmClassifier } from '../src/llm/types.js'
import { EvalCaseSchema, formatReport, scoreOutcomes, type EvalCase, type EvalOutcome } from './metrics.js'

// Uso: npm run eval [-- --concurrency 4 --limit 10]
// Lê LLM_PROVIDER, ANTHROPIC_API_KEY etc. do ambiente ou de backend/.env. Faz uma chamada por caso.
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  const n = i >= 0 ? Number(process.argv[i + 1]) : fallback
  return Number.isFinite(n) && n > 0 ? n : fallback
}

async function runCase(classifier: LlmClassifier, c: EvalCase): Promise<EvalOutcome> {
  const started = Date.now()
  try {
    return { case: c, result: await classifier.classify(c.text), ms: Date.now() - started }
  } catch (err) {
    return { case: c, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started }
  }
}

async function main() {
  const config = loadConfig()
  const classifier = createClassifier(config)
  const all = z.array(EvalCaseSchema).parse(JSON.parse(await readFile(path.join(import.meta.dirname, 'cases.json'), 'utf8')))
  const cases = all.slice(0, arg('limit', all.length))
  const concurrency = arg('concurrency', 4)

  console.log(`Avaliando ${cases.length} casos com ${classifier.name} (concorrência ${concurrency})...`)
  const outcomes: EvalOutcome[] = new Array(cases.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
      while (next < cases.length) {
        const i = next++
        outcomes[i] = await runCase(classifier, cases[i]!)
        process.stdout.write('.')
      }
    }),
  )
  process.stdout.write('\n\n')

  const report = scoreOutcomes(outcomes, config.CONFIDENCE_THRESHOLD)
  console.log(formatReport(report, `Avaliação: ${classifier.name}`))

  const dir = path.join(import.meta.dirname, 'results')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${classifier.name.replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeFile(file, JSON.stringify({ classifier: classifier.name, threshold: config.CONFIDENCE_THRESHOLD, report, outcomes }, null, 2))
  console.log(`\nResultado completo salvo em ${path.relative(process.cwd(), file)}`)
  if (report.errors > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
