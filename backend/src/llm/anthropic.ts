import Anthropic from '@anthropic-ai/sdk'
import { UnrecoverableError } from 'bullmq'
import { z } from 'zod'
import { ClassificationSchema, type ClassificationResult } from '../schemas/classification.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'
import type { LlmClassifier } from './types.js'

const TOOL_NAME = 'classify_message'

export interface AnthropicOptions {
  apiKey: string
  model: string
  /** Tempo máximo de cada chamada, em ms. */
  timeoutMs: number
  /** Cliente já pronto (testes). */
  client?: Pick<Anthropic, 'messages'>
}

/**
 * Erros em que repetir a chamada não adianta (chave inválida, modelo inexistente, pedido malformado):
 * viram UnrecoverableError e o BullMQ marca o job como falho na hora, sem gastar as tentativas.
 * Limite de taxa (429), 5xx e timeout continuam retentáveis.
 */
function isPermanent(err: unknown): boolean {
  return (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.BadRequestError ||
    err instanceof Anthropic.NotFoundError
  )
}

export class AnthropicClassifier implements LlmClassifier {
  readonly name: string
  private readonly client: Pick<Anthropic, 'messages'>
  private readonly model: string

  constructor(opts: AnthropicOptions) {
    this.model = opts.model
    this.name = `anthropic:${opts.model}`
    // O SDK repete 429/5xx respeitando `retry-after`; o que sobrar fica para a fila (BullMQ).
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: 2 })
  }

  async classify(rawContent: string): Promise<ClassificationResult> {
    let res: Awaited<ReturnType<Anthropic['messages']['create']>>
    try {
      res = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: TOOL_NAME,
            description: 'Registra a classificação estruturada da mensagem do cliente.',
            input_schema: toolSchema(),
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: userPrompt(rawContent) }],
      })
    } catch (err) {
      if (isPermanent(err)) {
        throw new UnrecoverableError(`Anthropic recusou a chamada: ${err instanceof Error ? err.message : String(err)}`)
      }
      throw err
    }

    if ('stop_reason' in res && res.stop_reason === 'max_tokens') {
      throw new Error('Resposta da LLM cortada por max_tokens')
    }
    const block = 'content' in res ? res.content.find((b) => b.type === 'tool_use') : undefined
    if (!block || block.type !== 'tool_use') throw new Error('Resposta da LLM sem tool_use')
    return ClassificationSchema.parse(block.input)
  }
}

/** JSON Schema do Zod sem a chave `$schema`, que não faz parte do input_schema de uma ferramenta. */
function toolSchema(): Anthropic.Tool.InputSchema {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(ClassificationSchema) as Record<string, unknown>
  return schema as Anthropic.Tool.InputSchema
}
