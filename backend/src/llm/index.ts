import type { Config } from '../config.js'
import { AnthropicClassifier } from './anthropic.js'
import { FakeClassifier } from './fake.js'
import { OllamaClassifier } from './ollama.js'
import type { LlmClassifier } from './types.js'

export type { LlmClassifier } from './types.js'

export function createClassifier(config: Config): LlmClassifier {
  switch (config.LLM_PROVIDER) {
    case 'anthropic':
      return new AnthropicClassifier(config.ANTHROPIC_API_KEY ?? '', config.ANTHROPIC_MODEL)
    case 'ollama':
      return new OllamaClassifier(config.OLLAMA_URL, config.OLLAMA_MODEL)
    case 'fake':
      return new FakeClassifier()
  }
}
