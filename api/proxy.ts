export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

const WINDOW = 300; // 5 minutes

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
    return new Response("Missing sessionId or uuid", { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / WINDOW);

  // 🔥 stable + idle-based routing
  const backendIndex =
    hash(sessionId + ":" + uuid + ":" + bucket) % BACKENDS.length;

  const backend = BACKENDS[backendIndex];

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
