import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateMessageInput, Message, MessageEvent, Sector } from '@/lib/schemas'

export const messagesKey = ['messages'] as const
export const metricsKey = ['metrics'] as const

/** Etapa do processamento; só avança (PENDING → PROCESSING → COMPLETED/FAILED). */
const STATUS_RANK: Record<Message['status'], number> = { PENDING: 0, PROCESSING: 1, COMPLETED: 2, FAILED: 2 }

/**
 * Insere ou substitui a mensagem na lista, mantendo a mais recente primeiro.
 *
 * Os dados chegam por dois caminhos sem ordem garantida entre si: o SSE e a resposta do POST.
 * O worker pode concluir (SSE `COMPLETED`) antes de a resposta do POST ser processada, e
 * aplicá-la por cima voltaria o card para "Na fila" para sempre. Por isso um evento mais
 * antigo (status de menor etapa) nunca substitui um dado mais avançado. Eventos da mesma
 * etapa substituem, o que mantém as correções de setor funcionando.
 */
export function applyEvent(list: Message[] | undefined, e: MessageEvent): Message[] {
  const current = list ?? []
  const existing = current.find((m) => m.id === e.message.id)
  if (!existing) return [e.message, ...current]
  if (STATUS_RANK[e.message.status] < STATUS_RANK[existing.status]) return current
  return current.map((m) => (m.id === e.message.id ? e.message : m))
}

export function useMessages() {
  return useQuery({ queryKey: messagesKey, queryFn: api.listMessages })
}

export function useMetrics() {
  return useQuery({ queryKey: metricsKey, queryFn: api.getMetrics })
}

export function useCreateMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMessageInput) => api.createMessage(input),
    onSuccess: (message) => {
      qc.setQueryData<Message[]>(messagesKey, (old) => applyEvent(old, { type: 'message.created', message }))
      qc.invalidateQueries({ queryKey: metricsKey })
    },
  })
}

/** Marca como resolvida (`resolved: true`) ou reabre (`false`), com atualização otimista. */
export function useResolveMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      resolved ? api.resolveMessage(id) : api.reopenMessage(id),
    onMutate: async ({ id, resolved }) => {
      await qc.cancelQueries({ queryKey: messagesKey })
      const previous = qc.getQueryData<Message[]>(messagesKey)
      const resolvedAt = resolved ? new Date().toISOString() : null
      qc.setQueryData<Message[]>(messagesKey, (old) => old?.map((m) => (m.id === id ? { ...m, resolvedAt } : m)))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(messagesKey, ctx.previous)
    },
    // Resolver e reabrir ficam no mesmo estágio (COMPLETED) e o SSE pode chegar fora de ordem
    // em relação à resposta HTTP: reler a lista garante que o cache converge para o servidor.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: messagesKey })
      qc.invalidateQueries({ queryKey: metricsKey })
    },
  })
}

export function useCorrectSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, sector }: { id: string; sector: Sector }) => api.correctSector(id, sector),
    onMutate: async ({ id, sector }) => {
      await qc.cancelQueries({ queryKey: messagesKey })
      const previous = qc.getQueryData<Message[]>(messagesKey)
      qc.setQueryData<Message[]>(messagesKey, (old) =>
        old?.map((m) => (m.id === id ? { ...m, correctedSector: sector } : m)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(messagesKey, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: metricsKey }),
  })
}
