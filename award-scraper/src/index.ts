import "dotenv/config";
import pLimit from "p-limit";
import { demandStarAdapter } from "./adapters/demandstar.js";
import type { AwardSourceAdapter } from "./adapters/types.js";
import { upsertAwardRecord } from "./db/store.js";

const ADAPTERS: AwardSourceAdapter[] = [demandStarAdapter];
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY ?? 3);

async function runAdapter(adapter: AwardSourceAdapter): Promise<void> {
  const limit = pLimit(CONCURRENCY);
  const tasks: Promise<void>[] = [];
  let discovered = 0;
  let stored = 0;
  let errors = 0;

  for await (const url of adapter.discoverAwardedBidUrls()) {
    discovered++;
    tasks.push(
      limit(async () => {
        try {
          const record = await adapter.fetchAwardDetail(url);
          if (record) {
            await upsertAwardRecord(adapter.id, record);
            stored++;
          }
        } catch (err) {
          errors++;
          console.error(`[${adapter.id}] failed on ${url}:`, err);
        }
      }),
    );
  }

  await Promise.all(tasks);
  console.log(`[${adapter.id}] discovered=${discovered} stored=${stored} errors=${errors}`);
}

async function main() {
  const command = process.argv[2] ?? "run";
  if (command !== "run") {
    console.error(`Unknown command: ${command}. Usage: npm run scrape`);
    process.exit(1);
  }

  for (const adapter of ADAPTERS) {
    await runAdapter(adapter);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
