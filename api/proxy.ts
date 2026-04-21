export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

// 5-minute rotation window
const WINDOW = 300;

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

  const parts = url.pathname.split("/").filter(Boolean);

  const sessionId = parts[0];
  const uuid = parts[1];
  const restPath = "/" + parts.slice(2).join("/");

  if (!sessionId || !uuid) {
    return new Response("Missing IDs", { status: 400 });
  }

  // ⏱ global time bucket (5 min)
  const bucket = Math.floor(Date.now() / 1000 / WINDOW);

  // 🔥 deterministic backend selection per time window
  const backend =
    BACKENDS[hash(sessionId + ":" + bucket) % BACKENDS.length];

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
