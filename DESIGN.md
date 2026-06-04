# Tara — Design Document

## 1. Database Schema

Four core tables mirror the assignment spec:

| Table | Purpose |
|-------|---------|
| `transactions` | Spending ledger with `canonical_merchant` for alias resolution |
| `funds` | Mutual fund metadata |
| `fund_navs` | Daily/monthly NAV time series per fund |
| `holdings` | User positions (units, purchase date/NAV) |

Foreign keys: `fund_navs.fund_id → funds.id`, `holdings.fund_id → funds.id` (CASCADE delete).

`transactions.id` comes from source JSON. `holdings.id` is derived at ingest from `fund_id + purchase_date + units` so re-ingest is idempotent per row.

## 2. Indexing Strategy

- **transactions:** `date`, `category`, `canonical_merchant`, `merchant`, composite `(date, category)` — supports date-range filters, category/merchant spend queries, and rankings.
- **fund_navs:** unique `(fund_id, nav_date)`, index `(fund_id, nav_date)` and `nav_date` — supports latest NAV and period lookups.
- **funds:** `name` — supports case-insensitive name resolution.
- **holdings:** `fund_id` — joins for portfolio calculations.

## 3. Merchant Normalization

**No hardcoded merchant lists.** Pipeline:

1. **Per-string signature** (`normalizeMerchant`): uppercase, strip `*` suffixes and non-alphanumeric noise, drop generic tokens (`ORDER`, `PAYMENT`, `INSTAMART`, bank names, etc.), keep 1–2 brand tokens.
2. **Dataset clustering** (`buildCanonicalMap`): union-find merges signatures with high prefix overlap or Jaro–Winkler ≥ 0.92.
3. **Ingest:** compute `canonical_merchant` once and store — runtime queries use stored values.

Examples handled without explicit Swiggy rules:

- `SWIGGY*123` → strip after `*` → `SWIGGY`
- `SWIGGY ORDER` → drop `ORDER` → `SWIGGY`
- `Swiggy Instamart` → drop `INSTAMART` → `SWIGGY`

## 4. Refund Handling

Refunds are **negative `amount`** values. Net spend is:

```
SUM(amount)
```

including negatives. Refunds reduce category/merchant totals; they are never classified as income.

## 5. Transfer Handling

`category = 'transfer'` marks internal transfers. `queryTransactionsTool` excludes transfers by default (`includeTransfers: false`). Explicit transfer questions pass `includeTransfers: true`.

## 6. Fund Return Formula

Fund performance (NAV-based, independent of user purchase):

```
returnPercent = ((endNAV - startNAV) / startNAV) * 100
```

NAV rows use **on-or-before** lookup for `startDate` and `endDate` so month boundaries work without exact NAV dates.

## 7. Holding Return Formula

User investment performance:

```
purchaseCost = units × purchaseNAV
currentValue = units × latestNAV
profit       = currentValue - purchaseCost
returnPercent = (profit / purchaseCost) * 100
```

`latestNAV` is the most recent `fund_navs` row for the fund.

## 8. Tool Design Decisions

Five expressive tools instead of many narrow ones:

| Tool | Rationale |
|------|-----------|
| `queryTransactionsTool` | Single entry for spend, filters, `groupBy`, aggregates — covers comparisons and rankings |
| `fundReturnTool` | Isolated NAV period math |
| `holdingReturnTool` | Isolated cost-basis math |
| `portfolioSummaryTool` | One call for portfolio-wide answers |
| `recurringSubscriptionTool` | Heuristic detector over DB rows |

Each tool returns `tablesRead` for observability.

## 9. Grounding Strategy

- JSON snapshots are **ingest-only**; runtime code never reads `data/`.
- Agent system prompt forbids invented numbers and manual arithmetic.
- All figures flow: **PostgreSQL → service → tool → model → answer**.
- Zod validates API and tool inputs.

## 10. Reliability Strategy

- Strict TypeScript, Prisma type safety, transactional ingest batches.
- Deterministic `scripts/eval.ts` (12 cases) validates formulas without LLM variance.
- Structured logging: `request_id`, `tools_called`, `tool_inputs`, `tables_read`, `latency_ms`, `status`.
- Health (`/health`) and readiness (`/ready`) endpoints for Render.
- Errors from missing funds/data surface clearly to the agent.

## 11. Known Limitations

- **Recurring detection** uses heuristics (≈20–40 day intervals, 15% amount tolerance) — may miss annual subscriptions or irregular billing.
- **Merchant clustering** may over-merge rare similar prefixes; tuning similarity thresholds trades precision vs recall.
- **Single holding per fund** assumed in `holdingReturnTool` (latest row if multiple exist).
- **Agent eval** not in `eval.ts` — LLM answers are non-deterministic; grounding is enforced by prompt + tool-only numbers.
- **Fund name matching** uses exact then substring — very ambiguous partial names may resolve incorrectly.
