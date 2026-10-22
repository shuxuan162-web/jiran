# Jiran · City of Elmina

**Jiran** ("neighbour" in Malay) is a residents' app for **City of Elmina**, the Sime Darby Property township in Shah Alam. It was built by **Team Sims City** for the **SDP University Hackathon 2026, Theme 1: People**.

> **The problem we solve:** residents waste time chasing updates because they don't know whom to contact or how to track an issue.
> **Our answer:** one channel to report, prioritise and track township problems, with emergencies always first, on a live map of the township. Around it sit the everyday things residents need from management: notices, events, visitors, service requests and billing reminders.

| | |
| --- | --- |
| Live app | https://jiran-elmina.vercel.app (demo mode on: 999 is never dialled) |
| Management app | https://jiran-elmina.vercel.app/admin/login |
| Health check | https://jiran-elmina.vercel.app/health |
| Source | https://github.com/shuxuan162-web/jiran |
| Setup and deployment | [DEPLOY.md](DEPLOY.md) |

**Team Sims City:** Haley (team leader), Benedic, Marcus, Kylie, Shu Xuan.

---

## Contents

1. [Who uses Jiran](#who-uses-jiran)
2. [Try it: demo accounts](#try-it-demo-accounts)
3. [Features](#features)
4. [How issues are prioritised](#how-issues-are-prioritised)
5. [Privacy and safety](#privacy-and-safety)
6. [Architecture](#architecture)
7. [What is real and what is simulated](#what-is-real-and-what-is-simulated)
8. [Running it locally](#running-it-locally)
9. [Testing](#testing)
10. [Repository layout](#repository-layout)
11. [Build history](#build-history)
12. [Known limitations](#known-limitations)
13. [For the designer](#for-the-designer)

---

## Who uses Jiran

| Role | Signs in at | What they can do |
| --- | --- | --- |
| **Owner** | `/login/owner` | Every resident feature, plus billing reminders for their unit, every service request for their unit, and inviting up to 6 sub-owners. Registers with an ownership certificate that management verifies. |
| **Sub-owner** (family or tenant) | `/login/sub-owner`, invite only | Resident features. No billing, sees only their own service requests, cannot invite. Access ends the moment the owner removes them. |
| **Township management** | `/admin/login` | The full management app: urgent panel, issue queue, publishing, moderation, verification, services, billing, surveys and analytics. |
| **Security desk** | `/admin/login` | Urgent panel, live map, guardhouse visitor scan and health check only. |

Residents use a mobile-first app (designed for 360 to 430 px wide phones) with five tabs: **Residence**, **Mall**, **Map** (centre), **Properties** and **Profile**. Staff use a desktop admin app with a sidebar.

---

## Try it: demo accounts

Password for every account: **`JiranDemo2026!`** (public demo credentials; change or delete them before any real use).

| Who | Email | Notes |
| --- | --- | --- |
| Management | admin@jiran.example.com | Admin app |
| Security desk | security@jiran.example.com | Urgent, Map, Guardhouse scan, Health |
| Owner, Elmina Green | lakewalker@jiran.example.com | Has a sub-owner |
| Owner, Elmina Valley | kopikaki@jiran.example.com | Verified, level 3 in rewards |
| Sub-owner of LakeWalker | nasilemak@jiran.example.com | Signs in at `/login/sub-owner` |
| Owner, Denai Alam | cyclingauntie@jiran.example.com | Verified |
| New owner | newneighbour@jiran.example.com | Waiting for verification |

**Demo day:** run `supabase/seed_phase4.sql` again on the morning of the demo. Its times are relative to "now", so the "Drop-in coffee morning (demo, open now)" event is open for check-in (code `135790`).

---

## Features

### For residents

**Report and track issues (the core)**
- Report a problem in four steps: drop a pin on the map, pick a category, describe it, add a photo. Jiran shows **similar reports nearby** first so residents upvote instead of sending duplicates.
- Every report gets a reference number (`JRN-YYMM-NNNN`), a **queue position** and a timeline (Received → Seen → Assigned → In progress → Fixed). Every step sends a notification.
- **Upvote** reports that affect you, comment with photos, and when it's marked fixed, answer "Fixed" or "**Not fixed**". "Not fixed" reopens it with higher priority and alerts management.

**Live map**
- Issues, emergencies, safety notices, events, community posts, township landmarks and neighbours on one map. Each is a layer you can turn on or off.
- Google Maps, with an automatic switch to OpenStreetMap if Google is slow or blocked. "Open in Organic Maps" hands a place to the free offline map app.
- Neighbours appear only by nickname and character, at **precinct** level (never at the unit), and only when at least 5 residents there are visible. Residents can hide or use ghost mode.

**SOS and emergencies**
- A big SOS button alerts management and the security desk at once with your location, and offers to call 999 (in demo mode a modal replaces the dialer).
- Works offline: an SOS is saved on the phone and sent on reconnect.
- Nearby residents can confirm an emergency (within 1 km, accounts older than 24 hours, one confirmation each). False alarms can pause SOS on an account.
- Emergencies always sit at the top of every list for everyone.

**Stay informed**
- **Announcements and maintenance notices**, targeted to the whole township or to areas the resident lives in or follows (up to 4). Management can schedule them.
- **Happening now** on the Residence tab follows one rule: emergencies first, then safety and maintenance notices, then everything else.
- A **weekly newsletter** built from real township activity, a **notification bell**, and **settings** for map privacy, text size, reduced motion and notification types.

**Community**
- A **township feed** for posts, questions and lost-and-found. Posts can show as a bubble on the map for 24 hours.
- Posts containing phone or IC numbers are held for review. Three reports hide a post, and anonymous posters are hidden from other residents.
- **Events**: organise one (management approves resident events), RSVP, add to calendar, and **check in** on the day by location, the host's 6-digit code or the host's **QR code**.

**Rewards** (light gamification)
- XP for helpful actions: accepted reports, confirming fixes, helpful posts, attending events. XP builds levels, 9 badges, weekly quests and a township goal, plus an opt-out leaderboard.
- A **character editor** with cosmetics that unlock by level (tudung and songkok are never locked).
- XP is recorded only in the database with daily caps, can't be earned from emergencies, and **never changes how fast a report is fixed**.

**Services**
- **Service requests and enquiries**, private to the requester, the unit owner and management. Choose a category, a preferred day and time window, and how to be contacted. Track a five-step timeline (Submitted → Acknowledged → Assigned → In progress → Completed) with notes and who is handling it. Cancel before someone is assigned, and rate it when done.
- **Visitor passes**: enter the visitor's name, car plate and date, then share a QR code. The guard scans it at the gate and the host gets a "your visitor has arrived" notification.
- **Scan QR** with the phone camera. The camera starts only on tap and stops when you leave the page. Codes can be typed instead, and links to unknown sites are blocked.
- **Billing reminders** (owners only): bills the management office has entered, with due soon, overdue and paid status, a reminder toggle per bill, and the invoice PDF. **Reminders only: payments are made outside Jiran.**
- **FAQ** search, **feedback** to management, **surveys**, **car plates**, and a help page with the Sime Darby Property toll-free line.

**Township information** (from the official City of Elmina pages)
- **Properties**: the four City of Elmina launches (Kanopi Residences, Elmina Ridge 2, Jumpa @ Elmina Valley, Elmina Business Park) with photos and official details, plus a **viewing / enquiry form** (name, phone, email).
- **Elmina Lakeside Mall**: opening hours and a searchable directory of 97 stores.
- **Township facts and landmarks** (Elmina Central Park, Elmina Rainforest Knowledge Centre and Elmina Lakeside Mall) on the map.

### For township management

| Area | What it does |
| --- | --- |
| **Urgent** | Live emergencies with location and neighbour confirmations; mark Confirmed, Responding, Resolved or False alarm. |
| **Issue queue** | Every open issue ranked by the published priority formula with the score breakdown; bulk status changes with a team and a note; merge duplicates. |
| **Map** | The same live map, staff view. |
| **Publish** | Announcements and maintenance notices, area targeting, scheduling, withdraw. Safety notices also go to email (simulated). |
| **Events** | Approve or decline resident events, cancel events. |
| **Newsletter** | Build this week's draft from real data, edit, send. |
| **Moderation** | Held and reported posts, warnings, XP take-back. |
| **Analytics** | Median time to acknowledge and fix, follow-ups per issue, weekly trend, SOS and community figures, and a before-Jiran baseline that is only entered, never estimated. |
| **Verifications** | Review ownership certificates (private, 60-second links) and approve or reject new owners. |
| **Service requests** | Queue filtered by status, category and area. Assign to staff, move the status forward with a note to the resident, keep internal notes, edit categories. |
| **Billing reminders** | Add bills per unit or **import a CSV** (every row is checked and shown before anything is saved). Mark paid, void with a reason, attach invoices, and set how many days ahead reminders go out. |
| **Surveys and FAQ** | Write a survey and open it (residents are notified, answer once, and results show no names). Edit the FAQ residents search. Read resident feedback. |
| **Property enquiries** | Viewing and enquiry requests from the Properties tab. |
| **Health** | Live status of the database, sign-in, storage, live updates, server functions and map provider. |

### For the security desk
- **Urgent panel** and **live map** for emergencies.
- **Guardhouse scan**: scan a visitor's QR with the laptop or phone camera to see the visitor's name, plate, date, host and unit, then check them in. The host is notified.

---

## How issues are prioritised

**P = 0.40·S + 0.25·U + 0.20·A + 0.15·T**, each part scored 0 to 100:

| Part | Meaning |
| --- | --- |
| **S** severity | Rules by category and keywords in English and Malay (for example "banjir", "api") |
| **U** upvotes | Compared with the most-upvoted open issue |
| **A** homes affected | Distinct units within 200 m, compared with the current maximum |
| **T** time waiting | 14 days of waiting = 100 |

The weights live in `app_config.priority_weights` and residents can read how the formula works in the FAQ. **Gamification never touches this score.**

**Global ordering rule**, enforced in the database:
1. Active emergencies.
2. Urgent safety notices and active maintenance in the resident's areas.
3. Everything else by relevance. Posts and events can never outrank 1 or 2.

---

## Privacy and safety

- **The database enforces the rules, not the app.** Every table has Row Level Security. Writes go through `SECURITY DEFINER` functions that check who is calling, and triggers handle XP, notifications and status history. The browser only ever holds the public key.
- **IC and passport numbers are never stored.** Only a salted SHA-256 hash and the last 4 characters are kept, to stop duplicate sign-ups.
- **Unit numbers and IC numbers are never shown to other residents.** Neighbours see a nickname, a character and a precinct.
- **Private files** are in private buckets with short-lived signed links:
  - Ownership certificates: readable by the owner and management.
  - Invoices: readable by the unit's owners and management only. Another owner asking for the same file is refused.
- **Sub-owners can't see billing.** This is blocked in the database, not just hidden in the app.
- **Rate limits** on sign-up, posts, SOS, passes, service requests and enquiries. **Content holds** for phone and IC numbers in posts.
- **Every management action is written to `audit_log`.**
- **Demo mode** is on for every deployed build: 999 is never dialled and emails are written to an outbox instead of being sent.

---

## Architecture

```
 Phone / laptop browser
  └─ React 18 + Vite + TypeScript (static files on Vercel)
       ├─ Supabase Auth ─────── email + password; owners via register-owner, sub-owners via accept-invite (edge functions)
       ├─ Postgres + RLS ─────── all rules: policies, SECURITY DEFINER RPCs, triggers, read-time scheduling
       ├─ Realtime ───────────── issues, notifications, emergencies, notices, posts, events, XP
       ├─ Storage ────────────── ownership-docs (private), invoices (private), public-media (photos)
       └─ Maps ───────────────── Google Maps JS → automatic OpenStreetMap (Leaflet) fallback
```

| Layer | Choice |
| --- | --- |
| Frontend | React 18.3, Vite 5, TypeScript 5.6, React Router 6. One codebase for residents (`/app`) and staff (`/admin`). |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), Singapore region. |
| Maps | Google Maps JavaScript API with an OpenStreetMap fallback; Organic Maps hand-off. |
| QR | `qrcode` to draw codes, `jsqr` to read them from the camera. |
| Hosting | Vercel (static). The build runs the tests, the type check, then the production build. |
| No cron jobs | Scheduled notices and billing reminders are worked out when someone opens the app ("read time"), so nothing has to run in the background. |

---

## What is real and what is simulated

| Thing | In this prototype |
| --- | --- |
| Properties, mall stores, township facts, phone numbers | **Real**, taken from the official Sime Darby Property pages (sources in `docs/elmina-facts.md`). |
| Units and addresses | Placeholder units, labelled "(demo)". |
| Area outlines | Rough centre points, marked `verified = false`. |
| Emails | Written to `email_outbox` and shown under Profile > Email preview, labelled Simulated. |
| Calling 999 | Demo mode shows a modal instead of dialling. |
| PRIME login | Not built (planned). |
| Bills | **None are invented.** Jiran isn't connected to the SDP billing system; bills exist only when management enters or imports them. Payments happen outside Jiran. |
| Analytics baseline | Never estimated; management enters the before-Jiran figures. |

---

## Running it locally

```bash
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173
```

For a new Supabase project, run every file in `supabase/migrations/` **in number order** in the SQL Editor, then `supabase/seed.sql`, `supabase/seed_issues.sql` and `supabase/seed_phase4.sql`. Then deploy the two edge functions. [DEPLOY.md](DEPLOY.md) has every step, the environment variables, and troubleshooting.

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key. Never put the service-role key in a `VITE_` variable. |
| `VITE_DEMO_MODE` | `true` for every deployed build |
| `VITE_GOOGLE_MAPS_KEY` | Browser key restricted to your domain (optional; without it the app uses OpenStreetMap) |

---

## Testing

| Command | What it checks |
| --- | --- |
| `npm test` | 96 unit tests: validation, priority labels, bill status and reminder timing, CSV parsing, service-request flow, QR parsing, avatar locks, FAQ search, township data against the database rules, language fallback. |
| `npm run ci` | Unit tests, then the TypeScript type check, then the production build. Vercel runs this on every deploy, so a failing test blocks a release. |
| `bash e2e/db/run.sh e2e/db/phase9_test.sql` | Applies every migration and the seed to a throwaway local Postgres, then checks the database rules as different users (owner, sub-owner, other owner, management): who can see which bills and requests, which status moves are refused, and that survey answers stay anonymous. |
| `node e2e/smoke-phase4.cjs` to `smoke-phase9.cjs` | Live end-to-end tests with Playwright against the deployed site, one per phase. `smoke-phase7.cjs` gives Chrome a fake camera showing generated QR codes. |
| `node e2e/smoke-invoice.cjs` | Live invoice privacy check: the owner can open the invoice, another owner can't. |

The live tests use the demo accounts and label anything they create "(smoke test)".

---

## Repository layout

```
supabase/
  migrations/          0001 to 0012, versioned SQL, run in order
  seed.sql             demo township, areas, units and accounts (re-runnable)
  seed_issues.sql      20 demo issues with votes, history and comments
  seed_phase4.sql      demo notices, events, posts, newsletter (times relative to now)
  functions/           register-owner, accept-invite (edge functions)
src/
  app/                 routes and role gates
  screens/resident/    the resident app (tabs, issues, sos, info, community, events, rewards, services, showroom)
  screens/admin/       the management and security app
  screens/auth/        sign-in, sign-up, invites, verification
  features/            data access per area (issues, sos, info, rewards, services, billing, surveys, auth)
  lib/                 pure logic with tests (billing, service flow, QR, avatar, validation, scoring)
  components/          shared pieces (QR scanner, status labels, map, toasts) and ui/ building blocks
  data/                verified township data: properties, mall directory, landmarks
  theme/               design tokens and global CSS
  i18n/                every word on screen (en.ts)
public/properties/     property photos
e2e/                   live smoke tests and the local database test harness
docs/elmina-facts.md   township facts with their sources
```

---

## Build history

Jiran was built in phases, each one deployed and tested on the live site before the next began.

| Phase | What it added |
| --- | --- |
| 1 | Database, row level security and four roles; owner sign-up with certificate verification; sub-owner invites; admin verification queue; health check. |
| 2 | Issues: report with duplicate detection, upvotes, the priority formula, tracking timeline, comments, "not fixed" reopen, admin queue. |
| 3 | Live map (Google with OpenStreetMap fallback), SOS and emergencies, urgent panel, global ordering rule. |
| 4 | Announcements and maintenance notices, notification centre, township feed with moderation, events with check-in, weekly newsletter, analytics. |
| 5 | Rewards: XP ledger, levels, badges, weekly quests, township goal, leaderboard, character editor. Support numbers on Residence. |
| 6 | Properties with enquiry form, Elmina Lakeside Mall directory, township facts and landmarks on the map, property photos. |
| 7 | Scan QR with the camera, visitor passes with guardhouse scan, car plates, FAQ, feedback, help. |
| 8 | English only (Bahasa Melayu removed; the language setup is kept so one can be added later). Demo controls and Book facilities removed. |
| 9A | Billing reminders entered by management (form or CSV), private invoices, reminders, owner-only access. |
| 9B | Service requests and enquiries: private timeline, assignment, internal notes, editable categories, ratings. |
| 9C | Surveys and an editable FAQ for management. |

---

## Known limitations

- **Not connected to SDP systems.** Billing, PRIME membership and the existing Sime Darby Property app are not integrated; this prototype shows how Jiran would sit alongside them.
- **Demo data.** Units, area outlines and demo accounts are placeholders.
- **Supabase free tier.** The project pauses after about a week without use. Restore it the day before a demo and check `/health`.
- **Photos on issues, posts and service requests** are in a public bucket: anyone with a photo's exact link can open it. Certificates and invoices are private.
- **In-app notifications only.** Push notifications to the phone's lock screen are not built.
- **English only.** The strings are all in one file, so adding Bahasa Melayu later means adding one more strings file.
- **Service categories.** The starting four (General enquiry, Maintenance request, Facilities, Other) are marked "proposed" until management confirms them in the app.

---

## For the designer

- **Restyle:** every colour, font, size, radius, spacing and shadow is in `src/theme/tokens.ts`. Components read them as CSS variables.
- **Components:** presentational pieces are in `src/components/ui/`. Data and logic live in `src/features/` and `src/lib/`, so a component can be swapped without changing behaviour.
- **Words:** every string on screen is in `src/i18n/en.ts`.
- **Character art:** the character is layered SVG drawn in `src/lib/avatar.ts` (skin, hair, top, accessory, ring). Level locks are listed there and enforced again in the database.
- **Accessibility:** primary buttons are 56 px tall, tap targets at least 48 px, status is always icon + text, and text size and reduced motion are in Settings. The newer screens (billing, service requests, surveys, FAQ) also show loading, empty, error and offline states.
