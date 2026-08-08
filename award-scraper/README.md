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
4. Set `DEMANDSTAR_SEED_URLS` to the public "Browse Awarded Bids" listing
   page(s) you want crawled (comma-separated for multiple agencies/categories).

## Running

```
npm run scrape
```

Run it on a schedule (cron, GitHub Actions, Supabase Edge Function cron,
etc.) — it's idempotent, so re-running just refreshes changed records.

## Known limitations / next steps

- **DemandStar selector robustness**: the adapter locates fields by matching
  visible label text ("Agency Name", "Awarded To", etc.) rather than hard-coded
  CSS selectors, since the exact DOM wasn't verified against a live fetch in
  this environment. Run it against a real listing page early and adjust
  `src/adapters/demandstar.ts` if any field comes back empty.
- **Discovery**: DemandStar doesn't expose a stable public search API, so
  discovery starts from configured listing-page seeds and follows "Next"
  pagination links. If a given agency's awarded-bids listing itself requires
  login, that agency's bids won't be reachable in this public-only mode.
- **Additional sources**: add adapters for the other ~9 portals (BidNet
  Direct, PlanetBids, OpenGov Procurement, Bonfire, Vendor Registry, etc.)
  following the same `AwardSourceAdapter` interface.
- **Scheduling**: no scheduler is wired up yet — pick one (GitHub Actions cron
  is simplest if this repo lives on GitHub).
