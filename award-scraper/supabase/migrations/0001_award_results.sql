-- Award results scraped from public procurement portals (DemandStar/Euna, and
-- future sources). One row per bid/RFP award, keyed by (source, source_bid_id)
-- so re-scraping the same bid updates rather than duplicates it.

create table if not exists public.award_sources (
  id text primary key,              -- e.g. 'demandstar'
  name text not null,                -- e.g. 'DemandStar (Euna Open Bid)'
  base_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.award_results (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.award_sources(id),
  source_bid_id text not null,       -- the portal's own bid/solicitation id
  detail_url text not null,

  agency_name text,
  bid_title text,
  bid_number text,                   -- agency-issued solicitation number
  bid_type text,                     -- RFP, IFB, RFQ, etc.
  broadcast_date date,
  due_date date,

  status text,                       -- Awarded, Cancelled, etc.
  scope_of_work text,

  awarded_at date,                   -- best-guess award/intent-to-award date

  commodity_codes text[],

  raw_html_hash text,                -- change-detection, avoid re-parsing unchanged pages
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_id, source_bid_id)
);

create index if not exists award_results_agency_idx on public.award_results (agency_name);
create index if not exists award_results_awarded_at_idx on public.award_results (awarded_at);
create index if not exists award_results_scraped_at_idx on public.award_results (scraped_at);

-- Multiple suppliers/line-items can be awarded on a single bid (e.g. split awards).
create table if not exists public.award_line_items (
  id uuid primary key default gen_random_uuid(),
  award_result_id uuid not null references public.award_results(id) on delete cascade,
  supplier_name text not null,
  amount numeric(14, 2),
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists award_line_items_award_result_idx on public.award_line_items (award_result_id);
create index if not exists award_line_items_supplier_idx on public.award_line_items (supplier_name);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists award_results_set_updated_at on public.award_results;
create trigger award_results_set_updated_at
  before update on public.award_results
  for each row execute function public.set_updated_at();

insert into public.award_sources (id, name, base_url)
values ('demandstar', 'DemandStar (Euna Open Bid)', 'https://www.demandstar.com')
on conflict (id) do nothing;

alter table public.award_results enable row level security;
alter table public.award_line_items enable row level security;
alter table public.award_sources enable row level security;

-- Read access for authenticated Sigmund users; writes only via service role (the scraper).
create policy "award_results readable by authenticated" on public.award_results
  for select to authenticated using (true);
create policy "award_line_items readable by authenticated" on public.award_line_items
  for select to authenticated using (true);
create policy "award_sources readable by authenticated" on public.award_sources
  for select to authenticated using (true);
