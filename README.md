# Hotzonex Tracker

Daily takings, running costs, purchases and USD savings for the Hotzonex WiFi sites
(Jebel Iraq HQ, Sub-Office, Gorom, Home). React + Vite, data in Supabase, hosted on Vercel.

```
npm install
npm run dev      # local app
npm run build    # production build into dist/
npm run lint
```

## How the money is counted
- **Profit** = taken in − running costs − purchases
- **Cash left** = profit − SSP moved into USD savings (saving isn't a loss, so it's shown after profit)

All of it lives in `src/lib/ledger.js`.

## Who can do what
| Role | Sees | Records | Deletes | Team |
|---|---|---|---|---|
| Admin | all sites | yes | yes | yes |
| Manager | all sites | yes | no | no |
| Staff | own site only | own site | no | no |
| Viewer | all sites | no | no | no |

These rules are enforced by the database (row-level security), not just hidden in the app.

## One-time setup for secure sign-in

The old app checked passwords against the `app_users` table, which anyone could read.
The new app uses Supabase Auth. Do these steps in order.

**Step A: prepare (the old app keeps working)**
1. Supabase → SQL Editor → paste and run the top part of `supabase/migrations/001_profiles.sql`
   (everything above the "COPY" line).
2. Supabase → Authentication → Users → **Add user** for each person who uses the app.
   Use the same email as before, a **new** password, and tick **Auto Confirm User**.
3. SQL Editor → run the "COPY" part at the bottom of `001_profiles.sql`.
   The final query should list everyone with their role and site.
4. Vercel → Project `hotzonex-app-tracking` → Settings → Environment Variables → add
   `SUPABASE_SERVICE_ROLE_KEY` (from Supabase → Project Settings → API → `service_role`).
   Needed only by the Team screen; never put this key in the app code.

**Step B: switch over**
1. SQL Editor → run `supabase/migrations/002_lock_down.sql`.
2. Merge the new app into `main` (Vercel deploys it).
3. Sign in with the new passwords. Once everyone has, drop the old table
   (`drop table public.app_users;`, the last line of `002_lock_down.sql`).

Because the old passwords were readable, change them anywhere else they were reused.

## Layout
- `src/screens/`: Sign in, Today, Record (takings, purchase, USD exchange), Reports, Team
- `src/components/`: shared pieces, including `SignalBars` (the takings chart)
- `src/lib/`: Supabase client, data access, dates, sites and roles, money maths
- `src/styles/`: design tokens (light and dark) and layout
- `api/users.js`: Vercel function for admin team changes (uses the service-role key)
