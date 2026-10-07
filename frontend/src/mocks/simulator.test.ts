import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACTION } from '@/lib/sectors'
import { correctSector, createMessage, getMetrics, listMessages, subscribe } from './simulator'

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

  it('resumo trunca textos longos em 80 chars', async () => {
    const m = await classify('a'.repeat(200))
    expect(m.summary).toHaveLength(80)
    expect(m.summary!.endsWith('...')).toBe(true)
    expect((await classify('curto')).summary).toBe('curto')
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
