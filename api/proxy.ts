export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
  "http://east.ayanakojivps.shop",
];

const WINDOW = 180; // 3 minutes

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // FULL PATH: /uuid/path...
  const parts = url.pathname.split("/");

  const sessionId = parts[1]; // btV5knWzHGnPcjGkKROmeC4Pke
  if (!sessionId) {
    return new Response("Missing session ID", { status: 400 });
  }

  // rebuild original path AFTER session id
  const restPath = "/" + parts.slice(1).join("/");

  // ⏱ time bucket (3 min rotation)
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / WINDOW);

  // 🔥 deterministic routing per session + time window
  const key = sessionId + ":" + bucket;
  const index = hashString(key) % BACKENDS.length;

  const target = BACKENDS[index];
  const backendUrl = target + restPath + url.search;

  // headers cleanup (important for streaming)
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  const upstream = await fetch(backendUrl, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : req.body,
    redirect: "manual",
  });

  // STREAMING response (no buffering)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...Object.fromEntries(upstream.headers),
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
