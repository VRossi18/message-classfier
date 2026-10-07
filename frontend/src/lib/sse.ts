import { api } from './api'
import { MessageEventSchema, type MessageEvent } from './schemas'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/** Silêncio máximo tolerado: o servidor envia `ping` a cada 15 s (3 pings perdidos). */
export const SSE_IDLE_MS = 45_000

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
  // O EventSource reconecta sozinho em quedas visíveis, mas um proxy pode manter a conexão
  // "aberta" sem entregar nada (zumbi). O servidor manda `ping` periódico; sem nenhum evento
  // por IDLE_MS, descartamos a conexão e abrimos outra.
  let es: EventSource
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      es.close()
      onStatus(false)
      open()
    }, SSE_IDLE_MS)
  }

  const handle = (ev: Event) => {
    arm()
    let payload: unknown
    try {
      payload = JSON.parse((ev as globalThis.MessageEvent<string>).data)
    } catch {
      return // evento malformado: ignora sem derrubar o listener
    }
    const parsed = MessageEventSchema.safeParse(payload)
    if (parsed.success) onEvent(parsed.data)
  }

  function open() {
    if (stopped) return
    es = new EventSource(api.eventsUrl())
    es.onopen = () => {
      onStatus(true)
      arm()
    }
    es.onerror = () => onStatus(false)
    es.addEventListener('message.created', handle)
    es.addEventListener('message.updated', handle)
    es.addEventListener('ping', arm)
    arm()
  }

  open()
  return () => {
    stopped = true
    clearTimeout(timer)
    es.close()
  }
}
