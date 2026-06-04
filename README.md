# Tara — Finance Research AI Agent

Tara is a production-oriented finance assistant that answers natural-language questions **only** from PostgreSQL-backed tools. All monetary figures come from database queries — never from model estimation.

 <img width="1918" height="1017" alt="image" src="https://github.com/user-attachments/assets/f12d9d21-ad71-4441-a486-c9bd8a26b405" />


## Architecture

```mermaid
flowchart LR
  Client -->|POST /ask| Express
  Express --> TaraAgent
  TaraAgent -->|tool calls| Tools
  Tools --> Services
  Services --> Prisma
  Prisma --> PostgreSQL[(Neon PostgreSQL)]
  Ingest[scripts/ingest.ts] --> PostgreSQL
  JSON[(data snapshot)] --> Ingest
```

**Flow:** User question → Mastra agent → tool execution → service layer → Prisma → PostgreSQL → grounded answer.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, TypeScript |
| API | Express 5 |
| Agent | Mastra SDK (`@mastra/core`) |
| ORM | Prisma |
| Database | PostgreSQL (Neon) |
| Validation | Zod |
| Logging | Pino + `logs/ask.jsonl` |
| Deploy | Render |

## Project Structure

```
tara-agent/
├── prisma/              # Schema & migrations
├── scripts/
│   ├── ingest.ts        # Load JSON snapshots into PostgreSQL
│   └── eval.ts          # 12-case deterministic evaluation suite
├── src/
│   ├── agent/           # Tara agent & ask orchestration
│   ├── services/        # Business logic (DB-only)
│   ├── tools/           # Mastra tools
│   ├── routes/          # Express routes
│   └── logging/
├── data/sample_x/       # Example snapshot (input only)
├── logs/                # Request logs (JSONL)
├── README.md
└── DESIGN.md
```

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or [Neon](https://neon.tech))
- OpenAI API key (for `/ask` agent endpoint)

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | For `/ask` | OpenAI key for Tara agent |
| `PORT` | No | HTTP port (default `3000`) |
| `LOG_LEVEL` | No | Pino level (default `info`) |
| `DATA_DIR` | No | Ingest source directory (default `./data/sample_x`) |
| `NODE_ENV` | No | `development` \| `production` |

## Setup

```bash
npm install
cp .env.example .env
# Edit DATABASE_URL and OPENAI_API_KEY
```

### Local PostgreSQL (optional)

```bash
docker compose up -d
```

Use `DATABASE_URL=postgresql://tara:tara@localhost:5432/tara` in `.env`.

### Database

```bash
npx prisma migrate deploy
# or during development:
npx prisma migrate dev
```

### Ingestion

JSON files under `data/` are **input only** — never read at runtime.

```bash
# Windows PowerShell
$env:DATA_DIR="./data/sample_x"; npm run ingest

# Unix
DATA_DIR=./data/sample_x npm run ingest
```

Ingests `transactions.json`, `funds.json`, and `holdings.json` from any snapshot directory.

## Running Locally

```bash
npm run dev
```

### API

**Health check**

```http
GET /health
```

**Ask Tara**

```http
POST /ask
Content-Type: application/json

{
  "question": "What was my biggest expense?"
}
```

Response:

```json
{
  "answer": "..."
}
```

## Evaluation Suite

Deterministic tests against services (no LLM):

```bash
npm run ingest
npm run eval
```

Output:

```
PASS  1. Food spending total
...
--- Summary ---
PASS: 12
FAIL: 0
```

## Tools

| Tool | Purpose |
|------|---------|
| `queryTransactionsTool` | Spend, filters, grouping, rankings |
| `fundReturnTool` | Fund NAV period return % |
| `holdingReturnTool` | Personal holding P&L |
| `portfolioSummaryTool` | Portfolio value & best/worst |
| `recurringSubscriptionTool` | Detect recurring charges |

## Deployment (Render + Neon)

1. Create a **Neon** PostgreSQL database and copy `DATABASE_URL`.
2. Create a **Render** Web Service from this repo.
3. Set environment variables on Render:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `NODE_ENV=production`
4. Build command (also in `render.yaml`):
   ```bash
   npm install && npm run build && npx prisma migrate deploy
   ```
5. Start command: `npm start`
6. Health check path: `/health`
7. After deploy, run ingest once (Render shell or CI):
   ```bash
   DATA_DIR=./data/sample_x npm run ingest
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run ingest` | Load data snapshot into DB |
| `npm run eval` | Run evaluation suite |
| `npm run db:migrate` | Apply migrations |

## Design Documentation

See [DESIGN.md](./DESIGN.md) for schema, formulas, normalization, and grounding strategy.

## License

MIT
