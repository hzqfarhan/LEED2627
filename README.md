# LEED 26 judging system

One web app for Learn and Earn Entrepreneurship Day 2026 (9 & 10 December 2026, FSKTM Parking Lot, UTHM). It replaces the three separate Google Forms used for judging in LEED 25.

- **Three kinds of user**: visitors (stall directory, stall pages, map, memory wall, results once published), stall teams (sign in with stall number + team PIN to fill in their stall and video links, and see how many judges have visited) and staff (judges and admins).
- **Judging**: judges sign in with an email and PIN, pick a stall from the list or the map, and score each criterion on the rubric's levels 0 to 5, with the level wording shown as they tap. Scores can be changed until judging closes. If the signal drops, scores are kept on the phone and sent when it returns.
- **Customer Choice**: visitors tap “I like it” or “Not for me” on a stall's page (one vote per phone, changeable). Most likes wins.
- **Admin console**: live ranking per award, Customer Choice tally, judge progress, stalls, accounts and judge import, open/close judging and voting, one Excel file with every mark, memory wall approval.
- **Venue map**: a 2D plan and a 3D Three.js scene of the tent layout, switchable with one button. Both are drawn from the same data.
- **Memory wall**: polaroids pegged to a brass grid. Visitors can drag them, open them, play videos, like them, and pin their own (shown after approval).
- **Landing pages and sign-in**: a home page for visitors, a guide for judges (`/for-judges`), a guide for stall teams (`/for-teams`), and one sign-in page where people pick Judge, Stall team or Committee.
- **PWA**: installable on phones, with an offline shell.

Built with Next.js (App Router, TypeScript), PostgreSQL (`pg`), Three.js and plain CSS.

## Run it

Needs Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no database configured the app runs in **demo mode**: sample data held in memory, nothing saved. Demo accounts are offered on the sign-in page.

## Connect PostgreSQL

1. Create a database (local PostgreSQL, Neon, Supabase and similar all work).
2. Run the two SQL files in order:

   ```bash
   psql "YOUR_CONNECTION_STRING" -f db/schema.sql
   psql "YOUR_CONNECTION_STRING" -f db/seed.sql
   ```

   Or paste each file into your provider's SQL editor. Both are safe to run again.
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` and `SESSION_SECRET`.
4. Restart `npm run dev`.

`db/queries.sql` holds ready-made queries: rankings, progress, adding judges, changing PINs, setting judging windows, replacing criteria, bulk-loading stalls and adding memories.

### Starting accounts (change the PINs before the event)

| Role  | Email                 | PIN            |
| ----- | --------------------- | -------------- |
| Admin | `admin@leed26.local`  | `change-me-26` |
| Judge | `judge1@leed26.local` | `111111`       |
| Judge | `judge2@leed26.local` | `222222`       |
| Judge | `judge3@leed26.local` | `333333`       |

Add real judges in the admin console (Judges and admins), then deactivate or delete the sample ones. PINs are stored hashed (`pgcrypto`). Five wrong PINs lock an account for 10 minutes.

## Deploy

Any Node host works. On Vercel: import the repository, set `DATABASE_URL` and `SESSION_SECRET` in the project's environment variables, deploy.

The service worker only registers in production (`npm run build && npm start`, or a deployed site), so it does not get in the way during development. Installing to a home screen needs HTTPS.

## Awards and rubrics

All rubrics live in `lib/awards.ts` (and in `db/seed.sql`, generated from it). Each criterion is scored at a level from 0 to 5; marks = level / 5 × the criterion's marks.

| Award | Rubric | Criteria (marks) | Total |
|---|---|---|---|
| Best Stall | BIT21603 Component B, without Customer Service (marked in class) | Product / Service (4), Price Strategy (5), Place (4), Promotion (5) | 18 |
| Best Marketing Video | Component D | Promotional Engagement, Core Value Points, Visual Impact & Branding, Audio Quality & Balance, Editing & Production (5 each) | 25 |
| Business Pitching Idea | Component C | Concept & Innovation, Presentation & Demonstration, Feasibility & SDG 8 Alignment (5 each) | 15 |
| Innovation Product | **Provisional**, no rubric received yet | Novelty, Use of Technology, Problem Solved, Market Potential (5 each) | 20 |
| Customer Choice | Visitor likes | Most likes; ties share a rank | – |

To replace the Innovation Product rubric, edit `lib/awards.ts` and run section 3c of `db/queries.sql`.

## Customer Choice and bot protection

Votes are protected by [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (free):

1. In the Cloudflare dashboard, open **Turnstile > Add widget**. Add your site's domain (and `localhost` for testing), widget mode **Managed**.
2. Put the two keys in your environment as `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, then redeploy.

How it works: the first time a phone votes, Turnstile checks it in the background (most people see nothing; a few get one tap). The server confirms the check with Cloudflare and gives the phone a signed voter cookie. After that the phone votes and changes its votes without another check. A Python script or a new incognito tab has no valid cookie, so it must pass Turnstile again for every extra vote, which bots can't do in bulk. Each connection is also limited to 40 votes per 10 minutes.

