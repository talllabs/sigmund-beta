export interface AwardLineItem {
  supplierName: string;
  amount: number | null;
  currency: string;
  notes?: string;
}

export interface AwardRecord {
  sourceBidId: string;
  detailUrl: string;

  agencyName: string | null;
  bidTitle: string | null;
  bidNumber: string | null;
  bidType: string | null;
  broadcastDate: string | null; // ISO date
  dueDate: string | null; // ISO date

  status: string | null;
  scopeOfWork: string | null;
  awardedAt: string | null; // ISO date

  commodityCodes: string[];

  lineItems: AwardLineItem[];

  rawHtmlHash: string;
}

/** A source adapter knows how to discover awarded-bid detail URLs and parse them. */
export interface AwardSourceAdapter {
  id: string;
  name: string;

  /** Yields detail-page URLs for bids that appear to have been awarded. */
  discoverAwardedBidUrls(): AsyncGenerator<string>;

  /** Fetches and parses a single bid detail page into a normalized AwardRecord. */
  fetchAwardDetail(url: string): Promise<AwardRecord | null>;
}
