# Local Supabase Migration Plan

Goal:
Stop direct development against hosted Supabase. Use Docker + Supabase CLI locally to create
tables and migrations, then deploy to hosted Supabase.

Assumptions:
- Supabase CLI is installed and working (`supabase --version`).
- Docker is installed and working.
- Migrations exist under `supabase/migrations`.
- `supabase/config.toml` is present.

Current Docker setup:
- `docker-compose.dev.yml` runs only the Next.js dev server.
- `docker-compose.yml` runs only the Next.js production server.
- Supabase is not part of Compose; it is started separately via Supabase CLI.

Plan:
1) Local Supabase setup
   - Run `supabase start` to launch local Supabase.
   - Run `supabase status` to capture URL/keys.
   - Switch `.env.development` to local Supabase URL/keys.
   - Note: `[db.seed]` is enabled but `supabase/seed.sql` is missing.
     Choose one:
       A) Set `enabled = false`
       B) Create `supabase/seed.sql`

2) Migration workflow (local)
   - Apply existing migrations locally:
     - `supabase db reset`
   - After schema changes, generate migrations:
     - `supabase db diff --local` (add `--schema public` if needed)
   - Save generated SQL under `supabase/migrations`.

3) Deploy to hosted Supabase
   - `supabase link --project-ref <project_ref>`
   - `supabase db push`
   - If types are needed, run `npm run supabase:types`.

4) Dev startup flow
   - Supabase:
     - `supabase start`
     - `supabase status`
   - Next.js:
     - Local: `npm run dev`
     - Docker: `docker compose -f docker-compose.dev.yml up --build`

5) Change management rules
   - Do all schema changes locally and generate migrations.
   - Do not apply DDL directly on hosted Supabase.
   - Keep migration timestamps ordered.

6) Risks and mitigations
   - Seed file missing may break `db reset`:
     -> disable `[db.seed]` or create `supabase/seed.sql`.
   - Postgres version mismatch:
     -> align `db.major_version` in `supabase/config.toml` with hosted.
   - Migration order conflicts:
     -> keep `supabase/migrations` ordered by timestamp.

Next actions:
- Decide seed policy (disable or add seed file).
- Switch `.env.development` to local Supabase.
- Run `supabase db reset` and validate existing migrations locally.
