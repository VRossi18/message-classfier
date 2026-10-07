import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Loader2, PencilLine, UserRoundSearch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { usePageVisible } from '@/hooks/usePageVisible'
import { SENTIMENT_LABEL, SENTIMENT_STYLE, effectiveSector, urgencyColor } from '@/lib/sectors'
import type { Message } from '@/lib/schemas'

export function MessageCard({
  message,
  onOpen,
  onResolve,
}: {
  message: Message
  onOpen: (id: string) => void
  /** Atalho "marcar como resolvida"; só aparece em mensagens concluídas e ainda abertas. */
  onResolve?: (id: string) => void
}) {
  const visible = usePageVisible()
  const processing = message.status === 'PENDING' || message.status === 'PROCESSING'
  const urgency = Math.round((message.urgencyScore ?? 0) * 100)
  const resolved = !!message.resolvedAt
  const canQuickResolve = !!onResolve && message.status === 'COMPLETED' && !resolved

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      // Sem `exit` com a aba oculta: o rAF está pausado e a animação de saída nunca terminaria,
      // deixando o card antigo no DOM ao lado do novo (usePageVisible).
      exit={visible ? { opacity: 0, scale: 0.95 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="group relative list-none"
    >
      <button
        type="button"
        data-message-id={message.id}
        onClick={() => onOpen(message.id)}
        className={`w-full cursor-pointer rounded-lg border border-border bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${resolved ? 'opacity-70' : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{message.customerName}</span>
          {processing ? (
            <Badge className="bg-accent/15 text-accent">
              <Loader2 className="size-3 animate-spin" />
              {message.status === 'PENDING' ? 'Na fila' : 'Analisando'}
            </Badge>
          ) : message.status === 'FAILED' ? (
            <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="size-3" />
              Falhou
            </Badge>
          ) : resolved ? (
            <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300">
              <CheckCircle2 className="size-3" />
              Resolvida
            </Badge>
          ) : message.sentiment ? (
            <Badge className={SENTIMENT_STYLE[message.sentiment]}>{SENTIMENT_LABEL[message.sentiment]}</Badge>
          ) : null}
        </div>
        {!processing && effectiveSector(message) === 'HUMAN_REVIEW' && (
          <Badge className="mt-1 bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <UserRoundSearch className="size-3" />
            Revisão humana
          </Badge>
        )}
        <p className="mt-1 line-clamp-2 text-xs text-muted">{message.summary ?? message.rawContent}</p>
        {!processing && message.status !== 'FAILED' && !resolved && (
          <div className={`mt-2 flex items-center gap-2 ${canQuickResolve ? 'pr-8' : ''}`}>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
              role="meter"
              aria-label="Urgência"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={urgency}
            >
              <div className={`h-full rounded-full ${urgencyColor(urgency)}`} style={{ width: `${urgency}%` }} />
            </div>
            <span className="text-[11px] text-muted">{urgency}%</span>
            {message.correctedSector && (
              <span title="Setor corrigido por humano" className="text-muted">
                <PencilLine className="size-3.5" />
              </span>
            )}
          </div>
        )}
      </button>
      {/* Irmão do card (e não filho): botão dentro de botão é HTML inválido. */}
      {canQuickResolve && (
        <button
          type="button"
          aria-label={`Marcar como resolvida: ${message.customerName}`}
          title="Marcar como resolvida"
          onClick={() => onResolve(message.id)}
          className="absolute bottom-2 right-2 grid size-7 cursor-pointer place-items-center rounded-md border border-border bg-surface text-muted opacity-0 transition-opacity hover:text-teal-600 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-hover:opacity-100 pointer-coarse:opacity-100"
        >
          <CheckCircle2 className="size-4" />
        </button>
      )}
    </motion.li>
  )
}
