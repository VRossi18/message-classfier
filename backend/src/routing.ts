import type { ClassificationResult, Sector } from './schemas/classification.js'

/** Classificações com baixa confiança vão para revisão humana. */
export function routeSector(result: ClassificationResult, threshold: number): Sector {
  return result.confidenceScore < threshold ? 'HUMAN_REVIEW' : result.sector
}
