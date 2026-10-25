import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const source = await readFile(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const routes = "stage,date\n1,2026-10-24\n";
const digest = Buffer.from(await webcrypto.subtle.digest("SHA-256", Buffer.from(routes))).toString("hex").slice(0, 16);

async function run({ fingerprint = digest, manifest = routes, status = 200 } = {}) {
  const requests = [];
  const logs = [];
  const context = vm.createContext({
    crypto: webcrypto, Uint8Array, TextDecoder, AbortSignal, Date,
    console: { info: entry => logs.push(entry), warn: entry => logs.push(entry) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options?.method === "POST") return new Response(null, { status: 204 });
      if (url.includes("routes.csv")) return new Response(manifest);
      assert.ok(url.includes("source-fingerprint.txt"), "Must never fetch stats.json");
      return new Response(fingerprint + "\n", { status });
    },
  });
  vm.runInContext(source.replace("export default", "globalThis.worker ="), context);
  let pending;
  await context.worker.scheduled({ cron: "test" }, { GITHUB_TOKEN: "test-only" }, { waitUntil: promise => pending = promise });
  await pending;
  return { requests, logs, dispatched: requests.some(request => request.options?.method === "POST") };
}

assert.equal((await run()).dispatched, false, "Matching fingerprints must not dispatch");
assert.equal((await run({ fingerprint: "0".repeat(16) })).dispatched, true, "New data must dispatch");
assert.equal((await run({ fingerprint: "invalid" })).dispatched, true, "Invalid fingerprint must dispatch safely");
assert.equal((await run({ status: 404 })).dispatched, true, "Missing file must dispatch safely");
assert.equal((await run({ manifest: "x".repeat(200000) })).dispatched, true, "Oversized manifest must dispatch safely");
assert.equal((await run({ fingerprint: "x".repeat(2000000) })).dispatched, true, "Oversized fingerprint must dispatch safely");
console.log("6 comprovacions correctes: coincidència, canvi, fingerprint invàlid, fitxer absent i dos límits de mida.");
