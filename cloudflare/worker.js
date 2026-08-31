const ROUTES_URL =
  "https://raw.githubusercontent.com/Ercoman2/GPX-LVM/main/routes.csv";
const STATS_URL =
  "https://ea3igt.github.io/volta-mon-peu-web/data/stats.json";
const DISPATCH_URL =
  "https://api.github.com/repos/ea3igt/volta-mon-peu-web/actions/workflows/actualitza-i-publica.yml/dispatches";

async function fetchWithoutCache(url) {
  const separator = url.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}check=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
    },
  });
}

async function sha256Prefix(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

async function compareSourceFingerprint() {
  const [routesResponse, statsResponse] = await Promise.all([
    fetchWithoutCache(ROUTES_URL),
    fetchWithoutCache(STATS_URL),
  ]);

  if (!routesResponse.ok) {
    throw new Error(`No es pot llegir routes.csv: HTTP ${routesResponse.status}`);
  }
  if (!statsResponse.ok) {
    throw new Error(`No es pot llegir stats.json: HTTP ${statsResponse.status}`);
  }

  const routesData = await routesResponse.arrayBuffer();
  const stats = await statsResponse.json();
  const previousFingerprint = stats?.meta?.source_fingerprint;

  if (!/^[0-9a-f]{16}$/i.test(previousFingerprint || "")) {
    throw new Error("stats.json no conté un source_fingerprint vàlid.");
  }

  const currentFingerprint = await sha256Prefix(routesData);
  return {
    changed: currentFingerprint !== previousFingerprint,
    currentFingerprint,
    previousFingerprint,
  };
}

async function dispatchWorkflow(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("Falta configurar el secret GITHUB_TOKEN.");
  }

  const response = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "volta-mon-peu-scheduler",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        origen: "cloudflare",
      },
    }),
  });

  const result = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub no ha acceptat l'execució: ${response.status} ${result}`);
  }

  console.info({
    message: "Workflow de GitHub iniciat correctament.",
    status: response.status,
  });
}

async function runScheduled(env, cron) {
  console.info({ message: "Comprovació programada iniciada.", cron });

  let comparison;
  try {
    comparison = await compareSourceFingerprint();
  } catch (error) {
    console.warn({
      message: "No s'ha pogut comparar el fingerprint; s'inicia GitHub per seguretat.",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (comparison && !comparison.changed) {
    console.info({
      message: "No hi ha dades noves; no s'inicia GitHub.",
      fingerprint: comparison.currentFingerprint,
    });
    return;
  }

  if (comparison) {
    console.info({
      message: "S'han detectat dades noves.",
      anterior: comparison.previousFingerprint,
      actual: comparison.currentFingerprint,
    });
  }

  await dispatchWorkflow(env);
}

export default {
  async fetch() {
    return new Response(
      "Planificador actiu. Les actualitzacions només s'inicien mitjançant el Cron Trigger.",
      {
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
      },
    );
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.cron));
  },
};
