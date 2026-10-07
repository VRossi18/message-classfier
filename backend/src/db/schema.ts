import { decimal, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const sectorEnum = pgEnum('sector', ['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'HUMAN_REVIEW'])
export const sentimentEnum = pgEnum('sentiment', ['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL'])
export const statusEnum = pgEnum('message_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerName: text('customer_name').notNull(),
  rawContent: text('raw_content').notNull(),

  // Preenchidos após o processamento da LLM
  assignedSector: sectorEnum('assigned_sector'),
  sentiment: sentimentEnum('sentiment'),
  urgencyScore: decimal('urgency_score', { precision: 3, scale: 2 }), // 0.00 a 1.00
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }),
  summary: text('summary'),
  suggestedAction: text('suggested_action'),
  // Quem classificou (provedor:modelo), para auditoria e comparação entre modelos.
  classifier: text('classifier'),

  // Feedback humano (human-in-the-loop)
  correctedSector: sectorEnum('corrected_sector'),

  status: statusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),

  // Dar baixa no atendimento: propriedade ortogonal ao processamento (não altera `status`).
  resolvedAt: timestamp('resolved_at'),
})

export type MessageRow = typeof messages.$inferSelect
