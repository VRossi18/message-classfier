import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CreateMessageInput, Message, MessageEvent, Sector } from '@/lib/schemas'

export const messagesKey = ['messages'] as const
export const metricsKey = ['metrics'] as const

/** Insere ou substitui a mensagem na lista, mantendo a mais recente primeiro. */
export function applyEvent(list: Message[] | undefined, e: MessageEvent): Message[] {
  const current = list ?? []
  const exists = current.some((m) => m.id === e.message.id)
  if (!exists) return [e.message, ...current]
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
