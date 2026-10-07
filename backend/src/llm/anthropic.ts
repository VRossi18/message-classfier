import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { ClassificationSchema, type ClassificationResult } from '../schemas/classification.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'
import type { LlmClassifier } from './types.js'

const TOOL_NAME = 'classify_message'

export class AnthropicClassifier implements LlmClassifier {
  private readonly client: Pick<Anthropic, 'messages'>

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: Pick<Anthropic, 'messages'>,
  ) {
    this.client = client ?? new Anthropic({ apiKey })
  }

  async classify(rawContent: string): Promise<ClassificationResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Registra a classificação estruturada da mensagem do cliente.',
          input_schema: z.toJSONSchema(ClassificationSchema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userPrompt(rawContent) }],
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') throw new Error('Resposta da LLM sem tool_use')
    return ClassificationSchema.parse(block.input)
  }
}
