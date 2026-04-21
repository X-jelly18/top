export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

const LOG_SECRET = "superlogx11";

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/* ---------------- INTERNAL LOGGER ---------------- */

async function handleLog(req: Request) {
  try {
    const body = await req.json();

    // ⚡ simple safe log output (you can later store elsewhere)
    console.log("📡 LOG:", JSON.stringify(body));

    return new Response("logged", { status: 200 });
  } catch {
    return new Response("bad log", { status: 400 });
  }
}

/* ---------------- MAIN PROXY ---------------- */

export default async function handler(req: Request) {
  const url = new URL(req.url);

  const parts = url.pathname.split("/").filter(Boolean);

  // 🔐 SECRET LOG ROUTE
  if (parts[0] === LOG_SECRET) {
    return handleLog(req);
  }

  // ---------------- PROXY LOGIC ----------------

  const sessionId = parts[0];
  const uuid = parts[1];
  const restPath = "/" + parts.slice(2).join("/");

  if (!sessionId || !uuid) {
    return new Response("Missing IDs", { status: 400 });
  }

  const backend =
    BACKENDS[hash(sessionId + ":" + uuid) % BACKENDS.length];

  const backendUrl =
    backend + "/" + sessionId + "/" + uuid + restPath + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  const start = Date.now();

  const res = await fetch(backendUrl, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : req.body,
    redirect: "manual",
  });

  const duration = Date.now() - start;

  // 📡 fire-and-forget internal log (non-blocking)
  fetch(url.origin + "/" + LOG_SECRET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      uuid,
      backend,
      path: restPath,
      status: res.status,
      duration,
      time: Date.now(),
    }),
  }).catch(() => {});

  return new Response(res.body, {
    status: res.status,
    headers: {
      ...Object.fromEntries(res.headers),
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
