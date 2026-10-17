const CACHE = "pinto-v10";
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

function alarmDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pinto-alarm", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeBookmark(id, at) {
  return alarmDb().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ id: String(id), at }, "current");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })
  );
}

function readBookmark() {
  return alarmDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get("current");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function clearBookmark() {
  return alarmDb().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete("current");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })
  );
}

function showAlarm(title, body, data) {
  const seq = data && Number.isFinite(data.seq) ? data.seq : Date.now();
  const options = {
    body: body || "アプリを開くと、ストップまで音と振動が続きます。",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "pinto-alarm-" + seq,
    renotify: true,
    lang: "ja",
    silent: Boolean(data && data.sound === false),
    requireInteraction: true,
    data: { url: "./", id: data && data.id },
  };
  if (!data || data.vibrate !== false) options.vibrate = [600, 200, 600, 200, 600, 200, 800];
  return self.registration.showNotification(title || "20分たちました", options);
}

async function deliverPush(data) {
  if (!data || typeof data.id !== "string") return;
  let bookmark = null;
  let failed = false;
  try {
    bookmark = await readBookmark();
  } catch {
    failed = true;
  }
  if (!failed && bookmark && bookmark.id !== data.id) return;
  const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  open.forEach((client) => client.postMessage({ type: "due" }));
  await showAlarm(data.title, data.body, data);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(deliverPush(data));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "bookmark" && typeof data.id === "string") {
    event.waitUntil(writeBookmark(data.id, data.at));
    return;
  }
  if (data.type === "disarm") {
    clearAlarmTimer();
    event.waitUntil(clearBookmark());
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
