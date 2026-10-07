import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import type { Message } from './schemas'

const msg: Message = {
  id: '1', customerName: 'A', rawContent: 'x', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00Z', processedAt: null,
}

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('listMessages faz GET e valida a lista', async () => {
    fetchMock.mockReturnValue(json([msg]))
    await expect(api.listMessages()).resolves.toEqual([msg])
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/messages')
  })

  it('createMessage faz POST com JSON e cabeçalho Content-Type', async () => {
    fetchMock.mockReturnValue(json(msg))
    await api.createMessage({ customerName: 'A', rawContent: 'x' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/messages')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ customerName: 'A', rawContent: 'x' })
  })

  it('correctSector faz PATCH na rota de correção', async () => {
    fetchMock.mockReturnValue(json({ ...msg, correctedSector: 'SALES' }))
    const r = await api.correctSector('abc', 'SALES')
    expect(r.correctedSector).toBe('SALES')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/messages/abc/correction')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ correctedSector: 'SALES' })
  })

  it('getMetrics valida o formato', async () => {
    const metrics = { total: 1, sentiments: { CALM: 1, NEUTRAL: 0, ANGRY: 0, CRITICAL: 0 }, corrected: 0, completed: 1, accuracy: 1 }
    fetchMock.mockReturnValue(json(metrics))
    await expect(api.getMetrics()).resolves.toEqual(metrics)
  })

  it('lança erro com o status quando !ok', async () => {
    fetchMock.mockReturnValue(json({}, 503))
    await expect(api.listMessages()).rejects.toThrow('503')
  })

  it('rejeita resposta fora do schema (ZodError)', async () => {
    fetchMock.mockReturnValue(json([{ id: 1 }]))
    await expect(api.listMessages()).rejects.toThrow()
    fetchMock.mockReturnValue(json({ ...msg, status: 'WAT' }))
    await expect(api.createMessage({ customerName: 'A', rawContent: 'x' })).rejects.toThrow()
  })

  it('eventsUrl aponta para /api/events', () => {
    expect(api.eventsUrl()).toBe('/api/events')
  })
})
