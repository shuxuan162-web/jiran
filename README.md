# Jiran · City of Elmina

The residents' app for City of Elmina by Sime Darby Property, built for the **SDP University Hackathon 2026, Theme 1: People**.

**The one problem we solve:** residents waste time chasing updates because they don't know whom to contact or how to track an issue. Jiran is one channel for reporting, prioritising and tracking township problems, with emergencies always first, on a live map of the township.

- Live app: https://jiran-elmina.vercel.app (demo mode on)
- Health check: https://jiran-elmina.vercel.app/health
- Setup and deployment: [DEPLOY.md](DEPLOY.md)

## Build status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Schema, RLS, 4 roles, owner sign-up + verification, sub-owner invites, admin verification queue, /health, deploy | **Live** |
| 2 | Issues: report, duplicates, upvote, priority, tracking, comments, feedback, admin queue | **Live** |
| 3 | Live map (Google Maps with OpenStreetMap fallback, Organic Maps links), SOS and emergencies, urgent queue, ordering view | **Live** |
| 4 | Announcements and maintenance notices (area targeting, scheduling), notification centre, township feed with moderation, events with RSVP and check-in, weekly newsletter, analytics-lite | **Live** |
| 5 | XP ledger (database-only), levels, badges, weekly quests, township goal, leaderboard with opt-out, character editor with level-locked cosmetics; support numbers on Residence | **Live** |
| 6 | Properties (official City of Elmina listings, viewing/enquiry form, admin enquiries), Elmina Lakeside Mall directory, township facts and Places map layer | **Live** |
| 7 | Scan QR with the camera (event check-in, link safety, type-the-code fallback), visitor passes with guardhouse scan and host alert, car plates, FAQ search, feedback, help. Test: `node e2e/smoke-phase7.cjs` (uses a fake camera) | **Live** |
| 8 | English only (Bahasa Melayu removed; the locale map stays so a language can be added later, and an old stored "bm" choice loads in English). Demo controls and Book facilities removed | Built, waiting for migration 0009 |
| 9A | Billing reminders (#24): no invented bills. Management adds bills per unit or imports a CSV (preview with row errors), marks paid, voids, attaches invoices (private bucket, signed links, unit owners only). Owners see due soon / overdue / paid with icon + text, a reminder toggle per bill, and in-app reminders worked out when the app opens. Sub-owners are blocked by RLS | Built, waiting for migration 0010 |
| 9B | Service requests and enquiries (#21): private to the requester, the unit owner and management. Categories editable by management (starting set is proposed). Timeline Submitted → Acknowledged → Assigned → In progress → Completed with notes and handler, cancel before assignment, rating. Management queue with filters, assignment, internal notes, audit trail | Built, waiting for migration 0011 |
| 9C | Surveys (#22) and FAQ (#23) for management: write and open surveys (residents notified, answer once, results without names); edit the FAQ residents search; read feedback. Test for 8-9C: `node e2e/smoke-phase9.cjs`; database rules: `bash e2e/db/run.sh e2e/db/phase9_test.sql` | Built, waiting for migration 0012 |

## Architecture

- **Frontend:** React 18 + Vite + TypeScript, mobile-first (360-430 px), one codebase for residents (`/`) and staff (`/admin`). Hosted on Vercel as static files.
- **Backend:** Supabase Postgres with Row Level Security on every table. All rules live in the database: RLS policies, `SECURITY DEFINER` RPCs that check the caller, and triggers. The browser only has the public publishable key.
- **Edge functions:** `register-owner` and `accept-invite` create accounts with the service role, because owners need a confirmed account plus a private profile in one step and sub-owners must never self-register.
- **Privacy:** IC/passport numbers are never stored, only a salted SHA-256 hash and the last 4 characters. Other residents see nickname, avatar and precinct only. Ownership certificates sit in a private bucket readable by the owner and management through 60-second signed links.

### Roles

| Role | Signs in at | Can |
| --- | --- | --- |
| Owner | `/login/owner` | Everything for residents, invite up to 6 sub-owners, see the unit's bills and every service request for the unit |
| Sub-owner | `/login/sub-owner` (invite only) | Resident features; no billing, sees only their own service requests, cannot invite |
| Management | `/admin/login` | Full admin app |
| Security desk | `/admin/login` | Urgent panel, map, health only |

## Priority formula (phase 2)

P = 0.40·S + 0.25·U + 0.20·A + 0.15·T, each 0-100. S severity (rules by category and keywords), U upvotes against the current maximum, A distinct units affected within 200 m against the current maximum, T days waiting (14 days = 100). Weights live in `app_config.priority_weights`. Gamification never touches this score.

**Global ordering rule:** (1) active emergencies, (2) urgent safety notices and active maintenance in the resident's areas, (3) everything else by relevance. Posts and events can never outrank 1 or 2. Enforced in a database view.

## What is simulated

| Thing | How it works in the demo |
| --- | --- |
| Emails | Written to `email_outbox` and shown under Profile > Email preview, labelled Simulated |
| PRIME login | Simulated lookup (later phase) |
| Calling 999 | Demo mode replaces the dialer with a modal; never dials during testing |
| Units | 12 placeholder units per area, labelled "(demo)" |
| Area locations | Rough centre points from Google Maps screenshots, `verified = false` |
| Bills | None. Jiran isn't connected to SDP billing; bills appear only when management enters or imports them. Payments happen outside Jiran |

## Local development

```bash
cp .env.example .env.local   # fill in Supabase URL and publishable key
npm install
npm run dev                  # http://localhost:5173
npm test                     # unit tests
npm run ci                   # tests + type check + production build (what Vercel runs)
```

## UI handoff guide (for the designer)

- **Restyle:** every colour, font, size, radius, spacing and shadow is in `src/theme/tokens.ts`. Change values there; components read them as CSS variables.
- **Components:** thin, presentational pieces are in `src/components/ui/`. Data and logic live in `src/features/` and `src/lib/`, so a component can be swapped without touching behaviour.
- **Words:** English only. Every resident-facing string is in `src/i18n/en.ts`; `src/i18n/index.tsx` keeps a locale map so another language can be added later (a stored old "bm" choice falls back to English).
- **Avatar art:** placeholder initials today; layered SVG parts go in `assets/avatar/` with a manifest in phase 5.

## Repository layout

```
supabase/migrations/   versioned SQL, run in order
supabase/seed.sql      re-runnable demo data
supabase/functions/    register-owner, accept-invite
src/theme/             tokens + global CSS
src/i18n/              strings
src/lib/               supabase client, validation (tested), helpers
src/features/          auth state and onboarding logic
src/components/ui/     presentational parts and icons
src/screens/           auth, resident, admin, health
```