Without the keys the check is off, so set them before the event. A person who keeps opening new incognito tabs by hand can still vote more than once; Turnstile stops automated spam, not that.

## Marks in Excel

Admin console > Overview (or Results) > **Download all marks (Excel)** gives one `.xlsx` with:

- **Winners**: top 3 of every award, plus Customer Choice.
- **<Award> - Ranking**: every stall, its number of judges, average total and average marks per criterion.
- **<Award> - Marks**: every score sheet, one row per judge per stall, with the level and marks for each criterion, the total and the comment.
- **Customer Choice**: likes, “not for me” and total votes per stall.

## Judges

The 30 judges in Lampiran 3 and the 3 Judging Unit members are already loaded but switched off, because the paper has no emails. In **Judges and admins**:

- Paste rows from Excel into **Import judges**: `name, email, PIN, awards` (awards: `all`, or names separated by `;`). A name that matches a preloaded judge fills that account in and switches it on; any other row creates a new account.
- Or press **Add email and PIN** next to one judge.

Section 2d of `db/queries.sql` does the same in SQL.

## Stall teams

1. In the admin console, open **Stalls** and press **Create PINs for stalls without one**. Download the CSV; the PINs are shown only once.
2. Hand each team its stall number and PIN. They sign in under **Sign in > Stall team**.
3. Teams name their stall, choose their cluster, describe what they sell and paste their pitch video and up to three promo video links. Judges open those videos straight from the score sheet.
4. Teams see how many judges have scored them, never the scores.

The **Overview** tab in the admin console lists what is still missing before the event (judges per competition, team PINs, unnamed stalls). **Publish results** there makes the top 3 of each competition visible on `/results`.

Already ran the first version of `schema.sql`? Run it again: it adds the new columns and the settings table without touching your data.

## Things to confirm before judging opens

These were not in the documents, so sensible placeholders are in place:

1. **Innovation Product rubric.** Provisional (see the table above). Replace it with section 3c of `db/queries.sql`.
2. **Number of stalls.** The layout has 40 tents. If more groups take part, press **Add a stall** in Stalls; extra stalls show as not on the layout yet.
3. **Canopy colours.** Stalls are coloured in blocks of eight (pink, blue, green, yellow, red). Correct them in the admin console (Stalls).
4. **Tent layout.** Copied from the LEED 25 drawing. If LEED 26 differs, edit `lib/venue.ts`; the 2D plan and 3D scene both follow it.
5. **Where the building sits.** The drawing does not show it, so the FSKTM building is placed along the top edge of the plan (`BUILDING` in `lib/venue.ts`).
6. **Judging windows.** None are set, so judging is controlled by the open/close button in the admin console. Section 3a of `db/queries.sql` sets timed windows.
7. **Programme.** Taken from the Kertas Kerja (`SCHEDULE` in `lib/event.ts`); stall judging runs 12:00 to 5:00 pm on Day 1.
8. **Memory wall content.** The seed adds twelve caption-only sample notes. Add real photos and videos in the admin console (Memory wall) or with section 5 of `db/queries.sql`. Files placed in `public/memories/` can be linked as `/memories/filename.jpg`. The wall takes links, not uploads, so photos need to be hosted somewhere or placed in that folder.

## How scoring works

- Each judge gives one score sheet per stall per competition. Saving again replaces it, and every save is logged in `score_audit`.
- A sheet's total is the sum of each criterion's marks (level / 5 × the criterion's marks).
- A stall's result is the **average of its judges' totals**, so a stall is not helped or hurt by how many judges reached it. Equal averages share a rank.

## Look and feel

The design follows the LEED logo: grape and violet surfaces, zap yellow for the main action, hot pink and mint accents, thick ink outlines with hard "sticker" shadows. Colours are CSS variables at the top of `app/globals.css` (`--asphalt` is the grape, `--line` the yellow, plus `--violet`, `--pink`, `--mint`, `--cream`). The logo files are in `public/brand/`; app icons in `public/icons/` are made from the square artwork. Headings use Kanit (heavy italic, like the lettering under the logo) and body text uses Atkinson Hyperlegible.

## Where things are

```
app/                 pages and API routes
  api/               sign-in, scores, memories, admin actions, CSV export
components/          Landing, RoleArt, Venue2D, Venue3D, VenueExplorer, JudgeDesk, AdminConsole, MemoryWall, ...
public/brand/        logo and share image
lib/venue.ts         tent layout in metres (source for both map views)
lib/event.ts         event name, dates, clusters
lib/repo.ts          every database query (with the demo-mode fallback)
lib/offlineQueue.ts  scores saved on the phone while offline
db/                  schema.sql, seed.sql, queries.sql
public/sw.js         service worker
docs/                source documents from the committee
```
