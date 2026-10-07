import { loadConfig } from '../src/config.js'
import { createClassifier } from '../src/llm/index.js'

// Uso: npm run llm:check [-- "texto da mensagem"]
// Uma única chamada real: confirma chave, modelo e formato estruturado em poucos segundos.
const text = process.argv[2] ?? 'Preciso da segunda via do boleto, venceu ontem e já recebi uma cobrança de multa.'

try {
  const config = loadConfig()
  const classifier = createClassifier(config)
  console.log(`Provedor: ${classifier.name}`)
  console.log(`Mensagem: ${text}`)
  const started = Date.now()
  const result = await classifier.classify(text)
  console.log(`\nOK em ${Date.now() - started} ms:`)
  console.log(JSON.stringify(result, null, 2))
} catch (err) {
  console.error(`\nFalhou: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
