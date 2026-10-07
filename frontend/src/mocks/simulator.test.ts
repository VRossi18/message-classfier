import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACTION } from '@/lib/sectors'
import {
  correctSector,
  createMessage,
  getMetrics,
  listMessages,
  reopenMessage,
  resolveMessage,
  subscribe,
  summarize,
} from './simulator'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0) // classificação em 1800ms, confiança 0.8
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function classify(text: string) {
  const m = createMessage({ customerName: 'T', rawContent: text })
  await vi.advanceTimersByTimeAsync(3000)
  return listMessages().find((x) => x.id === m.id)!
}

describe('simulador: ciclo de vida', () => {
  it('PENDING -> PROCESSING -> COMPLETED emitindo eventos', async () => {
    const events: string[] = []
    const off = subscribe((e) => events.push(`${e.type}:${e.message.status}`))
    const created = createMessage({ customerName: 'Ana', rawContent: 'boleto' })
    expect(created.status).toBe('PENDING')
    expect(created.assignedSector).toBeNull()
    await vi.advanceTimersByTimeAsync(600)
    expect(events).toEqual(['message.created:PENDING', 'message.updated:PROCESSING'])
    await vi.advanceTimersByTimeAsync(1300)
    expect(events.at(-1)).toBe('message.updated:COMPLETED')
    const done = listMessages().find((m) => m.id === created.id)!
    expect(done.processedAt).not.toBeNull()
    expect(done.confidenceScore).toBeCloseTo(0.8)
    off()
  })

  it('unsubscribe para de receber eventos', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    off()
    createMessage({ customerName: 'A', rawContent: 'x' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('listMessages ordena da mais recente para a mais antiga', () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const a = createMessage({ customerName: 'A', rawContent: 'x' })
    vi.setSystemTime(new Date('2030-01-01T00:00:05Z'))
    const b = createMessage({ customerName: 'B', rawContent: 'x' })
    const ids = listMessages().map((m) => m.id)
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id))
  })
})

describe('simulador: regras de classificação', () => {
  it.each([
    ['segunda via do boleto', 'FINANCIAL'],
    ['qual o prazo de entrega?', 'STOCK'],
    ['quero um orçamento', 'SALES'],
    ['o login deu erro', 'SUPPORT'],
  ])('setor de "%s" = %s', async (text, sector) => {
    const m = await classify(text)
    expect(m.assignedSector).toBe(sector)
    expect(m.sentiment).toBe('NEUTRAL')
    expect(m.urgencyScore).toBe(0.25)
    expect(m.suggestedAction).toBe(DEFAULT_ACTION[sector as keyof typeof DEFAULT_ACTION])
  })

  it('sem palavra-chave: HUMAN_REVIEW, CALM, confiança 0.4', async () => {
    const m = await classify('Bom dia, tudo bem?')
    expect(m.assignedSector).toBe('HUMAN_REVIEW')
    expect(m.sentiment).toBe('CALM')
    expect(m.confidenceScore).toBe(0.4)
  })

  it('palavras críticas + raiva = CRITICAL com ação de revisão humana', async () => {
    const m = await classify('ISSO É UM ABSURDO!! cobrança errada, vou ao Procon')
    expect(m.sentiment).toBe('CRITICAL')
    expect(m.urgencyScore).toBe(0.95)
    expect(m.assignedSector).toBe('FINANCIAL')
    expect(m.suggestedAction).toBe(DEFAULT_ACTION.HUMAN_REVIEW)
  })

  it('caixa alta sem termo crítico = ANGRY', async () => {
    const m = await classify('ESTOU MUITO IRRITADO COM VOCES')
    expect(m.sentiment).toBe('ANGRY')
    expect(m.urgencyScore).toBe(0.75)
  })

  it('termo de raiva sem caixa alta = ANGRY', async () => {
    expect((await classify('que serviço ridículo')).sentiment).toBe('ANGRY')
  })

  it('em empate de regras vale a ordem (financeiro antes de estoque)', async () => {
    expect((await classify('boleto e prazo de entrega')).assignedSector).toBe('FINANCIAL')
  })

  it('resumo mantém textos de até 140 chars e abrevia os maiores em fronteira de palavra', async () => {
    expect((await classify('curto')).summary).toBe('curto')
    const meio = 'Preciso da segunda via do boleto, venceu ontem e não consegui pagar a tempo por causa do sistema.'
    expect((await classify(meio)).summary).toBe(meio) // 97 chars: antes era cortado em 80

    const longo = 'palavra '.repeat(40)
    const s = (await classify(longo)).summary!
    expect(s.length).toBeLessThanOrEqual(140)
    expect(s.endsWith('palavra…')).toBe(true)
    expect(summarize('a'.repeat(200))).toHaveLength(140) // sem espaços: corta seco
  })
})

describe('simulador: correção e métricas', () => {
  it('correctSector atualiza, emite evento e retorna cópia', async () => {
    const m = await classify('boleto')
    const fn = vi.fn()
    const off = subscribe(fn)
    const r = correctSector(m.id, 'SALES')
    expect(r?.correctedSector).toBe('SALES')
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ type: 'message.updated' }))
    off()
  })

  it('correctSector com id inexistente retorna null', () => {
    expect(correctSector('nope', 'SALES')).toBeNull()
  })

  it('getMetrics reflete as mensagens', async () => {
    const before = getMetrics()
    const m = await classify('boleto')
    correctSector(m.id, 'SALES')
    const after = getMetrics()
    expect(after.total).toBe(before.total + 1)
    expect(after.corrected).toBe(before.corrected + 1)
  })
})

describe('simulador: resolver e reabrir (mesmas regras do backend)', () => {
  it('resolve uma concluída, emite message.updated e conta nas métricas', async () => {
    const m = await classify('boleto')
    const fn = vi.fn()
    const off = subscribe(fn)
    const before = getMetrics().resolved
    const r = resolveMessage(m.id)
    expect(r.ok && r.message.resolvedAt).toEqual(expect.any(String))
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ type: 'message.updated' }))
    expect(getMetrics().resolved).toBe(before + 1)
    off()
  })

  it('é idempotente: repetir mantém a data e não emite de novo', async () => {
    const m = await classify('boleto')
    const first = resolveMessage(m.id)
    const fn = vi.fn()
    const off = subscribe(fn)
    const again = resolveMessage(m.id)
    expect(again.ok && first.ok && again.message.resolvedAt).toBe(first.ok && first.message.resolvedAt)
    expect(fn).not.toHaveBeenCalled()
    off()
  })

  it('não resolve mensagem ainda na fila (not_completed) nem inexistente (not_found)', () => {
    const pending = createMessage({ customerName: 'P', rawContent: 'boleto' })
    expect(resolveMessage(pending.id)).toEqual({ ok: false, reason: 'not_completed' })
    expect(resolveMessage('nope')).toEqual({ ok: false, reason: 'not_found' })
    expect(reopenMessage('nope')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('reabre uma resolvida e é idempotente numa já aberta', async () => {
    const m = await classify('boleto')
    resolveMessage(m.id)
    const fn = vi.fn()
    const off = subscribe(fn)
    const r = reopenMessage(m.id)
    expect(r.ok && r.message.resolvedAt).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
    reopenMessage(m.id)
    expect(fn).toHaveBeenCalledTimes(1)
    off()
  })
})
