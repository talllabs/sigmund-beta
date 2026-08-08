# Award Scraper

Scrapes **awarded** bid/RFP results (winning supplier, amount, agency, dates)
from public procurement portals and stores them in Supabase, so Sigmund RFP
Hub subscribers can see what similar RFPs actually ended up costing.

Scrapes public pages only — no login, no bypassing access controls. Sources
that gate award data behind a login are out of scope until credentials and
authorization are sorted out separately.

## Architecture

- `src/adapters/` — one adapter per source (DemandStar today), each
  implementing `AwardSourceAdapter`: `discoverAwardedBidUrls()` +
  `fetchAwardDetail(url)`. Adding a new procurement portal (BidNet, PlanetBids,
  OpenGov, Bonfire, etc.) means adding one adapter file and registering it in
  `src/index.ts` — the DB layer and runner are source-agnostic.
- `src/db/` — Supabase client + upsert logic. Records are keyed by
  `(source_id, source_bid_id)`; a content hash (`raw_html_hash`) skips
  rewriting rows that haven't changed since the last run.
- `supabase/migrations/0001_award_results.sql` — schema: `award_sources`,
  `award_results` (one row per awarded bid), `award_line_items` (one row per
  winning supplier — some awards are split across multiple vendors).

## Setup

1. `npm install`
2. Run the migration in `supabase/migrations/0001_award_results.sql` against
   your Supabase project (SQL editor or `supabase db push`).
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service role key
   is required because inserts/updates bypass row-level security — keep it
   server-side only, never ship it to a browser.
4. Set `DEMANDSTAR_SEED_BID_IDS` to the DemandStar bid IDs you want to fetch
   (comma-separated). Bid search/listing discovery isn't wired up yet — see
   Known limitations.

## Running

```
npm run scrape
```

Run it on a schedule (cron, GitHub Actions, Supabase Edge Function cron,
etc.) — it's idempotent, so re-running just refreshes changed records.

## How the DemandStar adapter actually works

`demandstar.com/app/limited/bids/{id}/details` is a client-rendered React SPA
— the server HTML is an empty shell, so scraping it as static HTML doesn't
work. Verified via browser DevTools against a real bid page, the SPA itself
calls two public JSON endpoints on `api.demandstar.com`:

- `POST /contents/agency/summary` with `{"bidId": <id>}` → agency name, bid
  number/type, dates, scope of work, `bidExternalStatus` (e.g. `"Awarded"`).
- `POST /contents/agency/awards` with `{"bidId": <id>}` → array of
  `{supplierName, amount}` — the actual award data.

The adapter (`src/adapters/demandstar.ts`) calls both directly and only
stores a record when `bidExternalStatus === "Awarded"` and at least one award
line item comes back. No login, no cookies, no scraping of rendered HTML —
just the same public API calls the browser makes.

## Known limitations / next steps

- **Discovery is manual for now**: there's no captured endpoint yet for
  DemandStar's bid search/listing (i.e. "give me all recently awarded bid
  IDs"). `DEMANDSTAR_SEED_BID_IDS` requires supplying bid IDs by hand. Finding
  the listing/search API the same way `/summary` and `/awards` were found
  (DevTools → Network while browsing "Browse Awarded Bids") is the next step
  to make this self-sufficient.
- **Additional sources**: add adapters for the other ~9 portals (BidNet
  Direct, PlanetBids, OpenGov Procurement, Bonfire, Vendor Registry, etc.)
  following the same `AwardSourceAdapter` interface. Check each for a public
  JSON API the same way before assuming HTML scraping is needed.
- **Scheduling**: no scheduler is wired up yet — pick one (GitHub Actions cron
  is simplest if this repo lives on GitHub).
