# LEED 26 judging system

One web app for Learn and Earn Entrepreneurship Day 2026 (9 & 10 December 2026, FSKTM Parking Lot, UTHM). It replaces the three separate Google Forms used for judging in LEED 25.

- **UTHM SSO only**: everyone signs in with their official UTHM Google account (`@student.uthm.edu.my` or `@uthm.edu.my`). Any other email is turned away with a pop-up asking them to retry with their UTHM account. No PINs.
- **Four roles**: customers (any UTHM student or lecturer: browse, like and rate stalls), sellers (students in a stall's team: stall name, SSM number, food category, description, poster, pitch and promo video links, inviting groupmates), juries (score only the stalls allocated to them) and admins (groups, allocations, announcements, dashboard, Excel export). Visitors who are not signed in can still browse.
- **Judging**: judges pick a stall from the list or the map, and score each criterion on the rubric's levels 0 to 5, with the level wording shown as they tap. Scores can be changed until judging closes. If the signal drops, scores are kept on the phone and sent when it returns.
- **Customers**: on a stall's page signed-in customers tap “I like it” (People Choice Award) and rate the five stall elements with stars (half of every stall award). One vote and one rating per UTHM account per stall, changeable. Sellers cannot vote for or rate their own stall.
- **Admin console**: live ranking per award, Customer Choice tally, judge progress, stalls, accounts and judge import, open/close judging and voting, one Excel file with every mark, memory wall approval.
- **Venue map**: a 2D plan and a 3D Three.js scene of the tent layout, switchable with one button. Both are drawn from the same data. The 3D view shows the real FSKTM building from `public/models/fsktm.glb` behind the tents (converted from `docs/HusseinVerse-FSKTM.blend`); while it loads, or if the file is missing, a simple stand-in building is shown.
- **Poster wall**: every uploaded stall poster is pinned at the top of `/wall`. Tapping one opens the stall's pitch or promo video, its details and its team members.
- **Memory wall**: polaroids pegged to a brass grid. Visitors can drag them, open them, play videos, like them, and pin their own (shown after approval).
- **Landing pages and sign-in**: a home page for visitors, a guide for judges (`/for-judges`), a guide for stall teams (`/for-teams`), and one sign-in page with a single **Sign in with UTHM SSO** button.
- **Countdown and sounds**: the home page counts down to 9 December, 9:00 am, then shows "Happening now". Every click plays a short sound effect (made in the browser, no audio files); the speaker button in the nav mutes them, and the choice is remembered on the device. To give an element its own sound, add `data-sfx="pop|tick|like|nope|save|toggle|off"`.
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

`db/queries.sql` holds ready-made queries: rankings, progress, adding judges and admins, teams, allocations, announcements, setting judging windows, replacing criteria, bulk-loading stalls and adding memories.

### First admin

Put your own UTHM email in `ADMIN_EMAILS` (comma separated for several) and sign in with UTHM SSO: you become an admin. From the admin console you can then add more admins and judges by email. Section 2 of `db/queries.sql` does the same in SQL.

## UTHM SSO

Sign-in uses Google (OpenID Connect with PKCE). Only verified `@student.uthm.edu.my` and `@uthm.edu.my` emails are accepted; the check runs on the server after Google answers, so changing the URL cannot get around it.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, open **APIs & Services > OAuth consent screen** and fill in the app name (LEED 26) and support email. Choose **External** unless the project sits inside UTHM's Google Workspace, in which case **Internal** is fine for staff and students.
2. **Credentials > Create credentials > OAuth client ID > Web application.** Add the authorised redirect URI `https://<your-site>/api/auth/sso/callback` (and `http://localhost:3000/api/auth/sso/callback` for testing).
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, set `APP_URL` to the site address, and redeploy.

The first sign-in creates the account as a customer. A person becomes a seller when an admin (or their team leader) adds their email to a stall, a judge when an admin adds them under **Jury and admins**, and an admin through `ADMIN_EMAILS` or the console.

Without a database the app runs in demo mode: the sign-in page shows four demo accounts (customer, seller, judge, admin) instead of SSO.

### Profile photos

Photos follow `docs/photofetch.md`: for students, the UTHM Community photo is worked out from the matric number in their email; staff can add their staff ID on their **Me** page to use their UTHM photo. If neither loads, the Google account photo is used, then initials. Photos are only shown to signed-in users.

## Deploy

Any Node host works. On Vercel: import the repository, set `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` and `ADMIN_EMAILS` in the project's environment variables, deploy. Add the deployed address's `/api/auth/sso/callback` to the Google OAuth client's redirect URIs.

The service worker only registers in production (`npm run build && npm start`, or a deployed site), so it does not get in the way during development. Installing to a home screen needs HTTPS.

## Awards and rubrics

The nine categories come from "The Competition" (Appendix B, Components B, C and D). Definitions live in `lib/awards.ts` (and in `db/seed.sql`, generated from it).

Judges fill in three score sheets. Each criterion is scored at a level from 0 to 5; marks = level / 5 × the criterion's marks.

| Score sheet | Rubric | Criteria (marks) | Total |
|---|---|---|---|
| Stall Competition | Component B | Product (5), Price (5), Place (5), Promotion (5), Customer Service (5, provisional wording) | 25 |
| Impressive Video Marketing | Component D | Promotional Engagement, Core Value Points, Visual Impact & Branding, Audio Quality & Balance, Editing & Production (5 each) | 25 |
| Best Business Pitch with Innovation Element | Component C | Concept & Innovation, Presentation & Demonstration, Feasibility & SDG 8 Alignment (5 each) | 15 |

Visitors rate the same five stall elements with 1 to 5 stars on each stall page. Customer marks = average stars / 5 × the element's marks, so the jury and the customers each give half:

| Category | Based on | Marks | Winners |
|---|---|---|---|
| Outstanding Stall | All five elements, jury + customers | 50 | 1st to 3rd |
| Clean and Charming Stall | Place | 10 | 1st to 3rd |
| Brilliant Stall Promotions | Promotion | 10 | 1st to 3rd |
| Hottest Product | Product and Price | 20 | 1st to 3rd |
| Superb Customer Service | Customer Service | 10 | 1st to 3rd |
| Impressive Video Marketing | Jury only | 25 | 1st to 3rd |
| Best Business Pitch with Innovation Element | Jury only | 15 | 1st to 3rd |
| Most Popular & Viral Video Marketing | Likes + shares on social media, entered by the committee (Admin > Results > Viral video) | – | 1 |
| People Choice Award | Most "I like it" votes from visitors | – | 1 |

A stall's jury marks are the average of its judges. Ties share a place.

## Customer Choice and fair voting

Liking and rating a stall needs a UTHM SSO sign-in, so every vote belongs to a real UTHM account: one like and one set of stars per account per stall, changeable until voting closes. Scripts and incognito tabs cannot add votes without another UTHM account. Each account is also limited to 40 votes per 10 minutes, and team members cannot vote for their own stall.

## Marks in Excel

Admin console > Overview (or Results) > **Download all marks (Excel)** gives one `.xlsx` with:

- **Winners**: top 3 of every award, plus Customer Choice.
- **<Award> - Ranking**: every stall, its number of judges, average total and average marks per criterion.
- **<Award> - Marks**: every score sheet, one row per judge per stall, with the level and marks for each criterion, the total and the comment.
- **Customer Choice**: likes, “not for me” and total votes per stall.

## Judges and allocations

The 30 judges in Lampiran 3 and the 3 Judging Unit members are already loaded but switched off, because the paper has no emails. In **Jury and admins**:

- Paste rows from Excel into **Import judges**: `name, UTHM email, awards` (awards: `all`, or names separated by `;`). A name that matches a preloaded judge fills that account in and switches it on; any other row creates a new account.
- Or press **Add UTHM email** next to one judge.
- **Allocated stalls** picks which stalls each judge scores per award. A judge with no allocation can score any stall. **Allocate automatically** shares the stalls out evenly among the judges of each award.

## Groups, sellers and posters

1. In **Groups and teams**, paste one line per stall: `stall number, group name, leader email, member emails…`. Or add members one at a time on each stall.
2. Members sign in with UTHM SSO and land on their stall desk. Any member can fill in the stall name, SSM number, food category, short description (400 characters), pitch video link and up to three promo video links, and upload the poster (JPEG, PNG or WebP; large photos are shrunk on the phone before upload, 3 MB limit). The leader can add or remove groupmates and hand over leadership.
3. Posters are stored in the database and pinned on the poster wall as soon as they are uploaded.
4. Teams see how many judges have scored them, never the scores.

## Groups, users and the activity log

- **Groups** (admin console) shows every registered group as a card: stall, group name, member photos and how many have signed in. Tap a card for the members (email, leader, last sign-in, or "not signed in yet") and a link to that stall's activity.
- **Users** lists every account. Search by name, email or stall, filter by Customers, Sellers, Juries, Committee or Switched off, change anyone's role (Customer, Jury, Committee) or switch the account off. Every change asks first. You cannot remove your own admin role or switch yourself off. **Activity** opens what that person has done.
- **Activity log** records, with time and person:
  - **Admin actions**: role changes, accounts switched on or off, groups and members, allocations, announcements, stall edits, opening or closing judging and voting, publishing results, memory wall moderation.
  - **User activity**: likes, star ratings, saved score sheets, stall edits, poster uploads and removals, team changes, memories pinned.
  - **Sign-ins**: UTHM SSO sign-ins, sign-outs and refused sign-ins (with the non-UTHM email that was tried).

  Search the log by name, email, stall ("stall 7") or action. The log lives in the `activity_log` table.

## Supabase

`supabase/leed26.sql` is the whole database in one file: tables, views, starting data and Row Level Security. In Supabase, open **SQL Editor**, paste the file and run it (running it again after an update is safe). RLS is switched on for every table with no policies, and the `anon` and `authenticated` API roles get no access, so nothing can be read through the Supabase API or the anon key. The app connects with `DATABASE_URL` (Project Settings > Database > Connection string, Transaction pooler) as the database owner. `db/queries.sql` still holds the handy one-off queries.

## Announcements

**Announcements** in the admin console posts a notice to everyone, sellers only or juries only. Pinned notices stay on top. Everyone's notices show on the home page; each role also sees theirs on its own desk.

The **Overview** tab in the admin console lists what is still missing before the event (UTHM SSO keys, judges per competition, stalls without a group, unnamed stalls). **Publish results** there makes the top 3 of each competition visible on `/results`.

Already ran an older `schema.sql`? Run it again: it adds the new tables and columns without touching your data.

## Things to confirm before judging opens

These were not in the documents, so sensible placeholders are in place:

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

The design follows the LEED logo: grape and violet surfaces, zap yellow for the main action, hot pink and mint accents, thick ink outlines with hard "sticker" shadows. Colours are CSS variables at the top of `app/globals.css` (`--asphalt` is the grape, `--line` the yellow, plus `--violet`, `--pink`, `--mint`, `--cream`). The logo files are in `public/brand/`; app icons in `public/icons/` are made from the square artwork. Headings, buttons and numbers use Kanit (heavy italic, like the lettering under the logo) and body text uses Plus Jakarta Sans. Light pages sit on the logo's cream with a faint halftone; purple sections use a sunburst like the square artwork.

## Updating the 3D building

`public/models/fsktm.glb` was converted from `docs/HusseinVerse-FSKTM.blend` at real size (metres, about 96 m wide and 49 m tall). If you change the model in Blender, export it again with **File > Export > glTF 2.0**: format *glTF Binary (.glb)*, *+Y Up* on, and save it over `public/models/fsktm.glb`. Placement settings (size, turn, nudge) are in `BUILDING_MODEL` in `lib/venue.ts`.

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
