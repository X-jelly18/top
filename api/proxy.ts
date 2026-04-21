export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

const IDLE_TIMEOUT = 300; // 5 minutes

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickDifferent(exclude: string) {
  const options = BACKENDS.filter((b) => b !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

// ⚡ Edge-local session store (best effort)
const sessions = new Map<
  string,
  { backend: string; last: number }
>();

export default async function handler(req: Request) {
  const url = new URL(req.url);

  const parts = url.pathname.split("/").filter(Boolean);

  // RULE STRUCTURE:
  // /btV5... /uuid / path
  const sessionId = parts[0];
  const uuid = parts[1];
  const restPath = "/" + parts.slice(2).join("/");

  if (!sessionId || !uuid) {
    return new Response("Missing IDs", { status: 400 });
  }

  const key = sessionId + ":" + uuid;
  const now = Math.floor(Date.now() / 1000);

  let entry = sessions.get(key);

  let backend: string;

  if (!entry) {
    // 🆕 first request → deterministic start backend
    backend =
      BACKENDS[hash(key) % BACKENDS.length];

    sessions.set(key, {
      backend,
      last: now,
    });
  } else {
    const idle = now - entry.last;

    if (idle >= IDLE_TIMEOUT) {
      // 🔁 inactive → pick RANDOM but NOT previous backend
      backend = pickDifferent(entry.backend);
    } else {
      // 🟢 active → stick to same backend
      backend = entry.backend;
    }

    sessions.set(key, {
      backend,
      last: now,
    });
  }

  const backendUrl =
    backend + "/" + sessionId + "/" + uuid + restPath + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  const res = await fetch(backendUrl, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : req.body,
    redirect: "manual",
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      ...Object.fromEntries(res.headers),
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
