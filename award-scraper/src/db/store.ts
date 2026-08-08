import { supabase } from "./supabase.js";
import type { AwardRecord } from "../adapters/types.js";

/** Inserts or updates an award result and replaces its line items. */
export async function upsertAwardRecord(sourceId: string, record: AwardRecord): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from("award_results")
    .select("id, raw_html_hash")
    .eq("source_id", sourceId)
    .eq("source_bid_id", record.sourceBidId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing && existing.raw_html_hash === record.rawHtmlHash) {
    return; // page unchanged since last scrape, nothing to do
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("award_results")
    .upsert(
      {
        source_id: sourceId,
        source_bid_id: record.sourceBidId,
        detail_url: record.detailUrl,
        agency_name: record.agencyName,
        bid_title: record.bidTitle,
        bid_number: record.bidNumber,
        bid_type: record.bidType,
        broadcast_date: record.broadcastDate,
        due_date: record.dueDate,
        status: record.status,
        scope_of_work: record.scopeOfWork,
        awarded_at: record.awardedAt,
        commodity_codes: record.commodityCodes,
        raw_html_hash: record.rawHtmlHash,
        scraped_at: new Date().toISOString(),
      },
      { onConflict: "source_id,source_bid_id" },
    )
    .select("id")
    .single();

  if (upsertError) throw upsertError;

  const { error: deleteError } = await supabase
    .from("award_line_items")
    .delete()
    .eq("award_result_id", upserted.id);
  if (deleteError) throw deleteError;

  if (record.lineItems.length > 0) {
    const { error: insertError } = await supabase.from("award_line_items").insert(
      record.lineItems.map((item) => ({
        award_result_id: upserted.id,
        supplier_name: item.supplierName,
        amount: item.amount,
        currency: item.currency,
        notes: item.notes ?? null,
      })),
    );
    if (insertError) throw insertError;
  }
}
