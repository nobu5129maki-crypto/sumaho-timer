const webpush = require("web-push");

const MAX_AHEAD_MS = 25 * 60 * 1000;
const HOP_MS = 200 * 1000;
const RING_LEAD_MS = 40 * 1000;
const RING_GAP_MS = 10 * 1000;
const RING_COUNT = 8;
const MAX_HOPS = 10;
const APP_ORIGIN = "https://sumaho-timer.vercel.app";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextStep(remain) {
  if (remain > RING_LEAD_MS) {
    return { sleepMs: Math.min(remain - RING_LEAD_MS, HOP_MS), chain: true };
  }
  return { sleepMs: Math.max(0, remain), chain: false };
}

function endpointAllowed(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  return (
    host === "fcm.googleapis.com" ||
    host === "android.googleapis.com" ||
    host === "jmt17.google.com" ||
    host.endsWith(".push.apple.com") ||
    host === "push.apple.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com")
  );
}

function fromApp(req) {
  const values = [req.headers.origin, req.headers.referer].filter(Boolean);
  return values.some((value) => {
    try {
      const url = new URL(String(value));
      if (url.origin === APP_ORIGIN) return true;
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  });
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12000) {
        reject(new Error("large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalize(body, internal) {
  const fireAt = Number(body && body.fireAt);
  const id = String((body && body.id) || "");
  const sub = body && body.subscription;
  const hops = Number(body && body.hops) || 0;
  const title = body && body.title === "30秒たちました" ? "30秒たちました" : "20分たちました";
  if (!Number.isFinite(fireAt) || !/^\d{10,16}$/.test(id)) return null;
  if (!sub || !endpointAllowed(sub.endpoint)) return null;
  if (!sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string") return null;
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 80) return null;
  if (hops < 0 || hops > MAX_HOPS || (!internal && hops !== 0)) return null;
  const skew = fireAt - Date.now();
  if (skew > MAX_AHEAD_MS || skew < -2 * 60 * 1000) return null;
  return {
    fireAt,
    id,
    title,
    vibrate: body.vibrate !== false,
    sound: body.sound !== false,
    hops,
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
  };
}

function hold(work) {
  const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.();
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(work);
    return true;
  }
  return false;
}

async function sendPush(job) {
  webpush.setVapidDetails("mailto:nobu5129maki@gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({
    title: job.title,
    body: "アプリを開くと、ストップまで音と振動が続きます。",
    id: job.id,
    vibrate: job.vibrate,
    sound: job.sound,
  });
  await webpush.sendNotification(job.subscription, payload, {
    TTL: 40,
    urgency: "high",
    topic: "pinto-alarm",
  });
}

async function chain(job) {
  const secret = process.env.ALARM_INTERNAL_SECRET;
  const urls = [APP_ORIGIN + "/api/alarm"];
  if (process.env.VERCEL_URL) urls.push("https://" + process.env.VERCEL_URL + "/api/alarm");
  const next = {
    fireAt: job.fireAt,
    id: job.id,
    title: job.title,
    vibrate: job.vibrate,
    sound: job.sound,
    hops: job.hops + 1,
    subscription: job.subscription,
  };
  let lastStatus = 0;
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-pinto-chain": secret,
          },
          body: JSON.stringify(next),
          signal: ac.signal,
        });
        lastStatus = res.status;
        if (res.ok) return;
      } catch {
        lastStatus = 0;
      } finally {
        clearTimeout(timer);
      }
      await sleep(1200);
    }
  }
  throw new Error("chain " + lastStatus);
}

async function ring(job) {
  for (let i = 0; i < RING_COUNT; i += 1) {
    try {
      await sendPush(job);
    } catch (error) {
      const code = error && error.statusCode;
      if (code === 404 || code === 410) return;
    }
    if (i < RING_COUNT - 1) await sleep(RING_GAP_MS);
  }
}

async function run(job) {
  const step = nextStep(job.fireAt - Date.now());
  console.log("pinto step", job.hops, step.chain ? "chain" : "ring", Math.round((job.fireAt - Date.now()) / 1000));
  if (step.chain && job.hops < MAX_HOPS) {
    await sleep(step.sleepMs);
    try {
      await chain(job);
      return;
    } catch {
      if (job.fireAt - Date.now() > 90 * 1000) return;
    }
  } else if (step.sleepMs > 0) {
    await sleep(Math.min(step.sleepMs, RING_LEAD_MS + 5000));
  }
  await ring(job);
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ ok: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.ALARM_INTERNAL_SECRET) }));
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.ALARM_INTERNAL_SECRET) {
    res.statusCode = 503;
    res.end();
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  const internal = req.headers["x-pinto-chain"] === process.env.ALARM_INTERNAL_SECRET;
  if (!internal && !fromApp(req)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const job = normalize(body, internal);
  if (!job) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const task = run(job).catch(() => {});
  if (!hold(task)) await task;
  res.statusCode = 202;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true }));
};

module.exports.nextStep = nextStep;
module.exports.endpointAllowed = endpointAllowed;
