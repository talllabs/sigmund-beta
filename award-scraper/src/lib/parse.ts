import { createHash } from "node:crypto";

/** Content hash used for change detection between scrapes. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function cleanText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
