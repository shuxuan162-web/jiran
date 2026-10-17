# Deploying Jiran

Jiran is a static React app on Vercel plus a Supabase project (database, auth, storage, realtime, two edge functions). There is no server of our own to keep running.

Current live deployment (phases 1 to 3; phase 4 needs migration 0005):

| Piece | Where |
| --- | --- |
| App | https://jiran-elmina.vercel.app |
| Health check | https://jiran-elmina.vercel.app/health |
| Supabase project | `lkvaewjjxjkykxlrkvhr` (region ap-southeast-1, Singapore) |
| Vercel project | `jiran-elmina` |

## Fresh setup, step by step

### 1. Supabase project
1. Go to supabase.com, sign in, click **New project**. Region: **Southeast Asia (Singapore)**. Save the database password somewhere safe.
2. Open **SQL Editor**, paste `supabase/migrations/0001_core.sql`, click **Run**. Repeat for every later migration file, in number order.
3. Paste `supabase/seed.sql` and click **Run**, then `supabase/seed_issues.sql` (20 demo issues with votes, history and comments), then `supabase/seed_phase4.sql` (demo notices, events, posts and last week's newsletter). All are safe to run again; they never duplicate rows. Run `seed_phase4.sql` again on demo day: its times are relative to now, so the "open now" event is ready for check-in (demo code `135790`).
   Check: `select public.issue_severity('road','Pothole on the rapid lane',0);` should return **55**. If it returns 75, migration `0003_severity_words.sql` hasn't been run yet.
4. **Authentication > Sign In / Providers > Email**: keep Email enabled. Turn **off** "Allow new users to sign up" (owners register through the `register-owner` function, sub-owners only through invites). Turn **on** "Leaked password protection" if your plan allows it.
5. **Authentication > URL Configuration**: set Site URL to your Vercel URL and add `http://localhost:5173` to Redirect URLs.
6. Storage buckets (`ownership-docs` private, `public-media` public, 5 MB, images/PDF) are created by the migration. Check they exist under **Storage**.
7. Realtime: from phase 2 on, migrations add the realtime tables. Check under **Database > Publications > supabase_realtime**.

### 2. Edge functions
With the Supabase CLI (`npm i -g supabase`):
```bash
supabase login
supabase link --project-ref <your-ref>
supabase functions deploy register-owner --no-verify-jwt
supabase functions deploy accept-invite --no-verify-jwt
```
Both functions run before anyone is signed in, so JWT verification is off; they do their own checks (rate limit, invite token) and use the service-role key that Supabase injects. The service-role key never goes into the app or any `VITE_` variable.

### 3. Maps
- **Google Maps** is the main map. Set `VITE_GOOGLE_MAPS_KEY` in Vercel (Production and Preview). It's a browser key, restricted in Google Cloud to HTTP referrers `*.vercel.app`, with billing and the **Maps JavaScript API** enabled.
- **Fallback:** if Google refuses the key, is blocked or is slow, every map switches by itself to OpenStreetMap (Leaflet, no key needed) with the same pins and sections. `/health` shows which map is in use.
- **Live location** uses the browser's location and stays on the phone unless the resident checks in (rounded to about 100 m, for 30 minutes).
- **"Open in Organic Maps"** hands a place or a route to the free Organic Maps app.

### 4. Vercel
1. Push the repo to GitHub, then on vercel.com click **Add New > Project** and import it. Framework: **Vite**. Build command: `npm run ci` (runs tests, type check, then build). Output: `dist`.
2. **Settings > Environment Variables** (all environments):
   - `VITE_SUPABASE_URL` = Project URL (Supabase > Project Settings > API)
   - `VITE_SUPABASE_ANON_KEY` = the publishable/anon key
   - `VITE_DEMO_MODE` = `true`
   - `VITE_GOOGLE_MAPS_KEY` = the Google Maps browser key
3. **Settings > Deployment Protection**: turn **off** Vercel Authentication, or judges will hit a Vercel login page.
4. Deploy. `vercel.json` already rewrites deep links to `index.html`, so refreshing `/app/profile` works.

### 5. Demo accounts (seeded)
Password for all: `JiranDemo2026!`

| Role | Email | Notes |
| --- | --- | --- |
| Management | admin@jiran.example.com | Admin app at `/admin` |
| Security desk | security@jiran.example.com | Sees Urgent, Map, Health only |
| Owner A | lakewalker@jiran.example.com | Elmina Green, verified |
| Owner B | kopikaki@jiran.example.com | Elmina Valley, verified |
| Sub-owner of A | nasilemak@jiran.example.com | Invited by LakeWalker |
| Owner D | cyclingauntie@jiran.example.com | Denai Alam, verified |
| New owner | newneighbour@jiran.example.com | Waiting for verification |

These are public demo credentials. Change or delete them before any real use.

### 6. Smoke test on the live URL (phase 1)
1. Open `/health`: Database, Sign-in, Storage, Live updates and Server functions show **OK**; Map shows **OK** (tiles load, no key needed); Demo mode shows **On**.
2. Log in as Owner B: lands on the Map tab; all 5 tabs open; Profile shows the unit only to you.
3. Log in as Owner A: Profile > Register sub-owner > invite a new email; copy the link; open it in a private window; set a nickname and password; you land in the app as a sub-owner without the Billing tile or sub-owner menu.
4. Back as Owner A: remove that sub-owner; the sub-owner's next page load shows "Your access has ended".
5. Create a new owner via **Create account** with any photo as the certificate; you land on the Verification screen.
6. Log in to `/admin/login` as management > Verifications: view the document, approve it. The new owner's screen turns to Verified within 15 seconds; tap **Enter Jiran**.
7. Try the resident login with the management account: it is refused and sent to the management login.

### 7. Smoke test (phase 2: issues)
1. As Owner B: Map tab shows issue pins and the top 5. Open JRN-2610-0013, tap **Upvote**: a toast shows the queue position.
2. **Report an issue**: drop a pin, pick a category, describe it. Step 4 lists similar nearby reports; send it and note the reference number and queue position.
3. As management, `/admin/issues`: tick the new issue, set **Assigned** with a team and a note. Owner B's bell shows a new notification; the timeline shows the step.
4. Set it to **Fixed**. As Owner B, answer "No, not fixed": the issue reopens with higher severity and management is notified.

### 8. Smoke test (phase 4: information and community)
1. As management, `/admin/publish`: publish a **Safety** notice to **Elmina Valley**. The result says how many residents were notified.
2. As Owner B (Elmina Valley): the bell shows it, it is at the top of "Happening now" just below any emergency, and it opens from Notifications > Announcements. Owner A (Elmina Green) does not get it.
3. Owner B: Township feed > **Share a post** with a pin and the bubble on. The bubble appears on the map. Post again with a phone number in it: it says it is waiting for review.
4. Management, `/admin/moderation`: the held post is there. Click **Show it**.
5. Owner A: Events > **Organise an event**. It says "Waiting for approval". Management, `/admin/events`: approve it. Owner A gets a notification and sees the check-in code.
6. Owner B: open "Drop-in coffee morning (demo, open now)", tap **I'm going**, then **Use a code instead** and enter `135790`.
7. Management, `/admin/newsletter`: **Build this week's draft**, edit the intro, **Send to residents**. Owner B: Residence > newsletter card, scroll to the end, it marks itself read.
8. Management, `/admin/analytics`: numbers load; enter the survey's before-Jiran numbers under **Edit** when you have them (never estimate).

## Free-tier warnings
- Supabase free projects **pause after about a week of inactivity**. Open the dashboard and click Restore the day before the demo, then run `/health`.
- Redeploy after every phase so the live URL never falls behind.

## Troubleshooting
| Symptom | Likely cause and fix |
| --- | --- |
| Blank page after deploy | `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` missing: the app shows "Setup needed". Add them and redeploy (Vite bakes them in at build time). |
| Vercel login page instead of the app | Deployment Protection is on. Turn off Vercel Authentication. |
| 404 on refresh of a deep link | `vercel.json` missing from the deploy. |
| "That email and password don't match" for seeded users | Seed not run, or run before the migration. Run migration, then seed. |
| Sign-up fails with "Something went wrong" | Edge functions not deployed, or deployed with JWT verification on. Redeploy with `--no-verify-jwt`. |
| RLS blocking a legitimate action | The account's `profiles_private.status` is not `active` (pending verification or revoked). Check it in Table Editor. |
| Certificate upload fails | File over 5 MB or not JPG/PNG/WebP/PDF; or the `ownership-docs` bucket is missing. |
| Live updates "Problem" on /health | Realtime disabled for the project, or a network blocking websockets; the app falls back to polling. |
| Map tiles not loading | /health shows Map: Problem. The tile server may be slow or blocked on the venue Wi-Fi; issues and SOS still work, and the list below the map shows everything. |
| SOS doesn't open the dialer on a laptop | Desktops can't place calls; `tel:` only works on phones. In demo mode a modal is shown instead. |
| Scheduled notices not publishing | No server job is needed: a scheduled notice goes out the first time anyone opens Announcements after its publish time. Expired notices disappear at read time. |
