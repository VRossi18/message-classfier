import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { messages, type MessageRow } from '../db/schema.js'
import type { MessageDto, MetricsDto } from '../schemas/api.js'
import type { ClassificationResult, Sector } from '../schemas/classification.js'

const num = (v: string | null) => (v === null ? null : Number(v))

export function toDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    customerName: row.customerName,
    rawContent: row.rawContent,
    assignedSector: row.assignedSector,
    sentiment: row.sentiment,
    urgencyScore: num(row.urgencyScore),
    confidenceScore: num(row.confidenceScore),
    summary: row.summary,
    suggestedAction: row.suggestedAction,
    correctedSector: row.correctedSector,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    model: row.classifier,
  }
}

export function createMessagesRepo(db: Db) {
  return {
    async insert(input: { customerName: string; rawContent: string }): Promise<MessageRow> {
      const [row] = await db.insert(messages).values(input).returning()
      if (!row) throw new Error('Falha ao inserir mensagem')
      return row
    },

    list: (): Promise<MessageRow[]> => db.select().from(messages).orderBy(desc(messages.createdAt)),

    async getById(id: string): Promise<MessageRow | undefined> {
      const [row] = await db.select().from(messages).where(eq(messages.id, id))
      return row
    },

    async setStatus(id: string, status: MessageRow['status']): Promise<MessageRow | undefined> {
      const [row] = await db.update(messages).set({ status }).where(eq(messages.id, id)).returning()
      return row
    },

    async applyClassification(
      id: string,
      result: ClassificationResult,
      sector: Sector,
      classifier: string,
    ): Promise<MessageRow | undefined> {
      const [row] = await db
        .update(messages)
        .set({
          assignedSector: sector,
          sentiment: result.sentiment,
          urgencyScore: result.urgencyScore.toFixed(2),
          confidenceScore: result.confidenceScore.toFixed(2),
          summary: result.summary,
          suggestedAction: result.suggestedAction,
          classifier,
          status: 'COMPLETED',
          processedAt: new Date(),
        })
        .where(eq(messages.id, id))
        .returning()
      return row
    },

    async correctSector(id: string, sector: Sector): Promise<MessageRow | undefined> {
      const [row] = await db.update(messages).set({ correctedSector: sector }).where(eq(messages.id, id)).returning()
      return row
    },

    /** Só a transição aberta → resolvida grava `resolved_at`; repetir não altera a data original. */
    async resolve(id: string): Promise<MessageRow | undefined> {
      const [row] = await db
        .update(messages)
        .set({ resolvedAt: sql`coalesce(${messages.resolvedAt}, now())` })
        .where(eq(messages.id, id))
        .returning()
      return row
    },

    async reopen(id: string): Promise<MessageRow | undefined> {
      const [row] = await db.update(messages).set({ resolvedAt: null }).where(eq(messages.id, id)).returning()
      return row
    },

    async metrics(): Promise<MetricsDto> {
      const [r] = await db
        .select({
          total: sql<number>`count(*)::int`,
          calm: sql<number>`count(*) filter (where ${messages.sentiment} = 'CALM')::int`,
          neutral: sql<number>`count(*) filter (where ${messages.sentiment} = 'NEUTRAL')::int`,
          angry: sql<number>`count(*) filter (where ${messages.sentiment} = 'ANGRY')::int`,
          critical: sql<number>`count(*) filter (where ${messages.sentiment} = 'CRITICAL')::int`,
          completed: sql<number>`count(*) filter (where ${messages.status} = 'COMPLETED')::int`,
          resolved: sql<number>`count(*) filter (where ${messages.resolvedAt} is not null)::int`,
          corrected: sql<number>`count(*) filter (where ${messages.status} = 'COMPLETED' and ${messages.correctedSector} is not null and ${messages.correctedSector} is distinct from ${messages.assignedSector})::int`,
        })
        .from(messages)
      const m = r ?? { total: 0, calm: 0, neutral: 0, angry: 0, critical: 0, completed: 0, resolved: 0, corrected: 0 }
      return {
        total: m.total,
        sentiments: { CALM: m.calm, NEUTRAL: m.neutral, ANGRY: m.angry, CRITICAL: m.critical },
        completed: m.completed,
        resolved: m.resolved,
        corrected: m.corrected,
        accuracy: m.completed === 0 ? null : 1 - m.corrected / m.completed,
      }
    },
  }
}

export type MessagesRepo = ReturnType<typeof createMessagesRepo>
