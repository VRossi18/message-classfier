import { http, HttpResponse } from 'msw'
import { CreateMessageSchema, SectorSchema } from '@/lib/schemas'
import {
  correctSector,
  createMessage,
  getMetrics,
  listMessages,
  reopenMessage,
  resolveMessage,
  type ResolveResult,
} from './simulator'

const respond = (r: ResolveResult) =>
  r.ok
    ? HttpResponse.json(r.message)
    : r.reason === 'not_found'
      ? HttpResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
      : HttpResponse.json({ error: 'Só mensagens já classificadas podem ser resolvidas' }, { status: 409 })

export const handlers = [
  http.get('*/api/messages', () => HttpResponse.json(listMessages())),
  http.post('*/api/messages', async ({ request }) => {
    const parsed = CreateMessageSchema.safeParse(await request.json())
    if (!parsed.success) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    return HttpResponse.json(createMessage(parsed.data), { status: 201 })
  }),
  http.patch('*/api/messages/:id/correction', async ({ params, request }) => {
    const body = (await request.json()) as { correctedSector?: unknown }
    const sector = SectorSchema.safeParse(body.correctedSector)
    if (!sector.success) return HttpResponse.json({ error: 'invalid' }, { status: 400 })
    const m = correctSector(String(params.id), sector.data)
    return m ? HttpResponse.json(m) : HttpResponse.json({ error: 'not found' }, { status: 404 })
  }),
  http.post('*/api/messages/:id/resolve', ({ params }) => respond(resolveMessage(String(params.id)))),
  http.post('*/api/messages/:id/reopen', ({ params }) => respond(reopenMessage(String(params.id)))),
  http.get('*/api/metrics', () => HttpResponse.json(getMetrics())),
]
