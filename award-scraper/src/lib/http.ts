import { request } from "undici";

const USER_AGENT =
  "SigmundAwardScraper/0.1 (+https://sigmundrfphub.com; contact: tallylabdero@gmail.com)";

export interface FetchHtmlOptions {
  retries?: number;
  timeoutMs?: number;
}

/**
 * Fetches a public page as text. Identifies itself with a real UA/contact
 * string and does light retrying — polite scraping of public pages only,
 * no auth, no bypassing of any access controls.
 */
export async function fetchHtml(
  url: string,
  { retries = 2, timeoutMs = 20_000 }: FetchHtmlOptions = {},
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await request(url, {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      if (res.statusCode >= 400) {
        throw new Error(`HTTP ${res.statusCode} fetching ${url}`);
      }
      return await res.body.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
