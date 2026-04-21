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

  // deterministic base routing
  const baseIndex =
    hash(sessionId + ":" + uuid) % BACKENDS.length;

  // idle-based rotation bucket (5 min)
  const bucket = Math.floor(now / IDLE_TIMEOUT);

  const finalIndex =
    hash(sessionId + ":" + uuid + ":" + bucket) % BACKENDS.length;

  const backend = BACKENDS[finalIndex];

  const backendUrl = backend + path + url.search;

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
