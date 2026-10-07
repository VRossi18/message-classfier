import type { ClassificationResult } from '../schemas/classification.js'

export interface LlmClassifier {
  /** Identifica quem classificou (gravado na mensagem), ex.: "anthropic:claude-haiku-4-5-20251001". */
  readonly name: string
  classify(rawContent: string): Promise<ClassificationResult>
}
