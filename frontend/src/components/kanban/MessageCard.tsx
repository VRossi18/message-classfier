import { motion } from 'framer-motion'
import { AlertTriangle, Loader2, PencilLine, UserRoundSearch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SENTIMENT_LABEL, SENTIMENT_STYLE, effectiveSector, urgencyColor } from '@/lib/sectors'
import type { Message } from '@/lib/schemas'

export function MessageCard({ message, onOpen }: { message: Message; onOpen: (id: string) => void }) {
  const processing = message.status === 'PENDING' || message.status === 'PROCESSING'
  const urgency = Math.round((message.urgencyScore ?? 0) * 100)

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="list-none"
    >
      <button
        type="button"
        data-message-id={message.id}
        onClick={() => onOpen(message.id)}
        className="w-full cursor-pointer rounded-lg border border-border bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent"
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
        {!processing && message.status !== 'FAILED' && (
          <div className="mt-2 flex items-center gap-2">
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
    </motion.li>
  )
}
