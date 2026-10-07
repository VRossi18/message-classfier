import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { connectEvents } from '@/lib/sse'
import type { Message } from '@/lib/schemas'
import { applyEvent, messagesKey, metricsKey } from './useMessages'

/** Mantém o cache do React Query sincronizado com os eventos em tempo real. */
export function useRealtime() {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let close: (() => void) | undefined
    let cancelled = false
    let wasDown = false
    connectEvents(
      (event) => {
        qc.setQueryData<Message[]>(messagesKey, (old) => applyEvent(old, event))
        qc.invalidateQueries({ queryKey: metricsKey })
      },
      (up) => {
        setConnected(up)
        if (!up) wasDown = true
        else if (wasDown) {
          // Eventos emitidos durante a queda se perderam: ressincroniza com o servidor.
          wasDown = false
          qc.invalidateQueries({ queryKey: messagesKey })
          qc.invalidateQueries({ queryKey: metricsKey })
        }
      },
    ).then((fn) => {
      if (cancelled) fn()
      else close = fn
    })
    return () => {
      cancelled = true
      close?.()
    }
  }, [qc])

  return { connected }
}
