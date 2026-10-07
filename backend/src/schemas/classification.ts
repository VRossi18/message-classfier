import { z } from 'zod'

export const SECTORS = ['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'HUMAN_REVIEW'] as const
export const SENTIMENTS = ['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL'] as const

export const SectorSchema = z.enum(SECTORS)
export const SentimentSchema = z.enum(SENTIMENTS)
export type Sector = z.infer<typeof SectorSchema>
export type Sentiment = z.infer<typeof SentimentSchema>

export const ClassificationSchema = z.object({
  sector: z.enum(['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES']),
  sentiment: SentimentSchema,
  urgencyScore: z.number().min(0).max(1).describe('Pontuação de urgência de 0 a 1'),
  confidenceScore: z.number().min(0).max(1).describe('Confiança da classificação de 0 a 1'),
  summary: z.string().describe('Resumo da demanda em uma única frase curta'),
  suggestedAction: z.string().describe('Ação recomendada para o atendente humano'),
})

export type ClassificationResult = z.infer<typeof ClassificationSchema>
