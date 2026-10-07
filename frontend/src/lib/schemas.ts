import { z } from 'zod'

export const SectorSchema = z.enum(['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'HUMAN_REVIEW'])
export const SentimentSchema = z.enum(['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL'])
export const StatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])

export type Sector = z.infer<typeof SectorSchema>
export type Sentiment = z.infer<typeof SentimentSchema>
export type Status = z.infer<typeof StatusSchema>

export const MessageSchema = z.object({
  id: z.string(),
  customerName: z.string(),
  rawContent: z.string(),
  assignedSector: SectorSchema.nullable(),
  sentiment: SentimentSchema.nullable(),
  urgencyScore: z.number().min(0).max(1).nullable(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  summary: z.string().nullable(),
  suggestedAction: z.string().nullable(),
  correctedSector: SectorSchema.nullable(),
  status: StatusSchema,
  createdAt: z.string(),
  processedAt: z.string().nullable(),
})
export type Message = z.infer<typeof MessageSchema>

export const CreateMessageSchema = z.object({
  customerName: z.string().trim().min(1, 'Informe o nome do cliente'),
  rawContent: z.string().trim().min(1, 'Escreva a mensagem'),
})
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>

export const MetricsSchema = z.object({
  total: z.number(),
  sentiments: z.record(SentimentSchema, z.number()),
  corrected: z.number(),
  completed: z.number(),
  accuracy: z.number().nullable(), // 0..1, null enquanto não há concluídas
})
export type Metrics = z.infer<typeof MetricsSchema>

export const MessageEventSchema = z.object({
  type: z.enum(['message.created', 'message.updated']),
  message: MessageSchema,
})
export type MessageEvent = z.infer<typeof MessageEventSchema>
