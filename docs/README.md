# EMBERWICK — Game Design System

A real-time, collaborative **game design document (GDD)** editor. Teams write living design
docs together — organized as sections → pages → blocks — with live presence (see who's online)
and per-keystroke editing that broadcasts to everyone instantly.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres + Realtime + Auth)

## Quick start

```bash
npm install

# Create .env.local in the repo root with your Supabase project keys:
#   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
#   NEXT_PUBLIC_SITE_URL=https://game-design-two.vercel.app

npm run dev   # http://localhost:3000
```

You also need a Supabase project with `supabase/schema.sql` applied and OAuth providers
(Google / GitHub) enabled. Add redirect URLs for `http://localhost:3000/auth/callback`
and `https://game-design-two.vercel.app/auth/callback`. See the full setup in
[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md#running-locally).

## Scripts

| Command         | Purpose                              |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server on port 3000    |
| `npm run build` | Production build                     |
| `npm start`     | Run the production build             |
| `npm run lint`  | ESLint (Next.js defaults)            |

## Routes

| Path             | Description                                   |
| ---------------- | --------------------------------------------- |
| `/`              | Landing page                                  |
| `/login`         | OAuth sign-in (Google / GitHub)               |
| `/auth/callback` | OAuth redirect handler                        |
| `/doc`           | The collaborative editor (requires auth)      |

## Documentation

- **[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)** — full onboarding: architecture,
  project structure, features, data model, and how to run it locally. **Start here if you're new.**
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** — git workflow and push rules. **Read this
  before pushing code** so we avoid merge conflicts.
