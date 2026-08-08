import { createHash } from "node:crypto";

export function hashHtml(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

/** Parses "$184,640.00" -> 184640.00. Returns null if no usable number found. */
export function parseMoney(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Parses common US date formats like "05/06/2026 2:00 PM Pacific" -> "2026-05-06". */
export function parseUsDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function cleanText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
