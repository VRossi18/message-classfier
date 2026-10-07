import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import type { MessageRow } from '../src/db/schema.js'
import type { EventBus } from '../src/events/bus.js'
import { AnthropicClassifier } from '../src/llm/anthropic.js'
import { FakeClassifier } from '../src/llm/fake.js'
import { OllamaClassifier } from '../src/llm/ollama.js'
import type { MessagesRepo } from '../src/repo/messages.js'
import { toDto } from '../src/repo/messages.js'
import { routeSector } from '../src/routing.js'
import type { ClassificationResult } from '../src/schemas/classification.js'
import { markFailed, processMessage } from '../src/worker/processor.js'

const row: MessageRow = {
  id: '11111111-1111-4111-8111-111111111111',
  customerName: 'Ana',
  rawContent: 'Preciso da segunda via do boleto',
  assignedSector: null,
  sentiment: null,
  urgencyScore: null,
  confidenceScore: null,
  summary: null,
  suggestedAction: null,
  correctedSector: null,
  status: 'PENDING',
  createdAt: new Date('2026-01-01T10:00:00Z'),
  processedAt: null,
}

const good: ClassificationResult = {
  sector: 'FINANCIAL',
  sentiment: 'NEUTRAL',
  urgencyScore: 0.3,
  confidenceScore: 0.9,
  summary: 'Segunda via de boleto',
  suggestedAction: 'Gerar segunda via',
}

describe('toDto', () => {
  it('converte decimal em number e datas em ISO', () => {
    const dto = toDto({ ...row, urgencyScore: '0.75', confidenceScore: '0.90', processedAt: new Date('2026-01-01T10:01:00Z') })
    expect(dto.urgencyScore).toBe(0.75)
    expect(dto.confidenceScore).toBe(0.9)
    expect(dto.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(dto.processedAt).toBe('2026-01-01T10:01:00.000Z')
  })
  it('mantém null enquanto não classificada', () => {
    expect(toDto(row).urgencyScore).toBeNull()
  })
})

describe('routeSector', () => {
  it('manda baixa confiança para revisão humana', () => {
    expect(routeSector({ ...good, confidenceScore: 0.3 }, 0.5)).toBe('HUMAN_REVIEW')
    expect(routeSector(good, 0.5)).toBe('FINANCIAL')
  })
})

describe('loadConfig', () => {
  it('exige chave para o provedor anthropic', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/)
    expect(loadConfig({}).LLM_PROVIDER).toBe('fake')
  })
})

describe('FakeClassifier', () => {
  it('classifica cenários básicos', async () => {
    const c = new FakeClassifier()
    expect((await c.classify('Qual o prazo de envio do produto X?')).sector).toBe('STOCK')
    const angry = await c.classify('ISSO É UM ABSURDO!! Vou cancelar e procurar o Procon.')
    expect(angry.sentiment).toBe('CRITICAL')
    // regressão: "cobram" (flexão de cobrar) deve cair em FINANCIAL
    expect((await c.classify('Já cobram errado todo mês')).sector).toBe('FINANCIAL')
  })
})

describe('OllamaClassifier', () => {
  const reply = (content: string) => new Response(JSON.stringify({ message: { content } }))

  it('valida a resposta com Zod', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(JSON.stringify(good)))
    const out = await new OllamaClassifier('http://x', 'm', fetchFn).classify('oi')
    expect(out.sector).toBe('FINANCIAL')
  })
  it('tenta de novo uma vez quando o JSON é inválido', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(reply('não é json')).mockResolvedValueOnce(reply(JSON.stringify(good)))
    await new OllamaClassifier('http://x', 'm', fetchFn).classify('oi')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
  it('falha após esgotar as tentativas', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => reply('lixo'))
    await expect(new OllamaClassifier('http://x', 'm', fetchFn).classify('oi')).rejects.toThrow()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('AnthropicClassifier', () => {
  it('lê a classificação do tool_use e força a ferramenta', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', input: good }] })
    const out = await new AnthropicClassifier('k', 'model', { messages: { create } } as never).classify('oi')
    expect(out.summary).toBe(good.summary)
    expect(create.mock.calls[0]?.[0].tool_choice).toEqual({ type: 'tool', name: 'classify_message' })
  })
  it('rejeita resposta sem tool_use', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'oi' }] })
    await expect(new AnthropicClassifier('k', 'model', { messages: { create } } as never).classify('oi')).rejects.toThrow()
  })
})

describe('processMessage', () => {
  function setup(classify: () => Promise<ClassificationResult>) {
    const events: string[] = []
    const repo = {
      setStatus: vi.fn(async (_id: string, status: MessageRow['status']) => ({ ...row, status })),
      applyClassification: vi.fn(async (_id: string, r: ClassificationResult, sector: MessageRow['assignedSector']) => ({
        ...row, status: 'COMPLETED' as const, assignedSector: sector, sentiment: r.sentiment,
      })),
    } as unknown as MessagesRepo
    const bus: EventBus = {
      publish: async (e) => void events.push(`${e.type}:${e.message.status}`),
      subscribe: async () => () => {},
      close: async () => {},
    }
    return { events, repo, deps: { repo, bus, classifier: { classify }, confidenceThreshold: 0.5 } }
  }

  it('PROCESSING → COMPLETED publicando os dois eventos', async () => {
    const { deps, events } = setup(async () => good)
    await processMessage(deps, row.id)
    expect(events).toEqual(['message.updated:PROCESSING', 'message.updated:COMPLETED'])
  })
  it('aplica o roteamento por confiança', async () => {
    const { deps, repo } = setup(async () => ({ ...good, confidenceScore: 0.2 }))
    await processMessage(deps, row.id)
    expect(vi.mocked(repo.applyClassification).mock.calls[0]?.[2]).toBe('HUMAN_REVIEW')
  })
  it('propaga erro da LLM para a fila tentar de novo', async () => {
    const { deps } = setup(async () => {
      throw new Error('LLM fora do ar')
    })
    await expect(processMessage(deps, row.id)).rejects.toThrow('LLM fora do ar')
  })
  it('markFailed publica FAILED', async () => {
    const { deps, events } = setup(async () => good)
    await markFailed(deps, row.id)
    expect(events).toEqual(['message.updated:FAILED'])
  })
})
