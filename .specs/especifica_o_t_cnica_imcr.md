# 📄 Especificação Técnica: Intelligent Message Classifier & Router (IMCR)

---

## 1. Visão Geral & Arquitetura de Backend

O **IMCR** é um sistema automatizado para recepção, classificação de intenção, análise de sentimento e triagem de mensagens de clientes em tempo real. O foco principal da arquitetura é demonstrar alta performance em TypeScript com processamento assíncrono acoplado a LLMs (Local & Cloud).

### 1.1 Tech Stack & Tooling
* **Runtime / Framework:** Node.js v22 LTS com **Fastify** (ou **Hono** em runtime Node) para alta performance e suporte de baixa latência a WebSockets.
* **Linguagem:** TypeScript (modo estrito).
* **ORM & Database:** **Drizzle ORM** com **PostgreSQL**.
* **Fila & Processamento Assíncrono:** **BullMQ** alimentado por **Redis** (garante desacoplamento e retentativas em falhas de API da LLM).
* **Validação de Dados:** **Zod** (compartilhado em esquemas DTO).
* **Comunicação em Tempo Real:** `@fastify/websocket` ou `socket.io`.

### 1.2 Modelagem do Banco de Dados (Schema - Drizzle)

```typescript
// db/schema.ts
import { pgTable, uuid, text, timestamp, decimal, pgEnum } from 'drizzle-orm/pg-core';

export const sectorEnum = pgEnum('sector', ['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'HUMAN_REVIEW']);
export const sentimentEnum = pgEnum('sentiment', ['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL']);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerName: text('customer_name').notNull(),
  rawContent: text('raw_content').notNull(),
  
  // Dados preenchidos após o processamento da LLM
  assignedSector: sectorEnum('assigned_sector'),
  sentiment: sentimentEnum('sentiment'),
  urgencyScore: decimal('urgency_score', { precision: 3, scale: 2 }), // 0.00 a 1.00
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }),
  summary: text('summary'),
  suggestedAction: text('suggested_action'),
  
  // Feedback Humano (Human-in-the-loop)
  correctedSector: sectorEnum('corrected_sector'),
  
  status: text('status').notNull().default('PENDING'), // PENDING, PROCESSING, COMPLETED, FAILED
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
});
```

---

## 2. Arquitetura de Frontend & Interface

### 2.1 Tech Stack
* **Framework:** React 19 / Next.js 15 (App Router) ou Vite + React.
* **Estilização:** Tailwind CSS v4 + **shadcn/ui** (Dialog, Badge, Card, Select, Toast).
* **Animações:** **Framer Motion** (animação de entrada de mensagens nas colunas estilo Kanban).
* **State Management & Data Fetching:** **TanStack Query (React Query v5)** + **Socket.io-client** / SSE.
* **Ícones:** Lucide React.

### 2.2 Tabela de Roteamento e Regras de Setores

| Setor | Gatilho de Classificação | Tag / Badge | Ação Padrão Recomendada |
| :--- | :--- | :--- | :--- |
| **Financeiro** | Cobranças, faturas, boletos, reembolsos e estornos. | `FINANCIAL` | Gerar segunda via ou consultar gateway. |
| **Estoque** | Disponibilidade de produtos, prazos de envio, galpão. | `STOCK` | Consultar sistema de inventário/ERP. |
| **Suporte** | Dúvidas técnicas, bugs, auxílio na utilização. | `SUPPORT` | Abrir ticket técnico de atendimento. |
| **Crítico / Urgente** | Tom hostil, ameaça de cancelamento, perdas graves. | `CRITICAL` | Alertar gerente de contas imediatamente. |

### 2.3 Funcionalidades da Interface
1. **Quadro Kanban Animado:** As colunas (*Financeiro, Estoque, Suporte, Vendas, Urgente*) recebem os cards em tempo real com transições suaves via `framer-motion`.
2. **Painel de Métricas:** Exibe total de atendimentos, proporção de sentimentos e taxa de precisão da IA (sugerido vs. corrigido por humano).
3. **Simulador de Entrada (Playground):** Painel lateral para testar o envio de cenários simulados (cliente com raiva, dúvida simples de estoque, etc.).

---

## 3. Integração com Modelos & LLM Pipeline

### 3.1 Validação com Zod e Structured Output

```typescript
// schemas/classification.ts
import { z } from 'zod';

export const ClassificationSchema = z.object({
  sector: z.enum(['FINANCIAL', 'STOCK', 'SUPPORT', 'SALES']),
  sentiment: z.enum(['CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL']),
  urgencyScore: z.number().min(0).max(1).describe('Pontuação de urgência de 0 a 1'),
  confidenceScore: z.number().min(0).max(1).describe('Confiança da classificação de 0 a 1'),
  summary: z.string().describe('Resumo da demanda em uma única frase curta'),
  suggestedAction: z.string().describe('Ação recomendada para o atendente humano'),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;
```

### 3.2 System Prompt Template

```text
Você é um sistema especialista em triagem e roteamento de atendimento ao cliente para uma empresa.
Sua tarefa é analisar a mensagem do cliente e extrair informações estruturadas rigorosamente conforme as regras:

REGRAS DE SETOR:
- FINANCIAL: Dúvidas sobre pagamentos, cobranças, notas fiscais, boletos, reembolso, estorno.
- STOCK: Consultas de disponibilidade de produtos, estoque, prazos de remessa, inventário.
- SUPPORT: Dúvidas técnicas, defeitos em produtos, auxílio na utilização de plataformas/serviços.
- SALES: Orçamentos, novos pedidos, interesse em compra, upgrade de planos.

REGRAS DE SENTIMENTO:
- ANGRY: Uso de palavrões, caixa alta excessiva, ameaças de cancelamento/processo, frustração explícita.
- CRITICAL: Situações de emergência, falhas operacionais graves, perdas financeiras iminentes.
- CALM / NEUTRAL: Linguagem cordial, dúvidas objetivas, interações padrão.

Mensagem a analisar:
"{RAW_CUSTOMER_MESSAGE}"
```

---

## 4. Ambiente de Desenvolvimento (Podman Specs)

### `podman-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: imcr_postgres
    environment:
      POSTGRES_DB: imcr_db
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    container_name: imcr_redis
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Containerfile
    environment:
      DATABASE_URL: postgres://dev:devpassword@postgres:5432/imcr_db
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

volumes:
  pgdata:
```