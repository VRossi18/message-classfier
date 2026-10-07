import type { Message, Sector, Sentiment } from './schemas'

export type ColumnId = 'FINANCIAL' | 'STOCK' | 'SUPPORT' | 'SALES' | 'URGENT'

export const COLUMNS: { id: ColumnId; label: string; accent: string }[] = [
  { id: 'FINANCIAL', label: 'Financeiro', accent: 'bg-emerald-500' },
  { id: 'STOCK', label: 'Estoque', accent: 'bg-amber-500' },
  { id: 'SUPPORT', label: 'Suporte', accent: 'bg-sky-500' },
  { id: 'SALES', label: 'Vendas', accent: 'bg-violet-500' },
  { id: 'URGENT', label: 'Urgente', accent: 'bg-rose-500' },
]

export const SECTOR_LABEL: Record<Sector, string> = {
  FINANCIAL: 'Financeiro',
  STOCK: 'Estoque',
  SUPPORT: 'Suporte',
  SALES: 'Vendas',
  HUMAN_REVIEW: 'Revisão humana',
}

export const DEFAULT_ACTION: Record<Sector, string> = {
  FINANCIAL: 'Gerar segunda via ou consultar gateway.',
  STOCK: 'Consultar sistema de inventário/ERP.',
  SUPPORT: 'Abrir ticket técnico de atendimento.',
  SALES: 'Encaminhar ao time comercial.',
  HUMAN_REVIEW: 'Alertar gerente de contas imediatamente.',
}

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  CALM: 'Calmo',
  NEUTRAL: 'Neutro',
  ANGRY: 'Irritado',
  CRITICAL: 'Crítico',
}

export const SENTIMENT_STYLE: Record<Sentiment, string> = {
  CALM: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  NEUTRAL: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  ANGRY: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  CRITICAL: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}

/** Setor efetivo: a correção humana prevalece sobre a classificação da IA. */
export function effectiveSector(m: Message): Sector | null {
  return m.correctedSector ?? m.assignedSector
}

/**
 * Coluna do Kanban. "Urgente" reúne sentimento CRITICAL ou setor HUMAN_REVIEW;
 * mensagens ainda sem classificação ficam fora do quadro (null) e aparecem
 * como "em triagem" na fila de entrada.
 */
export function columnFor(m: Message): ColumnId | null {
  const sector = effectiveSector(m)
  if (m.sentiment === 'CRITICAL' || sector === 'HUMAN_REVIEW') return 'URGENT'
  return sector
}

/** Baixa urgência não deve parecer alarme: verde → âmbar → vermelho. */
export function urgencyColor(percent: number): string {
  if (percent >= 70) return 'bg-rose-500'
  if (percent >= 40) return 'bg-amber-500'
  return 'bg-emerald-500'
}
