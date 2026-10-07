import type { ClassificationResult, Sentiment } from '../schemas/classification.js'
import type { LlmClassifier } from './types.js'

const RULES: { sector: ClassificationResult['sector']; words: RegExp; action: string }[] = [
  { sector: 'FINANCIAL', words: /boleto|fatura|cobra|reembolso|estorno|nota fiscal|pagamento|cart[aã]o/i, action: 'Gerar segunda via ou consultar gateway.' },
  { sector: 'STOCK', words: /estoque|dispon[ií]vel|prazo|envio|entrega|galp[aã]o|remessa/i, action: 'Consultar sistema de inventário/ERP.' },
  { sector: 'SALES', words: /or[cç]amento|comprar|pedido|plano|upgrade|pre[cç]o/i, action: 'Encaminhar ao time comercial.' },
  { sector: 'SUPPORT', words: /erro|bug|n[aã]o funciona|travou|login|senha|como (uso|fa[cç]o)|ajuda/i, action: 'Abrir ticket técnico de atendimento.' },
]

/** Classificador determinístico por palavras-chave, para testes, CI e demo sem chave. */
export class FakeClassifier implements LlmClassifier {
  async classify(text: string): Promise<ClassificationResult> {
    const hit = RULES.find((r) => r.words.test(text))
    const letters = text.replace(/[^A-Za-zÀ-ú]/g, '')
    const upper = text.replace(/[^A-ZÀ-Ú]/g, '')
    const shouting = letters.length > 8 && upper.length / letters.length > 0.6
    const critical = /processo|procon|cancel|absurdo|p[eé]ssimo|urgente|perdi|preju[ií]zo/i.test(text)
    const angry = shouting || critical || /rid[ií]culo|inaceit|lixo|nunca mais|!!/i.test(text)
    const sentiment: Sentiment = critical && angry ? 'CRITICAL' : angry ? 'ANGRY' : hit ? 'NEUTRAL' : 'CALM'
    const urgencyScore = sentiment === 'CRITICAL' ? 0.95 : sentiment === 'ANGRY' ? 0.75 : 0.25
    return {
      sector: hit?.sector ?? 'SUPPORT',
      sentiment,
      urgencyScore,
      confidenceScore: hit ? 0.9 : 0.3,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      suggestedAction: sentiment === 'CRITICAL' ? 'Alertar gerente de contas imediatamente.' : (hit?.action ?? 'Revisar manualmente.'),
    }
  }
}
