# Elecnovatech Enterprise AI Operating System

Production-ready operational and intelligence platform for **Block Factory** and **Plastic Recycling Factory** — built on Next.js, Supabase, and TypeScript.

## Features

| Module | Capabilities |
|--------|-------------|
| **Finance** | Sage 50 mirror, reconciliation workspace, sync agent, variance alerts |
| **Production** | Block factory 3-checkpoint counting, recycling 3-number cycle, auto yield/damage |
| **Inventory** | Real-time ledger, low-stock alerts, stock count workflow |
| **Sales** | Orders board, customer directory, delivery proof (photo/signature/GPS) |
| **HR** | Employee directory, attendance, leave requests |
| **AI** | Role-scoped briefings, proactive alerts, analyst chat with confidence levels |
| **Reporting** | PDF/Excel export, scheduled report templates |
| **Mobile** | Offline-first floor capture with auto-sync |
| **Admin** | Configurable RBAC (roles/permissions as data) |
| **Audit** | Immutable change log on all key records |

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Radix UI
- **Backend:** Supabase (Auth, PostgreSQL, Storage, RLS)
- **State:** TanStack Query, Zustand
- **AI:** OpenAI-compatible API (optional) + rule-based analytics
- **Reports:** jsPDF, SheetJS

## Quick Start (Demo Mode)

No Supabase required for local demo:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with demo credentials:

| Role | Email | Password |
|------|-------|----------|
| CEO | ceo@elecnovatech.com | demo1234 |
| Finance | finance@elecnovatech.com | demo1234 |
| Factory Manager | manager.block@elecnovatech.com | demo1234 |
| Floor Worker | floor@elecnovatech.com | demo1234 |
| Driver | driver@elecnovatech.com | demo1234 |

Demo mode uses an in-memory store with full CRUD via API routes — all mutations persist for the session.

## Production Setup (Supabase)

1. Create a Supabase project
2. Copy `.env.example` → `.env.local` and fill in keys
3. Run migrations:

```bash
npx supabase db push
# or apply files in supabase/migrations/ via Supabase SQL editor
```

4. Configure Supabase Auth (email/password, MFA for Finance/Executives)
5. Seed demo org data from `002_seed_and_rls.sql`

## Sage 50 Sync Agent

See [`sync-agent/README.md`](sync-agent/README.md). Install on the client's Sage 50 Windows machine. One-way sync every 15–60 minutes plus manual **Sync Now** in Finance.

## Project Structure

```
src/
├── app/              # Routes (dashboard, mobile, API)
├── components/       # UI + layout + mobile
├── hooks/            # TanStack Query hooks
├── lib/
│   ├── api/          # Client + auth helpers
│   ├── data/         # Demo seed + mutable store
│   └── services/     # Business logic (Supabase + demo)
├── providers/        # Auth, theme, offline sync
├── stores/           # Zustand (scope, offline queue)
└── types/            # Shared TypeScript types
supabase/migrations/  # Schema, RLS, triggers
sync-agent/           # Windows Sage 50 connector
```

## Assumptions (Documented)

1. **Demo mode** — When Supabase is not configured, the app runs fully functional with in-memory persistence (resets on server restart).
2. **Sage 50 connector** — The sync agent includes a placeholder data reader; production deployment requires ODBC/SDK integration for the client's exact Sage 50 version.
3. **Mobile app** — Implemented as a responsive PWA-style web mobile route group (`/mobile`); can be wrapped in Capacitor/React Native later without backend changes.
4. **AI calculations** — Yield rates, damage rates, capacity, and credit scores are computed in application code (not LLM) for exact numbers; Grok (xAI) is used only for natural-language chat/briefings when `XAI_API_KEY` is set.
5. **Factory scoping** — RLS enforces org-level isolation; factory-level filtering is applied in services based on user role and view scope switcher.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
XAI_API_KEY=
XAI_MODEL=grok-3-mini
SAGE50_SYNC_API_KEY=
SAGE50_SYNC_SECRET=
```

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## Security

- TLS everywhere (deployment)
- Row Level Security on all tables
- Server-side permission checks on every API route
- Immutable audit log
- MFA support for Finance/Executives (column + UI ready)
- Sage sync authenticated via API key + secret headers

## License

Proprietary — Elecnovatech PLC
