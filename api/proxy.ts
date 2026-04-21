export const config = {
  runtime: "edge",
};

const BACKENDS = [
  "http://south.ayanakojivps.shop",
  "http://north.ayanakojivps.shop",
];

const IDLE_TIMEOUT = 300; // 5 minutes

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

  // session key
  const key = sessionId + ":" + uuid;

  // in-memory session store (Edge runtime)
  const store = globalThis as any;
  store.__SESSIONS ||= new Map<string, { backend: string; last: number }>();
  const sessions: Map<string, { backend: string; last: number }> =
    store.__SESSIONS;

  const session = sessions.get(key);

  let backend: string;

  if (!session) {
    // 🆕 NEW UUID → RANDOM backend
    backend = BACKENDS[Math.floor(Math.random() * BACKENDS.length)];
  } else if (now - session.last > IDLE_TIMEOUT) {
    // 🔁 IDLE expired → RANDOM new backend
    backend = BACKENDS[Math.floor(Math.random() * BACKENDS.length)];
  } else {
    // 🟢 ACTIVE → keep same backend
    backend = session.backend;
  }

  // save/update session
  sessions.set(key, {
    backend,
    last: now,
  });

  const backendUrl = backend + path + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  try {
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
  } catch {
    return new Response("Backend unreachable", { status: 502 });
  }
}
