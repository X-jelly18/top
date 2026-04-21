export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

const SESSION_WINDOW = 180; // 3 minutes

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

async function tryFetch(url: string, opts: RequestInit) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 4000);

  try {
    const res = await fetch(url, { ...opts, signal: c.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error("bad");
    return res;
  } catch {
    clearTimeout(t);
    return null;
  }
}

const penalty = new Map<string, number>();

function getScore(b: string) {
  const base = 100;
  const p = penalty.get(b) || 0;
  return Math.max(10, base - p);
}

export default async function handler(req: Request) {
  const url = new URL(req.url);

  const parts = url.pathname.split("/");
  const sessionId = parts[1];
  const uuid = parts[2];

  if (!sessionId || !uuid) {
    return new Response("Missing IDs", { status: 400 });
  }

  const path = "/" + parts.slice(1).join("/");

  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / SESSION_WINDOW);

  // deterministic + time-based routing per UUID
  const baseIndex =
    hash(sessionId + ":" + uuid + ":" + bucket) % BACKENDS.length;

  const ordered = [
    BACKENDS[baseIndex],
    ...BACKENDS.filter((_, i) => i !== baseIndex),
  ];

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  for (const backend of ordered) {
    const res = await tryFetch(backend + path + url.search, {
      method: req.method,
      headers,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : req.body,
      redirect: "manual",
    });

    if (res) {
      penalty.set(backend, Math.max(0, (penalty.get(backend) || 0) - 2));

      return new Response(res.body, {
        status: res.status,
        headers: {
          ...Object.fromEntries(res.headers),
          "cache-control": "no-store",
          "x-accel-buffering": "no",
        },
      });
    }

    // temporary penalty for failing VPS
    penalty.set(backend, (penalty.get(backend) || 0) + 20);
  }

  return new Response("All backends failed", { status: 502 });
}
