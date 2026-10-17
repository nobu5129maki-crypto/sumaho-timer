const CACHE = "pinto-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});

let alarmTimer = 0;
let releaseAlarm = () => {};

function clearAlarmTimer() {
  clearTimeout(alarmTimer);
  alarmTimer = 0;
  releaseAlarm();
  releaseAlarm = () => {};
}

function showAlarm(title) {
  return self.registration.showNotification(title || "20分たちました", {
    body: "6メートル先を、20秒。スタートを押してください。",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "pinto-alarm",
    renotify: true,
    lang: "ja",
    silent: false,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200, 100, 420],
    data: { url: "./" },
  });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "disarm") {
    clearAlarmTimer();
    return;
  }
  if (data.type !== "arm" || typeof data.at !== "number") return;
  clearAlarmTimer();
  const delay = Math.max(0, data.at - Date.now());
  const title = data.title;
  const pending = new Promise((resolve) => {
    releaseAlarm = resolve;
    alarmTimer = setTimeout(async () => {
      alarmTimer = 0;
      releaseAlarm = () => {};
      try {
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const visible = open.some((client) => client.visibilityState === "visible");
        if (!visible) await showAlarm(title);
      } catch {
        /* 通知が出せなくても、画面を開いたときに鳴らす */
      }
      resolve();
    }, delay);
  });
  event.waitUntil(pending);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("./");
    })
  );
});
