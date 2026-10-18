# Ironvale Athletic Club (gym trial site)

A made-up gym used to learn how to build, launch and run a full gym website: public pages, live class booking, free trial requests, a contact form and a staff dashboard. Ironvale is not a real business; the site says so in a ribbon on every page.

- Live: https://gym.fellowflow.ai (staff: `/staff/`)
- Launch steps: [LAUNCH.md](LAUNCH.md)

## How it is built

| Part | What it is | Where |
| --- | --- | --- |
| Front end | Plain HTML, CSS and JavaScript, English and Arabic | `public/` |
| Back end | Cloudflare Pages Functions (small server programs) | `functions/api/` |
| Database | Cloudflare D1 (SQLite), connected as `DB` | tables built by `functions/_lib/db.js` |
| Staff login | One password, the `STAFF_PASSWORD` secret | `functions/_lib/auth.js` |
| Hosting | Cloudflare Pages, free plan | deploys on every push to `main` |

No build step, no frameworks, no trackers. Members pay at the front desk; there is no online payment on purpose.

## What the site does

Public site (`public/index.html`):
- Programs, live 7-day timetable with spots left, ladies-only filter
- Book a class (name and phone), confirmation with a cancel link and an "Add to calendar" file
- Free trial pass form, contact form, membership prices, coaches, facilities, FAQ, hours with "Open now", map, call and WhatsApp buttons, sticky phone bar
- Notice bar the staff can switch on (e.g. "Closed Friday for Eid")
- Arabic switch (right-to-left), remembered per visitor

Staff dashboard (`public/staff/`):
- Today's numbers: bookings, check-ins, new trial requests, new messages
- Classes by day: who booked, mark Here or No-show, add walk-ins, cancel one class on one day
- Trial requests and messages with status and notes (the follow-up pipeline)
- Weekly timetable editor (add, edit, hide classes)
- Notice bar, pause online booking, download CSV files

Protection built in: spam honeypot, rate limits per visitor (IP stored only as a hash, deleted after 24 h), one booking per phone per class, capacity checked in a single database step so a class can't overbook, same-site checks on every change, signed staff cookie (12 h), security headers in `public/_headers`, `noindex` while it's a trial.

## API

| Method and path | Does |
| --- | --- |
| `GET /api/schedule` | Next 7 days of classes with spots left |
| `POST /api/book` | Book `{class_id, date, name, phone}` |
| `GET/POST /api/booking` | See (`?t=token`) or cancel (`{token}`) a booking |
| `POST /api/trial` | Free trial request |
| `POST /api/contact` | Contact message |
| `GET /api/info` | Notice bar text |
| `/api/staff/*` | Dashboard routes; need the staff cookie |

## Editing

- Words in English: `public/index.html`. Arabic: `public/assets/js/i18n.js` (same key as the `data-i18n` attribute).
- Colours: top of `public/assets/css/site.css`.
- Opening hours: the hours table in `index.html` and `HOURS` in `public/assets/js/site.js`.
- Timetable, notice bar: from the staff dashboard, no code needed.
- Phone and WhatsApp: search `96260000000` (a placeholder) and replace with a real test number.

## Run it on your own computer

```
npm install -g wrangler
echo "STAFF_PASSWORD=choose-a-local-password" > .dev.vars
wrangler pages dev public --d1 DB=lab-gym-local
```
Then open http://localhost:8788. The local database lives in `.wrangler/` and is separate from the live one.

## Before reusing this for a real gym (Apollo)

Swap every demo fact (name, address, phone, prices, coaches, facility list), add real photos, remove the demo ribbon and the `noindex` line, add the real domain to `robots.txt` and `sitemap.xml`, and get the gym to confirm the privacy text.
