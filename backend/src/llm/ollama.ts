import { z } from 'zod'
import { ClassificationSchema, type ClassificationResult } from '../schemas/classification.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'
import type { LlmClassifier } from './types.js'

export class OllamaClassifier implements LlmClassifier {
  readonly name: string

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {
    this.name = `ollama:${model}`
  }

  async classify(rawContent: string): Promise<ClassificationResult> {
    let lastError: unknown
    // Modelos locais às vezes devolvem JSON inválido: 1 nova tentativa.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.once(rawContent)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  private async once(rawContent: string): Promise<ClassificationResult> {
    const res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: z.toJSONSchema(ClassificationSchema),
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(rawContent) },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`)
    const body = (await res.json()) as { message?: { content?: string } }
    return ClassificationSchema.parse(JSON.parse(body.message?.content ?? ''))
  }
}
