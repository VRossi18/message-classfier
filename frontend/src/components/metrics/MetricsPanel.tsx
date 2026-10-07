import { useMetrics } from '@/hooks/useMessages'
import { SENTIMENT_LABEL } from '@/lib/sectors'
import { SentimentSchema } from '@/lib/schemas'

const BAR: Record<string, string> = {
  CALM: 'bg-emerald-500',
  NEUTRAL: 'bg-slate-400',
  ANGRY: 'bg-orange-500',
  CRITICAL: 'bg-rose-500',
}

export function MetricsPanel() {
  const { data } = useMetrics()
  const total = data?.total ?? 0
  const classified = data ? Object.values(data.sentiments).reduce((a, b) => a + b, 0) : 0

  return (
    <section aria-label="Métricas" className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Atendimentos" value={String(total)} />
      <Stat
        label="Resolvidas"
        value={String(data?.resolved ?? 0)}
        hint={total > 0 ? `${Math.round(((data?.resolved ?? 0) / total) * 100)}% do total` : undefined}
      />
      <Stat
        label="Precisão da IA"
        value={data?.accuracy == null ? '—' : `${Math.round(data.accuracy * 100)}%`}
        hint={data ? `${data.corrected} correção(ões) em ${data.completed} concluída(s)` : undefined}
      />
      <div>
        <p className="text-xs text-muted">Sentimentos</p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-border">
          {SentimentSchema.options.map((s) => {
            const n = data?.sentiments[s] ?? 0
            return n > 0 ? (
              <div key={s} className={BAR[s]} style={{ width: `${(n / classified) * 100}%` }} title={`${SENTIMENT_LABEL[s]}: ${n}`} />
            ) : null
          })}
        </div>
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted">
          {SentimentSchema.options.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${BAR[s]}`} />
              {SENTIMENT_LABEL[s]} {data?.sentiments[s] ?? 0}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="m-0 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="m-0 text-xs text-muted">{hint}</p>}
    </div>
  )
}
