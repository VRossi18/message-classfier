import type { ClassificationResult } from '../schemas/classification.js'

export interface LlmClassifier {
  classify(rawContent: string): Promise<ClassificationResult>
}
