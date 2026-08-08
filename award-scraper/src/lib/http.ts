import { request } from "undici";

const USER_AGENT =
  "SigmundAwardScraper/0.1 (+https://sigmundrfphub.com; contact: tallylabdero@gmail.com)";

export interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function fetchText(
  url: string,
  { retries = 2, timeoutMs = 20_000, method = "GET", headers = {}, body }: FetchOptions = {},
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await request(url, {
        method: method as "GET" | "POST",
        headers: { "user-agent": USER_AGENT, ...headers },
        body,
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

/** Fetches a public HTML page. Polite scraping only — no auth, no bypassing access controls. */
export async function fetchHtml(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchText(url, { ...options, headers: { accept: "text/html,application/xhtml+xml", ...options.headers } });
}

/** Calls a public JSON API endpoint (e.g. DemandStar's /contents/agency/* endpoints). */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  return JSON.parse(text) as T;
}
