import { z } from 'zod'
import { SectorSchema, SentimentSchema } from './classification.js'

export const StatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])

export const MessageDtoSchema = z.object({
  id: z.string(),
  customerName: z.string(),
  rawContent: z.string(),
  assignedSector: SectorSchema.nullable(),
  sentiment: SentimentSchema.nullable(),
  urgencyScore: z.number().nullable(),
  confidenceScore: z.number().nullable(),
  summary: z.string().nullable(),
  suggestedAction: z.string().nullable(),
  correctedSector: SectorSchema.nullable(),
  status: StatusSchema,
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  model: z.string().nullable(),
})
export type MessageDto = z.infer<typeof MessageDtoSchema>

export const CreateMessageBody = z.object({
  customerName: z.string().trim().min(1).max(200),
  rawContent: z.string().trim().min(1).max(5000),
})

export const CorrectionBody = z.object({ correctedSector: SectorSchema })
export const IdParams = z.object({ id: z.string().uuid() })

export const MetricsDtoSchema = z.object({
  total: z.number(),
  sentiments: z.object({ CALM: z.number(), NEUTRAL: z.number(), ANGRY: z.number(), CRITICAL: z.number() }),
  corrected: z.number(),
  completed: z.number(),
  resolved: z.number(),
  accuracy: z.number().nullable(),
})
export type MetricsDto = z.infer<typeof MetricsDtoSchema>

export const MessageEventSchema = z.object({
  type: z.enum(['message.created', 'message.updated']),
  message: MessageDtoSchema,
})
export type MessageEvent = z.infer<typeof MessageEventSchema>
