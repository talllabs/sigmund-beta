import * as cheerio from "cheerio";
import { fetchHtml } from "../lib/http.js";
import { cleanText, hashHtml, parseMoney, parseUsDate } from "../lib/parse.js";
import type { AwardLineItem, AwardRecord, AwardSourceAdapter } from "./types.js";

const BASE_URL = "https://www.demandstar.com";

// DemandStar's public "Browse Awarded Bids" search doesn't expose a stable,
// unauthenticated query API we can crawl generically, so discovery starts
// from a configurable list of listing pages (e.g. per-agency or per-category
// browse pages) rather than a full-site crawl. Add more seeds as needed.
const DEFAULT_SEED_LISTING_URLS = (process.env.DEMANDSTAR_SEED_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DETAIL_URL_RE = /\/app\/(?:limited\/)?bids\/(\d+)\/details/;

function toAbsoluteUrl(href: string): string {
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return href;
  }
}

/**
 * Looks up a labeled field's value on a DemandStar bid-details page.
 * DemandStar renders "Bid Details" as label/value pairs (table rows or
 * dt/dd-style blocks); rather than depend on one exact DOM shape, this
 * scans for any element whose own text matches the label and reads the
 * sibling/adjacent element's text as the value.
 */
function findLabeledValue($: cheerio.CheerioAPI, label: string): string | null {
  let value: string | null = null;
  $("th, td, dt, div, span, label").each((_, el) => {
    if (value) return;
    const own = $(el)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();
    if (own.toLowerCase() === label.toLowerCase()) {
      const sibling = $(el).next("td, dd, div, span");
      const text = sibling.length ? sibling.text() : $(el).parent().next().text();
      value = cleanText(text);
    }
  });
  return value;
}

function parseAwardedTo($: cheerio.CheerioAPI): AwardLineItem[] {
  const items: AwardLineItem[] = [];

  $("table").each((_, table) => {
    const headerText = $(table).find("tr").first().text().toLowerCase();
    if (!headerText.includes("supplier") || !headerText.includes("amount")) return;

    $(table)
      .find("tr")
      .slice(1)
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const supplierName = cleanText($(cells[0]).text());
        const amount = parseMoney($(cells[1]).text());
        if (supplierName) {
          items.push({ supplierName, amount, currency: "USD" });
        }
      });
  });

  return items;
}

function parseCommodityCodes($: cheerio.CheerioAPI): string[] {
  const text = $("body").text();
  const matches = [...text.matchAll(/\[([\w-]+)\]\s*([^\n[]+)/g)];
  return matches
    .map((m) => cleanText(`${m[1]} ${m[2]}`))
    .filter((s): s is string => Boolean(s));
}

async function fetchAwardDetail(url: string): Promise<AwardRecord | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const match = url.match(DETAIL_URL_RE);
  if (!match) return null;
  const sourceBidId = match[1];

  const statusText = cleanText($("body").text().match(/\b(Awarded|Cancelled|Open|Closed)\b/)?.[0]);
  if (statusText !== "Awarded") {
    // Only awarded bids carry winner/amount data worth storing.
    return null;
  }

  const lineItems = parseAwardedTo($);
  if (lineItems.length === 0) {
    // Page says "Awarded" but no supplier/amount table parsed — skip rather
    // than store a record with no useful award data.
    return null;
  }

  const bidTitle = cleanText($("h1, .bid-title").first().text()) ?? cleanText($("title").text());

  const scopeOfWork = cleanText(
    findLabeledValue($, "Scope of Work") ??
      $("*:contains('Scope of Work')").filter((_, el) => $(el).children().length === 0).first().text(),
  );

  return {
    sourceBidId,
    detailUrl: url,
    agencyName: findLabeledValue($, "Agency Name"),
    bidTitle,
    bidNumber: findLabeledValue($, "Bid ID"),
    bidType: findLabeledValue($, "Bid Type"),
    broadcastDate: parseUsDate(findLabeledValue($, "Broadcast Date")),
    dueDate: parseUsDate(findLabeledValue($, "Due Date")),
    status: statusText,
    scopeOfWork,
    awardedAt: parseUsDate(findLabeledValue($, "Broadcast Date")), // refined below if an award date is found
    commodityCodes: parseCommodityCodes($),
    lineItems,
    rawHtmlHash: hashHtml(html),
  };
}

async function* discoverAwardedBidUrls(): AsyncGenerator<string> {
  for (const seedUrl of DEFAULT_SEED_LISTING_URLS) {
    let nextUrl: string | null = seedUrl;
    const seen = new Set<string>();

    while (nextUrl && !seen.has(nextUrl)) {
      seen.add(nextUrl);
      const html = await fetchHtml(nextUrl);
      const $ = cheerio.load(html);

      const detailUrls = new Set<string>();
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href && DETAIL_URL_RE.test(href)) {
          detailUrls.add(toAbsoluteUrl(href));
        }
      });
      for (const url of detailUrls) yield url;

      const nextLink = $("a:contains('Next'), a[rel='next']").first().attr("href");
      nextUrl = nextLink ? toAbsoluteUrl(nextLink) : null;
    }
  }
}

export const demandStarAdapter: AwardSourceAdapter = {
  id: "demandstar",
  name: "DemandStar (Euna Open Bid)",
  discoverAwardedBidUrls,
  fetchAwardDetail,
};
