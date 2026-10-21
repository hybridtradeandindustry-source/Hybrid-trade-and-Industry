# AI Production Intelligence — Implementation Plan

**Project:** BlockERP (Elecnovatech)  
**Goal:** Make the ERP AI-native with company-specific production intelligence, capacity prediction, credit scoring, proactive alerts, and grounded natural-language chat.  
**Architecture:** Hybrid — deterministic math + statistical learning + LLM orchestration (not LLM-only).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites & Environment](#3-prerequisites--environment)
4. [Database & Schema Changes](#4-database--schema-changes)
5. [Phase 1 — Production Intelligence Core](#5-phase-1--production-intelligence-core)
6. [Phase 2 — Capacity Dashboard](#6-phase-2--capacity-dashboard)
7. [Phase 3 — Learned Waste & Batch Predictions](#7-phase-3--learned-waste--batch-predictions)
8. [Phase 4 — Credit Score System](#8-phase-4--credit-score-system)
9. [Phase 5 — Alert & Briefing Engine](#9-phase-5--alert--briefing-engine)
10. [Phase 6 — Grounded AI Chat (Tool Calling)](#10-phase-6--grounded-ai-chat-tool-calling)
11. [Phase 7 — Scheduled Jobs & Refresh Pipeline](#11-phase-7--scheduled-jobs--refresh-pipeline)
12. [Phase 8 — Polish, Testing & Rollout](#12-phase-8--polish-testing--rollout)
13. [File & Module Map](#13-file--module-map)
14. [API Surface](#14-api-surface)
15. [Testing Strategy](#15-testing-strategy)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Success Metrics](#17-success-metrics)
18. [Timeline Estimate](#18-timeline-estimate)

---

## 1. Executive Summary

### What exists today

| Area | Status |
|------|--------|
| Batch history, cement/poliche consumption | ✅ Full data in `production_batches`, `production_counts`, `inventory_movements` |
| Rule-based yield math | ✅ `src/lib/block-factory/yields.ts`, `predictions.ts` |
| Simple historical waste average | ✅ `predictBatchProduction()` with 65–92% confidence tiers |
| AI chat UI | ✅ `/dashboard/ai` + `/api/ai` |
| LLM integration | ⚠️ Generic OpenAI prompt — **no ERP data injected** |
| `ai_briefings`, `ai_alerts`, `ai_conversations` tables | ✅ Schema exists — **writers mostly missing** |
| Customer credit ledger | ✅ `customers.balance`, `customer_payments` |
| Credit score | ❌ Not implemented |
| Capacity from current stock | ❌ Not implemented |
| Proactive AI alerts | ❌ Not generated automatically |

### What we are building

1. **Production Intelligence Service** — learns waste, efficiency, cycle duration, material ratios from completed batches.
2. **Capacity Service** — answers “how many blocks/pallets can we produce with current inventory?” per block size.
3. **Capacity Dashboard** — visual UI on Block Factory / Production.
4. **Credit Score** — 0–100 score + tier + limit for credit customers.
5. **Alert Engine** — scheduled rules → `ai_alerts` → in-app notifications.
6. **Grounded AI Chat** — LLM calls tools to fetch live ERP data; never invents numbers.

### Design rule (non-negotiable)

> **Numbers come from code. Language comes from the LLM.**

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
│  Capacity Dashboard │ AI Chat │ Customer Credit │ Notifications │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    AI Orchestration Layer                        │
│  Context Assembler │ Tool Router │ Briefing Generator │ Chat   │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ Intelligence  │  │ Capacity        │  │ Credit Score     │
│ Service       │  │ Service         │  │ Service          │
│ (learn stats) │  │ (deterministic) │  │ (rules → ML)     │
└───────┬───────┘  └────────┬────────┘  └────────┬─────────┘
        │                   │                     │
        └───────────────────┼─────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Data Layer (Supabase + existing services)           │
│  batches │ counts │ inventory │ orders │ customers │ payments  │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│              Scheduled Jobs (Edge Function / Cron)               │
│  refresh intelligence │ generate briefings │ evaluate alerts    │
└─────────────────────────────────────────────────────────────────┘
```

### LLM responsibilities vs code responsibilities

| Task | Owner |
|------|-------|
| Max blocks from 500 bags cement | **Capacity Service** (TypeScript) |
| Waste % for next 20cm batch | **Intelligence Service** (rolling stats) |
| Explain capacity results in Amharic/English | **LLM** |
| Credit score number | **Credit Score Service** |
| “Why is Customer X high risk?” | **LLM** (given score breakdown JSON) |
| Detect waste spike vs history | **Alert rules** |
| Write alert message text | **LLM** (optional) or templates |

---

## 3. Prerequisites & Environment

### Environment variables

```env
# Already partially used
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini          # default; use gpt-4o for complex chat

# New
AI_INTELLIGENCE_REFRESH_CRON=0 2 * * *    # nightly 2 AM
AI_ALERTS_REFRESH_CRON=0 */1 * * *        # hourly
AI_CHAT_MAX_TOOL_ROUNDS=5
AI_CONTEXT_MAX_TOKENS=12000
```

### Permissions (extend `role-permissions.ts`)

| Permission | Roles |
|------------|-------|
| `ai:read` | ceo, factory_manager, finance, production (existing) |
| `ai:chat` | same (existing) |
| `ai:capacity` | ceo, factory_manager, production, warehouse |
| `ai:credit_score` | ceo, finance, sales |

### Dependencies (no new packages required for Phase 1–4)

- Phases 1–4: pure TypeScript + existing OpenAI fetch
- Phase 7 optional: Supabase Edge Functions or Vercel Cron
- Phase 8 optional: `zod` for tool schemas (likely already in project)

---

## 4. Database & Schema Changes

**Migration:** `025_ai_intelligence.sql`

### 4.1 `production_intelligence_snapshots`

Stores precomputed org/factory intelligence (refreshed by job).

```sql
CREATE TABLE production_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  sample_batches int NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}',
  -- metrics shape documented in types/production-intelligence.ts
  UNIQUE (organization_id, factory_id)
);
```

**Example `metrics` JSON:**

```json
{
  "by_block_size": {
    "20": {
      "completed_batches": 12,
      "avg_waste_rate": 0.041,
      "avg_yield_rate": 0.96,
      "avg_cement_bags_per_1000_blocks": 15.8,
      "avg_poliche_loads_per_1000_blocks": 310,
      "avg_cycle_days": 11.2,
      "last_batch_waste_rate": 0.038
    }
  },
  "global": {
    "avg_waste_rate": 0.039,
    "total_completed_batches": 45
  }
}
```

### 4.2 `capacity_snapshots`

Latest capacity calculation per factory (for fast dashboard load).

```sql
CREATE TABLE capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  inventory jsonb NOT NULL,
  predictions jsonb NOT NULL,
  limiting_factor text,
  confidence numeric(4,3),
  UNIQUE (organization_id, factory_id)
);
```

### 4.3 Customer credit score columns

```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_score int CHECK (credit_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS credit_limit numeric,
  ADD COLUMN IF NOT EXISTS credit_risk_tier text CHECK (credit_risk_tier IN ('low', 'medium', 'high', 'blocked')),
  ADD COLUMN IF NOT EXISTS credit_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_score_factors jsonb;
```

### 4.4 Extend `ai_alerts.alert_type`

Allow: `production_anomaly`, `capacity_warning`, `credit_risk`, `supplier_quality`, `inventory_critical` (document in types; no DB constraint change if `alert_type` is free text).

### 4.5 `ai_conversations` — start using it

No schema change. Wire read/write in chat API.

---

## 5. Phase 1 — Production Intelligence Core

**Duration:** ~1 week  
**Goal:** Compute company-specific stats from batch history.

### 5.1 New module: `src/lib/ai/production-intelligence.ts`

**Functions:**

| Function | Description |
|----------|-------------|
| `fetchCompletedBatches(orgId, factoryId, limit?)` | Query batches with status `completed`, include counts |
| `computeBatchMetrics(batch, counts)` | Actual output, waste rate, cement/poliche per block |
| `aggregateIntelligence(batches)` | Group by `block_size_cm`, compute rolling stats |
| `computeProductionIntelligence(input)` | Main entry — returns `ProductionIntelligence` type |

**Statistical methods (start simple):**

- **Waste rate:** `actual_waste / (actual_output + actual_waste)` or from trail counts
- **Rolling window:** last 20 completed batches per block size, or last 90 days
- **Recency weight (optional):** exponential decay so recent batches matter more
- **Confidence:** `min(0.95, 0.5 + sample_batches * 0.05)` capped per size

### 5.2 New type: `src/types/production-intelligence.ts`

Export `ProductionIntelligence`, `BlockSizeIntelligence`, `IntelligenceSnapshot`.

### 5.3 Service wrapper: `src/lib/services/production-intelligence.ts`

- `getProductionIntelligence(orgId, factoryId)` — read snapshot or compute live
- `refreshProductionIntelligence(orgId, factoryId)` — compute + upsert snapshot

### 5.4 Wire into existing prediction

Update `src/lib/block-factory/predictions.ts`:

- Replace flat historical average with per-`block_size_cm` rate from intelligence service
- Fall back to `DEFAULT_WASTE_RATE` (3%) when `sample_batches < 2`

### 5.5 Tasks checklist

- [ ] Create migration `025_ai_intelligence.sql`
- [ ] Add types
- [ ] Implement `production-intelligence.ts` lib
- [ ] Implement service + snapshot upsert
- [ ] Unit tests: waste aggregation, empty history, single batch
- [ ] Update `predictBatchProduction()` to consume intelligence

### 5.6 Acceptance criteria

- Given ≥5 completed 20cm batches, predicted waste for new 20cm batch uses learned rate (not 3% default)
- Snapshot persists and reloads without recomputing on every page view
- Confidence reflects sample size

---

## 6. Phase 2 — Capacity Dashboard

**Duration:** ~1 week  
**Goal:** “With current inventory, how many blocks and pallets can we produce?”

### 6.1 New module: `src/lib/ai/capacity.ts`

**Input:**

```typescript
type CapacityInput = {
  cementBags: number;
  cementKg: number;
  policheLoads: number;        // normalized from inventory unit
  intelligence: ProductionIntelligence;
  blockSizes?: BlockSizeCm[];  // default [20, 15, 10, 24]
};
```

**Algorithm (per block size):**

1. Read theoretical yield from `BLOCK_YIELDS[size]`
2. Apply learned `avg_waste_rate` from intelligence
3. Apply learned `avg_yield_rate` (checkpoint trail efficiency)
4. **Cement constraint:** `floor(cementBags / bags_per_1000_blocks * 1000 * (1 - waste))`
5. **Poliche constraint:** same for poliche
6. **Actual max blocks** = `min(cement_limit, poliche_limit) * efficiency`
7. **Pallets** = `floor(blocks / blocks_per_pallet)` from yields
8. **Remaining materials** after max run
9. **Duration** = `ceil(blocks / avg_daily_output)` or `avg_cycle_days` from intelligence

**Output type `CapacityPrediction`:**

```typescript
{
  block_size_cm: 20;
  label: "20cm";
  max_blocks: number;
  max_pallets: number;
  expected_waste_pct: number;
  expected_waste_pieces: number;
  cement_required_bags: number;
  poliche_required_loads: number;
  remaining_cement_bags: number;
  remaining_poliche_loads: number;
  estimated_production_days: number;
  limiting_factor: "cement" | "poliche" | "balanced";
}
```

### 6.2 Service: `src/lib/services/capacity.ts`

- `getCurrentCapacity(orgId, factoryId)` — read inventory (cement/poliche SKUs) + intelligence → compute → optional snapshot upsert
- Reuse `buildBlockStockView` / inventory items for cement & poliche quantities

### 6.3 API route: `src/app/api/ai/capacity/route.ts`

```
GET /api/ai/capacity?scope=block
→ { inventory, predictions, limiting_factor, confidence, computed_at }
```

### 6.4 UI component: `src/components/ai/production-capacity-panel.tsx`

**Location:** Block Factory dashboard + Production page (top or sidebar)

**Sections:**

1. **Current inventory** — cement bags/kg, poliche loads
2. **Possible production table** — one row per block size (blocks, pallets, waste, days)
3. **Limiting factor badge** — “Cement is the bottleneck for 20cm”
4. **Confidence** — “Based on 23 completed batches”
5. **Refresh button** — triggers recompute

**Design:** Match existing `MetricCard` / `Card` patterns from finance and inventory modules.

### 6.5 Hook: `useProductionCapacity()` in `use-api.ts`

### 6.6 Tasks checklist

- [ ] Implement `capacity.ts` lib
- [ ] Implement service + snapshot
- [ ] API route + hook
- [ ] UI panel on block factory dashboard
- [ ] UI panel on production page
- [ ] Unit tests: cement-limited, poliche-limited, zero stock

### 6.6 Acceptance criteria

- Dashboard shows max blocks/pallets for each size from live inventory
- Numbers match manual calculation using yields + learned waste
- Updates when inventory changes (invalidate on inventory/batch mutations)

---

## 7. Phase 3 — Learned Waste & Batch Predictions

**Duration:** ~3–4 days  
**Goal:** Batch-to-batch waste varies; predictions use company-specific rates.

### 7.1 Enhance intelligence metrics

Add to per-block-size metrics:

| Metric | Source |
|--------|--------|
| `waste_rate_std_dev` | Variance across batches — flag unstable production |
| `avg_drying_loss` | From checkpoint trail |
| `avg_curing_loss` | From checkpoint trail |
| `best_batch_waste_rate` | Benchmark |
| `worst_batch_waste_rate` | Anomaly detection threshold |

### 7.2 Update Production “New Batch” dialog

File: `src/app/(dashboard)/dashboard/production/page.tsx`

Show:

- **Expected waste:** X% (learned) vs Y% (theoretical default)
- **Expected output:** N blocks
- **Confidence:** based on sample size
- **Note:** “Last 5 batches averaged 4.2% waste at 20cm”

### 7.3 Supplier correlation (lightweight)

Join `material_purchases` → batches in same week:

- If waste spike follows purchase from supplier X, store flag in intelligence metadata
- Surface in Phase 5 alerts as `supplier_quality`

### 7.4 Tasks checklist

- [ ] Extend intelligence aggregation with std dev + checkpoint losses
- [ ] Update new batch UI with learned vs default comparison
- [ ] Optional supplier correlation stub in metrics JSON

---

## 8. Phase 4 — Credit Score System

**Duration:** ~1 week  
**Goal:** Safe credit sales with 0–100 score, tier, and limit.

### 8.1 New module: `src/lib/ai/credit-score.ts`

**Features computed per customer:**

| Feature | Calculation |
|---------|-------------|
| `balance_to_lifetime_sales_ratio` | `balance / max(total_picked_sales, 1)` |
| `avg_days_to_pay` | Mean days from pick → next payment |
| `payment_count_90d` | Activity signal |
| `open_order_exposure` | Sum credit on `ordered` status |
| `pct_orders_with_deposit` | Orders with `amount_paid > 0` at creation |
| `account_age_days` | Since `created_at` |

**Phase 1 scoring (rule-based, 0–100):**

```
score = 100
score -= balance_to_sales * 40          (cap -40)
score -= min(avg_days_to_pay / 2, 25)   (slow payers)
score -= open_order_exposure / 1000 * 5 (cap -20)
score += min(payment_count_90d * 2, 10) (active payers bonus)
score += pct_deposit * 10
score = clamp(score, 0, 100)
```

**Tiers:**

| Score | Tier | Default limit behavior |
|-------|------|------------------------|
| 80–100 | `low` | Auto limit = 2× avg monthly sales |
| 60–79 | `medium` | 1× avg monthly sales |
| 40–59 | `high` | 0.5× or manual approval |
| 0–39 | `blocked` | New credit orders require override |

Store breakdown in `credit_score_factors` JSON for LLM explanation.

### 8.2 Service: `src/lib/services/credit-score.ts`

- `computeCustomerCreditScore(customerId)`
- `refreshAllCreditScores(orgId)` — batch job
- `evaluateOrderCreditRisk(customerId, orderAmount)` — returns `{ allowed, score, reason }`

### 8.3 UI changes

**Customers page** (`customers/page.tsx`):

- Credit score badge (color by tier)
- Score breakdown tooltip
- Manual limit override field

**Order creation** (`orders/page.tsx`):

- Warning/block if score tier is `high` or `blocked`
- Extend existing `ai_risk_flag` to include credit risk reason

### 8.4 Tasks checklist

- [ ] Migration for customer credit columns
- [ ] Implement credit-score lib + service
- [ ] Customer UI badges
- [ ] Order creation credit check
- [ ] Unit tests: new customer, chronic debtor, good payer

---

## 9. Phase 5 — Alert & Briefing Engine

**Duration:** ~1 week  
**Goal:** Proactive issues without user asking.

### 9.1 Alert rules engine: `src/lib/ai/alert-rules.ts`

| Rule ID | Trigger | Severity |
|---------|---------|----------|
| `waste_spike` | Batch waste > avg + 2σ for size | warning |
| `yield_drop` | Trail yield < 90% of historical | warning |
| `batch_overdue` | Past expected completion + 2 days | critical |
| `capacity_shortfall` | Open order qty > capacity for size | warning |
| `credit_limit_breach` | New order would exceed limit | critical |
| `credit_score_drop` | Score dropped >15 pts since last refresh | warning |
| `negative_cash_flow` | Already in finance — persist to ai_alerts | warning |
| `low_stock_production` | Cement/poliche below next batch need | critical |

Each rule returns `{ shouldFire, title, message, entity_type, entity_id, severity }`.

### 9.2 Briefing generator: `src/lib/ai/briefing-generator.ts`

**Inputs:** intelligence snapshot, capacity snapshot, finance metrics, top alerts, open orders.

**Output:** insert into `ai_briefings`:

```typescript
{
  role: "ceo" | "factory_manager" | "finance",
  summary: string,           // 2–3 paragraphs — LLM optional
  confidence_level: number,
  data_gaps: string[],
  generated_at: now()
}
```

**Two modes:**

1. **Template mode (Phase 5a):** structured summary without LLM — ship fast
2. **LLM mode (Phase 5b):** pass JSON context to OpenAI for narrative briefing

### 9.3 Wire to notifications

Extend existing `syncAiAlertsToNotifications` in `src/lib/services/notifications.ts`:

- Map new alert types to roles
- Deep links: production batch, customer, inventory

### 9.4 Tasks checklist

- [ ] Implement alert-rules.ts
- [ ] Implement briefing-generator.ts (template mode first)
- [ ] Service: `runAlertEvaluation(orgId)` → insert unresolved alerts
- [ ] Service: `generateBriefings(orgId)` → upsert ai_briefings
- [ ] Connect to notification sync
- [ ] Update AI dashboard page to show real briefings

---

## 10. Phase 6 — Grounded AI Chat (Tool Calling)

**Duration:** ~1.5 weeks  
**Goal:** User asks anything; AI returns answers backed by live data.

### 10.1 Tool registry: `src/lib/ai/tools/index.ts`

Define tools with JSON schema (OpenAI function calling format):

| Tool name | Returns |
|-----------|---------|
| `get_inventory_summary` | Stock by type, low stock items |
| `get_production_capacity` | Capacity snapshot |
| `get_production_intelligence` | Learned waste/yield stats |
| `get_batch_status` | Active batches, phases, overdue |
| `get_finance_summary` | Revenue, collections, cash flow, outstanding |
| `get_customer_credit` | Balance, score, tier, recent payments |
| `get_open_orders` | Orders by status |
| `get_supplier_credit` | AP balances, recent payments |
| `get_reorder_alerts` | Low stock SKUs |

Each tool wraps an **existing service** — no duplicate query logic.

### 10.2 Tool executor: `src/lib/ai/tools/executor.ts`

- Receives tool name + args
- Validates permissions (role-scoped)
- Calls service
- Returns JSON (truncate if > N tokens)

### 10.3 Chat orchestrator: `src/lib/ai/chat-orchestrator.ts`

**Flow:**

```
1. User message
2. Load conversation history from ai_conversations (last 10 turns)
3. Send to OpenAI with tools defined
4. If tool_calls → execute → send results → repeat (max 5 rounds)
5. Final natural language answer
6. Save conversation
```

**System prompt (fixed):**

- You are BlockERP assistant for Elecnovatech block factory
- NEVER invent numbers — only use tool results
- If data missing, say what is missing
- Currency: Birr
- Block sizes: 10, 15, 20, 24 cm

### 10.4 Update `/api/ai/route.ts`

- POST `{ message }` → use chat orchestrator
- Pass `scope`, `role` from query/body
- Return `{ reply, tools_used?, data? }`

### 10.5 UI enhancements (`ai/page.tsx`)

- Show “Sources” chips when tools were used
- Suggested prompts:
  - “How many 20cm blocks can we produce today?”
  - “Which customers have the highest credit risk?”
  - “What batches are overdue?”
  - “Summarize this month’s cash flow”

### 10.6 Tasks checklist

- [ ] Define all tools + schemas
- [ ] Implement executor with permission checks
- [ ] Implement orchestrator with tool loop
- [ ] Wire ai_conversations persistence
- [ ] Update AI page UI
- [ ] Integration tests: capacity question, finance question, unknown data

---

## 11. Phase 7 — Scheduled Jobs & Refresh Pipeline

**Duration:** ~3–4 days  
**Goal:** Intelligence stays fresh without page-load computation.

### 11.1 Job: `refresh-ai-intelligence`

**Schedule:** Daily 2:00 AM + on-demand after batch completion

**Steps:**

1. For each factory in org:
   - `refreshProductionIntelligence()`
   - `getCurrentCapacity()` → upsert snapshot
   - `refreshAllCreditScores()`
2. `runAlertEvaluation()`
3. `generateBriefings()`

### 11.2 Implementation options

| Option | Pros |
|--------|------|
| **Supabase Edge Function + pg_cron** | Close to data, easy scheduling |
| **Vercel Cron → API route** | Simple if deployed on Vercel |
| **Manual “Refresh AI” button** | Good for demo / Phase 1 |

**Recommendation:** Start with **on-demand refresh** (batch complete hook + dashboard button), add cron in Phase 7.

### 11.3 Invalidate caches

On batch complete, purchase receive, customer payment:

- Invalidate React Query keys: `["ai", "capacity"]`, `["ai", "intelligence"]`, `["ai", "briefing"]`

Hook into existing mutations in `use-api.ts`.

### 11.4 Tasks checklist

- [ ] API route `POST /api/ai/refresh` (admin/manager only)
- [ ] Call refresh after batch status → completed
- [ ] Set up cron (Edge Function or Vercel)
- [ ] Logging: job duration, errors, records processed

---

## 12. Phase 8 — Polish, Testing & Rollout

**Duration:** ~1 week

### 12.1 Documentation

- User guide: Capacity dashboard, credit scores, AI chat prompts
- Admin guide: refresh jobs, OpenAI key setup
- This plan → mark completed phases

### 12.2 Testing

- Unit tests: intelligence, capacity, credit score, alert rules
- Integration: API routes with demo auth
- Manual QA script (see [Testing Strategy](#15-testing-strategy))

### 12.3 Performance

- Snapshots prevent heavy aggregation on every page load
- Cap batch history query at 200 completed batches
- Chat tool results max 4KB each

### 12.4 Rollout

1. **Internal** — factory_manager + ceo only
2. **Beta** — production team sees capacity panel
3. **General** — credit scores on customers, chat for all permitted roles

### 12.5 Future enhancements (post-v1)

- ML regression for waste (Python microservice)
- Demand forecast from order history
- Amharic briefing generation
- WhatsApp/SMS for critical alerts
- Fine-tuned model on anonymized batch summaries (only if ROI proven)

---

## 13. File & Module Map

### New files to create

```
src/
├── lib/
│   └── ai/
│       ├── production-intelligence.ts   # aggregate batch stats
│       ├── capacity.ts                    # max production from stock
│       ├── credit-score.ts                # score computation
│       ├── alert-rules.ts                 # proactive alerts
│       ├── briefing-generator.ts          # daily briefings
│       ├── chat-orchestrator.ts           # tool-calling loop
│       └── tools/
│           ├── index.ts                   # tool definitions
│           └── executor.ts                # run tools with auth
├── lib/services/
│   ├── production-intelligence.ts
│   ├── capacity.ts
│   └── credit-score.ts
├── types/
│   └── production-intelligence.ts
├── components/ai/
│   └── production-capacity-panel.tsx
└── app/api/ai/
    ├── capacity/route.ts
    └── refresh/route.ts

supabase/migrations/
└── 025_ai_intelligence.sql
```

### Files to modify

```
src/lib/block-factory/predictions.ts       # use learned waste
src/app/api/ai/route.ts                    # grounded chat
src/app/(dashboard)/dashboard/ai/page.tsx  # sources, prompts
src/app/(dashboard)/dashboard/production/page.tsx  # learned waste UI
src/components/block-factory/block-factory-dashboard.tsx  # capacity panel
src/app/(dashboard)/dashboard/customers/page.tsx  # credit score
src/app/(dashboard)/dashboard/orders/page.tsx     # credit check
src/hooks/use-api.ts                       # new hooks
src/lib/services/index.ts                  # exports
src/lib/services/notifications.ts          # new alert types
src/lib/services/production.ts             # refresh on batch complete
src/types/index.ts                         # credit + AI types
```

---

## 14. API Surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ai?scope=&role=` | Briefing + alerts (existing, enhanced) |
| POST | `/api/ai` `{ message }` | Grounded chat with tools |
| POST | `/api/ai` `{ action: "resolve_alert", id }` | Existing |
| GET | `/api/ai/capacity?scope=block` | Capacity predictions |
| GET | `/api/ai/intelligence?scope=block` | Learned stats |
| POST | `/api/ai/refresh` | Manual/cron intelligence refresh |
| GET | `/api/customers/:id/credit` | Score detail (optional) |

---

## 15. Testing Strategy

### Unit tests

| Module | Cases |
|--------|-------|
| `production-intelligence` | Empty batches, single batch, 20 batches, mixed sizes |
| `capacity` | Cement-limited, poliche-limited, zero stock, learned vs default waste |
| `credit-score` | New customer, high balance, fast payer, blocked tier |
| `alert-rules` | Waste spike, overdue batch, credit breach |

### Manual QA script

1. Complete 3+ batches at 20cm with different waste → verify learned rate changes
2. Open capacity dashboard → verify numbers vs spreadsheet
3. Create customer with high balance → verify score tier
4. Ask AI chat: “How many 20cm blocks can we produce?” → must match dashboard
5. Ask AI chat: “What is revenue this month?” → must match finance dashboard
6. Trigger waste spike batch → verify alert appears in notifications

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM hallucinates numbers | Tools-only for quantitative answers; system prompt enforcement |
| Too few batches for learning | Fall back to 3% default; show low confidence |
| OpenAI cost | Use gpt-4o-mini; cache briefings daily; limit chat history |
| Slow aggregation | Snapshots + incremental refresh |
| Credit score unfair to new customers | Neutral default 70 until 3+ orders |
| Data privacy | No PII in logs; optional Azure OpenAI for enterprise |

---

## 17. Success Metrics

| Metric | Target (90 days post-launch) |
|--------|------------------------------|
| Capacity dashboard daily views | Used by production manager daily |
| Prediction accuracy (waste) | Within ±1.5% of actual for 20cm |
| AI chat grounded answers | 95%+ numeric answers match tool output |
| Credit write-offs | Measurable reduction vs baseline |
| Alert resolution time | <24h for critical alerts |
| User satisfaction | Production team prefers learned vs fixed 3% |

---

## 18. Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 — Intelligence core | 5–7 days | Week 1 |
| Phase 2 — Capacity dashboard | 5–7 days | Week 2 |
| Phase 3 — Learned waste UI | 3–4 days | Week 2–3 |
| Phase 4 — Credit score | 5–7 days | Week 3–4 |
| Phase 5 — Alerts & briefings | 5–7 days | Week 4–5 |
| Phase 6 — Grounded chat | 7–10 days | Week 5–7 |
| Phase 7 — Scheduled jobs | 3–4 days | Week 7 |
| Phase 8 — Polish & rollout | 5 days | Week 8 |

**Total:** ~8 weeks for one developer, or ~4–5 weeks with two developers working parallel tracks:

- **Track A:** Intelligence + Capacity + Waste (Phases 1–3)
- **Track B:** Credit + Alerts (Phases 4–5)
- **Track C:** Chat + Jobs (Phases 6–7) — starts after Track A has capacity service

---

## Recommended starting point

**Start with Phase 1 + Phase 2 together** — they deliver the most visible value (“Current Production Capacity” with learned waste) and unlock everything else. Phase 6 (chat) should come **after** the services exist so tools have real data to return.

---

*Document version: 1.0*  
*Last updated: 2026-07-13*
