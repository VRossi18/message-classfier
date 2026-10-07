import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { useCorrectSector } from '@/hooks/useMessages'
import { SECTOR_LABEL, SENTIMENT_LABEL, SENTIMENT_STYLE, effectiveSector } from '@/lib/sectors'
import { SectorSchema, type Message } from '@/lib/schemas'

const OPTIONS = SectorSchema.options.map((s) => ({ value: s, label: SECTOR_LABEL[s] }))
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

export function MessageDetailDialog({ message, onClose }: { message: Message | undefined; onClose: () => void }) {
  const correct = useCorrectSector()

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      {message && (
        <DialogContent
          onCloseAutoFocus={(e) => {
            // O Dialog é controlado (não há Trigger do Radix): devolve o foco ao card de origem,
            // que pode ter sido remontado em outra coluna.
            e.preventDefault()
            document.querySelector<HTMLElement>(`[data-message-id="${message.id}"]`)?.focus()
          }}
        >
          <DialogTitle className="pr-6 text-lg font-semibold">{message.customerName}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted">
            Recebida em {new Date(message.createdAt).toLocaleString('pt-BR')}
          </DialogDescription>

          <blockquote className="mt-4 rounded-md border-l-4 border-accent bg-bg p-3 text-sm">
            {message.rawContent}
          </blockquote>

          {message.status === 'COMPLETED' ? (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Sentimento">
                {message.sentiment && (
                  <Badge className={SENTIMENT_STYLE[message.sentiment]}>{SENTIMENT_LABEL[message.sentiment]}</Badge>
                )}
              </Field>
              <Field label="Setor sugerido pela IA">
                {message.assignedSector ? SECTOR_LABEL[message.assignedSector] : '—'}
              </Field>
              <Field label="Urgência">{pct(message.urgencyScore)}</Field>
              <Field label="Confiança">{pct(message.confidenceScore)}</Field>
              <div className="col-span-2">
                <Field label="Resumo">{message.summary}</Field>
              </div>
              <div className="col-span-2">
                <Field label="Ação recomendada">{message.suggestedAction}</Field>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted">A IA ainda está analisando esta mensagem…</p>
          )}

          {message.status === 'COMPLETED' && (
            <div className="mt-5">
              <label className="mb-1 block text-xs font-medium text-muted">Corrigir setor (feedback humano)</label>
              <Select
                ariaLabel="Corrigir setor"
                value={effectiveSector(message) ?? undefined}
                options={OPTIONS}
                onValueChange={(v) => {
                  const sector = SectorSchema.parse(v)
                  correct.mutate(
                    { id: message.id, sector },
                    {
                      onSuccess: () => toast.success(`Setor atualizado para ${SECTOR_LABEL[sector]}`),
                      onError: () => toast.error('Não foi possível salvar a correção'),
                    },
                  )
                }}
              />
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 mt-0.5">{children}</dd>
    </div>
  )
}
