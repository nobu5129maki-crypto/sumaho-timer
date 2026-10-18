const webpush = require("web-push");

const MAX_AHEAD_MS = 25 * 60 * 1000;
const HOP_MS = 200 * 1000;
const RING_LEAD_MS = 40 * 1000;
const BUDGET_MS = 240 * 1000;
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
  let fireAt = Number(body && body.fireAt);
  const phoneNow = Number(body && body.phoneNow);
  const id = String((body && body.id) || "");
  const sub = body && body.subscription;
  const hops = Number(body && body.hops) || 0;
  const title = body && body.title === "30秒たちました" ? "30秒たちました" : "20分たちました";
  const clock = typeof (body && body.clock) === "string" && /^\d{1,2}:\d{2}$/.test(body.clock) ? body.clock : "";
  if (!Number.isFinite(fireAt) || !/^\d{10,16}$/.test(id)) return null;
  if (!sub || !endpointAllowed(sub.endpoint)) return null;
  if (!sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string") return null;
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 80) return null;
  if (hops < 0 || hops > MAX_HOPS || (!internal && hops !== 0)) return null;
  if (!internal && Number.isFinite(phoneNow)) {
    const delay = fireAt - phoneNow;
    if (!Number.isFinite(delay) || delay > MAX_AHEAD_MS || delay < 5000) return null;
    fireAt = Date.now() + delay;
  }
  const skew = fireAt - Date.now();
  if (skew > MAX_AHEAD_MS || skew < -2 * 60 * 1000) return null;
  return {
    fireAt,
    id,
    title,
    clock,
    vibrate: body.vibrate !== false,
    sound: body.sound !== false,
    hops,
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
  };
}

async function sendPush(job, seq) {
  webpush.setVapidDetails("mailto:nobu5129maki@gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({
    title: job.title,
    body: job.clock
      ? `このスマホの${job.clock}です。開くと、ストップまで音と振動が続きます。`
      : "アプリを開くと、ストップまで音と振動が続きます。",
    id: job.id,
    seq,
    vibrate: job.vibrate,
    sound: job.sound,
  });
  await webpush.sendNotification(job.subscription, payload, {
    TTL: 120,
    urgency: "high",
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
    clock: job.clock,
    vibrate: job.vibrate,
    sound: job.sound,
    hops: job.hops + 1,
    subscription: job.subscription,
  };
  let lastStatus = 0;
  for (const url of urls) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
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
      if (res.ok || res.status === 202) {
        console.log("pinto chain handed off", job.hops + 1);
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        console.log("pinto chain handed off", job.hops + 1);
        return;
      }
      lastStatus = 0;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("chain " + lastStatus);
}

async function ring(job) {
  let host = "unknown";
  try {
    host = new URL(job.subscription.endpoint).hostname;
  } catch {
    host = "unknown";
  }
  for (let i = 0; i < RING_COUNT; i += 1) {
    try {
      await sendPush(job, i);
      console.log("pinto sent", job.hops, i, host);
    } catch (error) {
      const code = error && error.statusCode;
      console.log("pinto fail", job.hops, i, host, code || (error && error.message) || "error");
      if (code === 404 || code === 410 || code === 400 || code === 401 || code === 403) return;
    }
    if (i < RING_COUNT - 1) await sleep(RING_GAP_MS);
  }
}

function canRing(now, fireAt) {
  return now >= fireAt;
}

function decide(now, job, startedAt) {
  const remain = job.fireAt - now;
  if (remain <= 0) return { action: "ring", sleepMs: 0 };
  const used = now - startedAt;
  const budgetLeft = BUDGET_MS - used;
  if (used > 160 * 1000 || budgetLeft < 20 * 1000) {
    if (job.hops >= MAX_HOPS) return { action: "drop" };
    return { action: "chain" };
  }
  const slice = Math.min(remain, HOP_MS, Math.max(1000, budgetLeft - 20 * 1000));
  return { action: "sleep", sleepMs: slice };
}

async function run(job) {
  const startedAt = Date.now();
  for (let steps = 0; steps < 12; steps += 1) {
    const choice = decide(Date.now(), job, startedAt);
    console.log("pinto step", job.hops, choice.action, Math.round((job.fireAt - Date.now()) / 1000));
    if (choice.action === "drop") return;
    if (choice.action === "chain") {
      try {
        await chain(job);
      } catch (error) {
        console.log("pinto chain fail", job.hops, error && error.message);
      }
      return;
    }
    if (choice.action === "ring") {
      if (choice.sleepMs > 0) await sleep(choice.sleepMs);
      if (!canRing(Date.now(), job.fireAt)) return;
      await ring(job);
      return;
    }
    const before = Date.now();
    await sleep(choice.sleepMs);
    if (choice.sleepMs > 5000 && Date.now() - before < choice.sleepMs / 2) {
      console.log("pinto sleep short", job.hops, Date.now() - before);
      if (job.hops < MAX_HOPS) {
        try {
          await chain(job);
        } catch (error) {
          console.log("pinto chain fail", job.hops, error && error.message);
        }
      }
      return;
    }
  }
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
  if (body && body.ping === true) {
    console.log("pinto shown", String(body.id || "").slice(0, 20));
    res.statusCode = 204;
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
  try {
    await run(job);
    console.log("pinto done", job.hops);
  } catch (error) {
    console.log("pinto done-fail", job.hops, error && error.message);
  }
  if (res.writableEnded) return;
  res.statusCode = 202;
  res.setHeader("content-type", "application/json; charset=utf-8");
  try {
    res.end(JSON.stringify({ ok: true }));
  } catch {
    /* 端末が切れても、通知は送り終えている */
  }
};

module.exports.nextStep = nextStep;
module.exports.endpointAllowed = endpointAllowed;
module.exports.canRing = canRing;
module.exports.decide = decide;
