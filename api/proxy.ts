export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
  "http://east.ayanakojivps.shop",
];

// ⏱ 3-minute inactivity window
const WINDOW = 180;

// Simple hash
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

  const parts = url.pathname.split("/");
  const uuid = parts[2];

  if (!uuid) {
    return new Response("Missing UUID", { status: 400 });
  }

  const cleanPath = "/" + parts.slice(3).join("/");

  const now = Math.floor(Date.now() / 1000);

  // 🧠 time bucket (changes every 3 min)
  const bucket = Math.floor(now / WINDOW);

  // 🔥 rotation salt ensures switching after inactivity
  const salt = uuid + ":" + bucket;

  // 🎯 pick backend
  const index = hashString(salt) % BACKENDS.length;
  const targetHost = BACKENDS[index];

  const backendUrl = targetHost + cleanPath + url.search;

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

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-accel-buffering", "no");
  responseHeaders.set("connection", "keep-alive");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
