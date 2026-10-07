import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import type { Message } from '@/lib/schemas'
import { applyEvent, messagesKey, metricsKey, useCreateMessage, useResolveMessage } from './useMessages'

const base: Message = {
  id: 'm1', customerName: 'Ana', rawContent: 'boleto', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00Z', processedAt: null, resolvedAt: null,
}
const completed: Message = {
  ...base, status: 'COMPLETED', assignedSector: 'FINANCIAL', sentiment: 'NEUTRAL',
  urgencyScore: 0.3, confidenceScore: 0.9, processedAt: '2026-01-01T00:00:01Z',
}

afterEach(() => vi.restoreAllMocks())

describe('applyEvent: eventos fora de ordem', () => {
  it('um estado mais antigo nunca sobrescreve um mais avançado', () => {
    const list = [completed]
    expect(applyEvent(list, { type: 'message.created', message: base })).toBe(list)
    expect(applyEvent(list, { type: 'message.updated', message: { ...base, status: 'PROCESSING' } })).toBe(list)
    expect(applyEvent([{ ...base, status: 'PROCESSING' }], { type: 'message.created', message: base })[0]?.status).toBe(
      'PROCESSING',
    )
  })

  it('avança normalmente e aceita eventos da mesma etapa (correção de setor)', () => {
    expect(applyEvent([base], { type: 'message.updated', message: completed })[0]?.status).toBe('COMPLETED')
    const corrected = { ...completed, correctedSector: 'SALES' as const }
    expect(applyEvent([completed], { type: 'message.updated', message: corrected })[0]?.correctedSector).toBe('SALES')
    const failed = { ...base, status: 'FAILED' as const }
    expect(applyEvent([{ ...base, status: 'PROCESSING' }], { type: 'message.updated', message: failed })[0]?.status).toBe(
      'FAILED',
    )
  })

  it('mensagem desconhecida entra no topo da lista', () => {
    const other = { ...base, id: 'm2' }
    expect(applyEvent([base], { type: 'message.created', message: other }).map((m) => m.id)).toEqual(['m2', 'm1'])
  })
})

describe('useCreateMessage', () => {
  it('regressão: SSE conclui antes da resposta do POST, o card não volta para "Na fila"', async () => {
    let resolvePost!: (m: Message) => void
    vi.spyOn(api, 'createMessage').mockReturnValue(new Promise((r) => (resolvePost = r)))

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData<Message[]>(messagesKey, [])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCreateMessage(), { wrapper })

    act(() => result.current.mutate({ customerName: 'Ana', rawContent: 'boleto' }))

    // o worker termina e o SSE entrega COMPLETED enquanto o POST ainda não foi processado
    act(() => {
      client.setQueryData<Message[]>(messagesKey, (old) =>
        applyEvent(old, { type: 'message.updated', message: completed }),
      )
    })
    // só então chega a resposta do POST, que é um retrato PENDING mais antigo
    await act(async () => resolvePost(base))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getQueryData<Message[]>(messagesKey)).toEqual([completed])
  })

  it('caminho normal: a resposta do POST entra na lista quando o SSE ainda não chegou', async () => {
    vi.spyOn(api, 'createMessage').mockResolvedValue(base)
    const client = new QueryClient()
    client.setQueryData<Message[]>(messagesKey, [])
    const { result } = renderHook(() => useCreateMessage(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    await act(async () => result.current.mutate({ customerName: 'Ana', rawContent: 'boleto' }))
    await waitFor(() => expect(client.getQueryData<Message[]>(messagesKey)).toEqual([base]))
  })
})

describe('useResolveMessage', () => {
  const setup = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData<Message[]>(messagesKey, [completed])
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useResolveMessage(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    return { client, result, invalidate }
  }
  const stored = (client: QueryClient) => client.getQueryData<Message[]>(messagesKey)![0]!

  it('resolve de forma otimista (antes da resposta) e depois reconcilia com o servidor', async () => {
    let finish!: (m: Message) => void
    vi.spyOn(api, 'resolveMessage').mockReturnValue(new Promise((r) => (finish = r)))
    const { client, result, invalidate } = setup()

    act(() => result.current.mutate({ id: 'm1', resolved: true }))
    await waitFor(() => expect(stored(client).resolvedAt).toEqual(expect.any(String))) // sem esperar a rede

    await act(async () => finish({ ...completed, resolvedAt: '2026-01-02T09:00:00Z' }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.resolveMessage).toHaveBeenCalledWith('m1')
    // reconcilia: relê a lista e as métricas, pois SSE e HTTP podem chegar fora de ordem
    expect(invalidate).toHaveBeenCalledWith({ queryKey: messagesKey })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: metricsKey })
  })

  it('reabrir chama a API de reabrir e zera resolvedAt', async () => {
    vi.spyOn(api, 'reopenMessage').mockResolvedValue(completed)
    const resolveSpy = vi.spyOn(api, 'resolveMessage')
    const { client, result } = setup()
    client.setQueryData<Message[]>(messagesKey, [{ ...completed, resolvedAt: '2026-01-02T09:00:00Z' }])
    await act(async () => result.current.mutate({ id: 'm1', resolved: false }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.reopenMessage).toHaveBeenCalledWith('m1')
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it('em caso de erro desfaz a atualização otimista', async () => {
    vi.spyOn(api, 'resolveMessage').mockRejectedValue(new Error('409'))
    const { client, result } = setup()
    await act(async () => result.current.mutate({ id: 'm1', resolved: true }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(stored(client).resolvedAt).toBeNull()
  })
})
