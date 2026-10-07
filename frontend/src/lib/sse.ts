import { api } from './api'
import { MessageEventSchema, type MessageEvent } from './schemas'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/**
 * Abre o canal de eventos em tempo real. Em modo mock o MSW não transmite SSE
 * de forma confiável, então assinamos o simulador em memória diretamente.
 * Retorna a função de encerramento.
 */
export async function connectEvents(
  onEvent: (e: MessageEvent) => void,
  onStatus: (connected: boolean) => void,
): Promise<() => void> {
  if (USE_MOCKS) {
    const { subscribe } = await import('@/mocks/simulator')
    onStatus(true)
    return subscribe(onEvent)
  }
  // EventSource reconecta sozinho em caso de queda.
  const es = new EventSource(api.eventsUrl())
  es.onopen = () => onStatus(true)
  es.onerror = () => onStatus(false)
  const handle = (ev: Event) => {
    let payload: unknown
    try {
      payload = JSON.parse((ev as globalThis.MessageEvent<string>).data)
    } catch {
      return // evento malformado: ignora sem derrubar o listener
    }
    const parsed = MessageEventSchema.safeParse(payload)
    if (parsed.success) onEvent(parsed.data)
  }
  es.addEventListener('message.created', handle)
  es.addEventListener('message.updated', handle)
  return () => es.close()
}
