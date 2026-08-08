import { fetchJson } from "../lib/http.js";
import { cleanText, hashContent } from "../lib/parse.js";
import type { AwardLineItem, AwardRecord, AwardSourceAdapter } from "./types.js";

const API_BASE = "https://api.demandstar.com";

// DemandStar's bid-details page (https://www.demandstar.com/app/limited/bids/{id}/details)
// is a client-side-rendered SPA with no useful server HTML — all data comes
// from JSON endpoints the SPA itself calls. Confirmed via browser DevTools
// against a real bid page:
//   POST /contents/agency/summary  {bidId}  -> bid metadata (agency, dates, scope, status)
//   POST /contents/agency/awards   {bidId}  -> winning supplier(s) + amount(s)
// bidExternalStatus === "Awarded" on the summary response is the reliable
// signal that award data exists; bidExternalStatusType "AW" is the same
// thing in coded form.

interface DemandStarSummary {
  agencyName: string;
  bidIdentifier: string;
  bidNumber: string;
  bidType: string;
  bidTypeDescription: string;
  bidName: string;
  broadcastDate: string | null;
  dueDate: string | null;
  scopeOfWork: string | null;
  bidExternalStatus: string; // e.g. "Awarded"
  commodities: Array<{ code?: string; description?: string; commodityCode?: string; commodityDescription?: string }>;
}

interface DemandStarAward {
  bidAwardId: number;
  bidId: number;
  supplierName: string;
  amount: number | null;
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(`${API_BASE}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function fetchAwardDetail(url: string): Promise<AwardRecord | null> {
  const match = url.match(/\/bids\/(\d+)/);
  if (!match) return null;
  const bidId = Number(match[1]);

  const [summaryRes, awardsRes] = await Promise.all([
    postJson<{ result: DemandStarSummary }>("/contents/agency/summary", { bidId }),
    postJson<{ result: DemandStarAward[] }>("/contents/agency/awards", { bidId }),
  ]);

  const summary = summaryRes.result;
  const awards = awardsRes.result ?? [];

  if (summary.bidExternalStatus !== "Awarded" || awards.length === 0) {
    return null;
  }

  const lineItems: AwardLineItem[] = awards.map((a) => ({
    supplierName: a.supplierName,
    amount: a.amount,
    currency: "USD",
  }));

  const commodityCodes = (summary.commodities ?? [])
    .map((c) => cleanText(`${c.commodityCode ?? c.code ?? ""} ${c.commodityDescription ?? c.description ?? ""}`))
    .filter((s): s is string => Boolean(s));

  return {
    sourceBidId: String(bidId),
    detailUrl: url,
    agencyName: cleanText(summary.agencyName),
    bidTitle: cleanText(summary.bidName),
    bidNumber: cleanText(summary.bidNumber ?? summary.bidIdentifier),
    bidType: cleanText(summary.bidTypeDescription ?? summary.bidType),
    broadcastDate: toIsoDate(summary.broadcastDate),
    dueDate: toIsoDate(summary.dueDate),
    status: summary.bidExternalStatus,
    scopeOfWork: cleanText(summary.scopeOfWork),
    awardedAt: toIsoDate(summary.broadcastDate), // API doesn't expose a distinct award date; refine if one turns up
    commodityCodes,
    lineItems,
    rawHtmlHash: hashContent(JSON.stringify({ summary, awards })),
  };
}

// DemandStar's public bid search/listing isn't captured yet (see README) —
// discovery is a configured list of known bid IDs until that endpoint is
// identified the same way /summary and /awards were.
const SEED_BID_IDS = (process.env.DEMANDSTAR_SEED_BID_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function* discoverAwardedBidUrls(): AsyncGenerator<string> {
  for (const bidId of SEED_BID_IDS) {
    yield `https://www.demandstar.com/app/limited/bids/${bidId}/details`;
  }
}

export const demandStarAdapter: AwardSourceAdapter = {
  id: "demandstar",
  name: "DemandStar (Euna Open Bid)",
  discoverAwardedBidUrls,
  fetchAwardDetail,
};
