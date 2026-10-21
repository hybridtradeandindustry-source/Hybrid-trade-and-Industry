# How to Run

Three separate Supabase projects. Same app code, different env files.

| Environment | Env file | Project ref | Use for |
|-------------|----------|-------------|---------|
| **Development** | `.env.development` | `rqbyzyfrnvnddtpylsil` | Local coding & testing |
| **Demo** | `.env.demo` | `zjnhpqauchdrertcwyxu` | Demo deployment / demos |
| **Production** | `.env.production` | `qambigplwssknupaptue` | Live production app |

**`.env.local`** is the active file Next.js reads. It is copied automatically from one of the three files above.

---

## 1. First-time setup

```bash
npm install
npx supabase login          # once — links CLI to your Supabase account
```

Make sure these files exist with real keys (see `.env.example` / `*.template` if missing):

- `.env.development`
- `.env.demo`
- `.env.production`

Apply migrations to **each** project (first time only):

```bash
npm run db:push:dev
npm run db:push:demo
npm run db:push:prod
```

---

## 2. Run locally (pick one database)

Use the command that matches the database you want — each one sets `.env.local` **and** starts the server:

| Command | Connects to |
|---------|-------------|
| `npm run dev:dev` | **Development** (default for coding) |
| `npm run dev:demo` | **Demo** |
| `npm run dev:prod` | **Production** ⚠️ real data |

Open **http://localhost:3000**

**Or switch env first, then run plain `dev`:**

```bash
npm run use:demo     # copies .env.demo → .env.local
npm run dev          # uses whatever is already in .env.local
```

> `npm run dev` alone does **not** change the env — it uses the current `.env.local`.
> Use `dev:demo` / `dev:dev` / `dev:prod` to switch and start in one step.

---

## 3. Migrations (after schema changes)

When you add a new file under `supabase/migrations/`:

**Always follow this order:**

```bash
1. npm run db:push:dev      # test on development first
2. npm run db:push:demo     # then demo
3. npm run db:push:prod     # finally production
```

**Check what is applied:**

```bash
npm run db:status:dev
npm run db:status:demo
npm run db:status:prod
```

---

## 4. Deployments

| Where | Env vars source |
|-------|-----------------|
| Your machine (coding) | `.env.development` via `npm run dev:dev` |
| Demo hosting (Vercel etc.) | Copy from `.env.demo` into host env settings |
| Production hosting | Copy from `.env.production` into host env settings |

Do **not** upload `.env.*` files to git or hosting as files — paste keys into the host's environment variable UI.

---

## 5. Production build (local test)

```bash
npm run use:prod          # or use:dev / use:demo
npm run build
npm run start
```

---

## Quick reference

| Task | Command |
|------|---------|
| Run dev (current `.env.local`) | `npm run dev` |
| Run dev (development) | `npm run dev:dev` |
| Run dev (demo) | `npm run dev:demo` |
| Run dev (production) | `npm run dev:prod` |
| Switch active env | `npm run use:dev` / `use:demo` / `use:prod` |
| Push migrations | `npm run db:push:dev` / `db:push:demo` / `db:push:prod` |
| Migration status | `npm run db:status:dev` / `db:status:demo` / `db:status:prod` |

---

## Rules

1. **Never commit** `.env.development`, `.env.demo`, `.env.production`, or `.env.local` — they contain secrets.
2. **Development first** — always test migrations on dev before demo or prod.
3. **One migrations folder** — `supabase/migrations/` is shared; push the same files to all three projects.
4. **Production is live data** — use `dev:prod` / `db:push:prod` only when you mean it.
