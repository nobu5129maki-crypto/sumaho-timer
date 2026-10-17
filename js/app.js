"use strict";

const KEY = "pinto-v1";
const VAPID_PUBLIC_KEY = "BDGQKoWW01aztvoY-jw9fioBbUGUCoNlK-sJU1UTjz1AS_SY577IEdZlWhlWElorOvXgFy-jrjykgRyub4V4m2c";
const LOOK_MS = 20000;
const HINTS = [
  "画面は、目線の高さへ",
  "肘は、反対の手で支える",
  "首は、垂直に保つ",
  "視線は、水平からやや下",
];
const HEAT_LINES = [
  "目のまわりの血流を、通す",
  "涙の油膜が、戻る時間",
  "首のうしろを、ゆるめる",
  "副交感神経が、優位になる",
];

const $ = (id) => document.getElementById(id);

const el = {
  intro: $("intro"),
  introBtn: $("introBtn"),
  viewNow: $("viewNow"),
  viewHeat: $("viewHeat"),
  viewScience: $("viewScience"),
  navNow: $("navNow"),
  navHeat: $("navHeat"),
  navScience: $("navScience"),
  practicePill: $("practicePill"),
  settingsBtn: $("settingsBtn"),
  hero: $("hero"),
  heroKicker: $("heroKicker"),
  heroTime: $("heroTime"),
  heroSub: $("heroSub"),
  metaLine: $("metaLine"),
  ringProgress: $("ringProgress"),
  startBtn: $("startBtn"),
  stopAlarmBtn: $("stopAlarmBtn"),
  runActions: $("runActions"),
  pauseBtn: $("pauseBtn"),
  endBtn: $("endBtn"),
  quickRow: $("quickRow"),
  quickLook: $("quickLook"),
  quickBlink: $("quickBlink"),
  quickPosture: $("quickPosture"),
  statLook: $("statLook"),
  statBlink: $("statBlink"),
  statPosture: $("statPosture"),
  statHeat: $("statHeat"),
  todaySentence: $("todaySentence"),
  week: $("week"),
  miniBar: $("miniBar"),
  miniLabel: $("miniLabel"),
  miniTime: $("miniTime"),
  look: $("look"),
  lookNum: $("lookNum"),
  lookHint: $("lookHint"),
  lookRunning: $("lookRunning"),
  lookDone: $("lookDone"),
  lookContinue: $("lookContinue"),
  lookFinish: $("lookFinish"),
  lookSkip: $("lookSkip"),
  lookProgress: $("lookProgress"),
  toast: $("toast"),
  backdrop: $("backdrop"),
  postureSheet: $("postureSheet"),
  postureDone: $("postureDone"),
  postureLater: $("postureLater"),
  blinkSheet: $("blinkSheet"),
  blinkDone: $("blinkDone"),
  blinkLater: $("blinkLater"),
  heatIdle: $("heatIdle"),
  heatRun: $("heatRun"),
  heatDone: $("heatDone"),
  heatRing: $("heatRing"),
  heatClock: $("heatClock"),
  heatCaption: $("heatCaption"),
  heatStart: $("heatStart"),
  heatStop: $("heatStop"),
  heatAgain: $("heatAgain"),
  settingsDialog: $("settingsDialog"),
  setSound: $("setSound"),
  setSpeech: $("setSpeech"),
  setVibrate: $("setVibrate"),
  setPractice: $("setPractice"),
  notifyBtn: $("notifyBtn"),
  installBtn: $("installBtn"),
  installNote: $("installNote"),
  installCard: $("installCard"),
  installOpen: $("installOpen"),
  installDismiss: $("installDismiss"),
  installSheet: $("installSheet"),
  installLead: $("installLead"),
  installSteps: $("installSteps"),
  installLater: $("installLater"),
  installNow: $("installNow"),
  settingsClose: $("settingsClose"),
  liveStatus: $("liveStatus"),
  themeColor: $("themeColor"),
};

const settings = {
  sound: true,
  speech: true,
  vibrate: true,
  practice: false,
  onboarded: false,
  installDismissed: false,
};
const stats = { days: {} };
const session = {
  phase: "idle",
  phaseEndsAt: 0,
  duration: 20 * 60 * 1000,
  remain: 20 * 60 * 1000,
  nextBlinkAt: 0,
  nextPostureAt: 0,
  pausedBlinkIn: 0,
  pausedPostureIn: 0,
  resumeAfter: false,
  alarmSilenced: false,
  backgroundId: "",
};
const heat = { phase: "idle", endsAt: 0, duration: 5 * 60 * 1000 };

let view = "now";
let tid = 0;
let deadlineTimer = 0;
let alarmTimer = 0;
let vibeTimer = 0;
let alarmNodes = [];
let alarmHeard = false;
let alarmAudio = null;
let alarmUrl = "";
let silentUrl = "";
let soundGen = 0;
let endArm = 0;
let endTimer = 0;
let audioCtx = null;
let wakeLock = null;
let speakTimer = 0;
let speakGen = 0;
let speakQueue = [];
let toastTimer = 0;
let posturePending = false;
let blinkCounted = false;
let deferredPrompt = null;
let lastStatus = "";
let inertOn = false;
let pushSub = null;
let schedulingFor = "";

function workMs() {
  return settings.practice ? 30000 : 20 * 60 * 1000;
}
function alarmLabel() {
  return settings.practice ? "30秒たちました" : "20分たちました";
}
function blinkEvery() {
  return settings.practice ? 7000 : 4 * 60 * 1000;
}
function postureEvery() {
  return settings.practice ? 16000 : 10 * 60 * 1000;
}
function heatMs() {
  return settings.practice ? 20000 : 5 * 60 * 1000;
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function blankDay() {
  return { look: 0, blink: 0, posture: 0, heat: 0 };
}
function today() {
  return stats.days[dayKey(new Date())] || blankDay();
}
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function loadStore() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    data = {};
  }
  Object.assign(settings, data.settings || {});
  if (data.stats && data.stats.days) stats.days = data.stats.days;
  if (data.session) Object.assign(session, data.session);
  if (data.heat) Object.assign(heat, data.heat);
  const phases = ["idle", "working", "paused", "due", "look", "look-done"];
  if (!phases.includes(session.phase)) session.phase = "idle";
  if (!["idle", "run", "done"].includes(heat.phase)) heat.phase = "idle";
}

function save() {
  const data = {
    settings: { ...settings },
    stats,
    session: { ...session },
    heat: { ...heat },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 容量不足でも画面は動かす */
  }
}

function bump(key) {
  const k = dayKey(new Date());
  if (!stats.days[k]) stats.days[k] = blankDay();
  stats.days[k][key] += 1;
  const cutoff = Date.now() - 40 * 86400000;
  for (const day of Object.keys(stats.days)) {
    const at = new Date(`${day}T00:00:00`).getTime();
    if (at < cutoff) delete stats.days[day];
  }
  save();
}

function paintRing(node, remainRatio) {
  const r = Number(node.getAttribute("r"));
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, remainRatio));
  node.style.strokeDasharray = String(c);
  node.style.strokeDashoffset = String(c * (1 - ratio));
}

function prime() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !audioCtx) audioCtx = new AC();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function wavUrl(samples, rate) {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function ensureAlarmAudio() {
  if (alarmAudio) return alarmAudio;
  alarmAudio = document.createElement("audio");
  alarmAudio.setAttribute("playsinline", "");
  alarmAudio.preload = "auto";
  document.body.appendChild(alarmAudio);
  alarmAudio.addEventListener("ended", () => {
    if (session.phase === "due" && !session.alarmSilenced && settings.sound) {
      alarmAudio.loop = true;
      alarmAudio.play().catch(() => {});
    }
  });
  return alarmAudio;
}

function unlockSound() {
  prime();
  const audio = ensureAlarmAudio();
  if (!silentUrl) silentUrl = wavUrl(new Int16Array(2205), 22050);
  const gen = ++soundGen;
  audio.loop = false;
  audio.src = silentUrl;
  const played = audio.play();
  if (played) {
    played.then(() => {
      if (gen === soundGen) audio.pause();
    }).catch(() => {});
  }
}

function alarmToneUrl() {
  if (alarmUrl) return alarmUrl;
  const rate = 22050;
  const n = Math.floor(rate * 1.56);
  const data = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const step = t % 0.26;
    const freq = Math.floor(t / 0.26) % 2 === 0 ? 880 : 659.25;
    const env = Math.min(1, step / 0.015) * Math.max(0, 1 - Math.max(0, step - 0.02) / 0.22);
    data[i] = Math.sin(2 * Math.PI * freq * t) * env * 26000;
  }
  alarmUrl = wavUrl(data, rate);
  return alarmUrl;
}

function chime(kind) {
  if (!settings.sound || !audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = kind === "end" ? [523.25, 659.25, 783.99] : [587.33, 440];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.11;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.76);
  });
}

function swPost(message) {
  if (!("serviceWorker" in navigator)) return;
  const post = (reg) => {
    const worker = navigator.serviceWorker.controller || reg?.active;
    worker?.postMessage(message);
  };
  if (navigator.serviceWorker.controller) post();
  else navigator.serviceWorker.ready.then(post).catch(() => {});
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
  return alarmDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put({ id: String(id), at }, "current");
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        })
    )
    .catch(() => {});
}

function clearBookmark() {
  return alarmDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").delete("current");
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        })
    )
    .catch(() => {});
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureSubscription() {
  if (!("PushManager" in window) || !("serviceWorker" in navigator) || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;
  if (pushSub) return pushSub;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  pushSub = sub.toJSON();
  return pushSub;
}

async function allowNotify() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* 許可ダイアログが出せなくても計測は始める */
    }
  }
  renderNotify();
  if (Notification.permission === "granted") {
    try {
      await ensureSubscription();
    } catch {
      /* 購読できなくても、開いているあいだは鳴る */
    }
  }
}

function disarmBackground() {
  session.backgroundId = "";
  schedulingFor = "";
  clearBookmark();
  swPost({ type: "disarm" });
}

function scheduleBackgroundAlarm() {
  if (session.phase !== "working") return;
  const id = String(session.phaseEndsAt);
  const at = session.phaseEndsAt;
  writeBookmark(id, at);
  swPost({ type: "bookmark", id, at });
  if (session.backgroundId === id || schedulingFor === id) return;
  schedulingFor = id;
  ensureSubscription()
    .then((sub) => {
      if (!sub || session.phase !== "working" || String(session.phaseEndsAt) !== id) return null;
      return fetch("/api/alarm", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fireAt: at,
          id,
          title: alarmLabel(),
          vibrate: settings.vibrate,
          sound: settings.sound,
          subscription: sub,
        }),
      });
    })
    .then((res) => {
      if (res && res.ok && session.phase === "working" && String(session.phaseEndsAt) === id) {
        session.backgroundId = id;
        save();
      }
    })
    .catch(() => {})
    .finally(() => {
      if (schedulingFor === id) schedulingFor = "";
    });
}

function stopVibeLoop() {
  clearInterval(vibeTimer);
  vibeTimer = 0;
  if (navigator.vibrate) navigator.vibrate(0);
}

function startVibeLoop() {
  if (vibeTimer || session.alarmSilenced || !settings.vibrate || !navigator.vibrate) return;
  const pulse = () => {
    if (session.phase !== "due" || session.alarmSilenced) {
      stopVibeLoop();
      return;
    }
    navigator.vibrate([450, 200, 450, 200, 450]);
  };
  pulse();
  vibeTimer = setInterval(pulse, 1900);
}

function stopAlarm() {
  clearTimeout(alarmTimer);
  alarmTimer = 0;
  stopVibeLoop();
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.loop = false;
  }
  for (const node of alarmNodes) {
    try {
      node.stop();
    } catch {
      /* すでに止まっている */
    }
  }
  alarmNodes = [];
}

function silenceAlarm() {
  session.alarmSilenced = true;
  alarmHeard = true;
  stopAlarm();
  disarmBackground();
  save();
  render();
}

function playAlarmSound() {
  if (!settings.sound) return;
  const audio = ensureAlarmAudio();
  soundGen += 1;
  audio.loop = true;
  audio.src = alarmToneUrl();
  const played = audio.play();
  if (played) {
    played.then(() => {
      alarmHeard = true;
    }).catch(() => startAlarmLoop());
  } else {
    startAlarmLoop();
  }
}

function alarmBurst() {
  if (!settings.sound) return false;
  prime();
  if (!audioCtx || audioCtx.state !== "running") return false;
  const now = audioCtx.currentTime;
  [880, 659.25, 880, 659.25, 880, 659.25].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = now + i * 0.26;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
    alarmNodes.push(osc);
  });
  return true;
}

function startAlarmLoop() {
  if (!settings.sound || session.alarmSilenced || (alarmAudio && !alarmAudio.paused)) return;
  const ring = () => {
    if (session.phase !== "due" || session.alarmSilenced) return;
    alarmBurst();
    alarmTimer = setTimeout(ring, 1700);
  };
  ring();
}

function ringAlarm() {
  if (session.alarmSilenced) return;
  startVibeLoop();
  playAlarmSound();
  ping(alarmLabel(), "ストップを押すまで、音は続きます。", "pinto-alarm");
}

function armClock() {
  clearTimeout(deadlineTimer);
  deadlineTimer = 0;
  if (session.phase !== "working") {
    disarmBackground();
    return;
  }
  const delay = Math.max(0, session.phaseEndsAt - Date.now());
  deadlineTimer = setTimeout(() => {
    if (session.phase === "working") enterDue();
  }, delay);
  swPost({ type: "arm", at: session.phaseEndsAt, title: alarmLabel() });
  scheduleBackgroundAlarm();
}

function hush() {
  clearTimeout(speakTimer);
  speakGen += 1;
  speakQueue = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function japaneseVoice() {
  const voices = speechSynthesis.getVoices();
  const ja = voices.filter((item) => /^ja/i.test(item.lang || ""));
  return ja.find((item) => /kyoko|otoya|nanami|haruka/i.test(item.name)) || ja.find((item) => item.localService) || ja[0] || null;
}

function speakSequence(parts) {
  if (!settings.speech || !("speechSynthesis" in window) || !parts.length) return;
  hush();
  const gen = speakGen;
  speakQueue = parts.slice();
  const next = () => {
    if (gen !== speakGen) return;
    const text = speakQueue.shift();
    if (!text) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ja-JP";
      utter.rate = 0.88;
      utter.pitch = 1;
      const voice = japaneseVoice();
      if (voice) utter.voice = voice;
      let done = false;
      const finish = () => {
        if (done || gen !== speakGen) return;
        done = true;
        clearTimeout(watch);
        speakTimer = setTimeout(next, 220);
      };
      const watch = setTimeout(finish, Math.max(1600, text.length * 320 + 700));
      utter.onend = finish;
      utter.onerror = finish;
      speechSynthesis.speak(utter);
    } catch {
      /* 読み上げ非対応でもタイマーは進める */
    }
  };
  const start = () => {
    if (gen === speakGen) speakTimer = setTimeout(next, 80);
  };
  if (speechSynthesis.getVoices().length) start();
  else speechSynthesis.addEventListener("voiceschanged", start, { once: true });
}

function scheduleLines(parts, delay) {
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => speakSequence(parts), delay);
}

function buzz(pattern) {
  if (!settings.vibrate || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

async function ping(title, body, tag = "pinto") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const alarm = tag === "pinto-alarm";
  const options = {
    body,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag,
    renotify: true,
    lang: "ja",
    silent: false,
    requireInteraction: alarm,
  };
  if (settings.vibrate) options.vibrate = alarm ? [200, 100, 200, 100, 200, 100, 420] : [40, 60, 40];
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* ページ通知へ落とす */
  }
  try {
    new Notification(title, { body, lang: "ja" });
  } catch {
    /* 権限があっても失敗することがある */
  }
}

async function syncWake() {
  const need = session.phase === "look" || heat.phase === "run";
  if (!("wakeLock" in navigator)) return;
  if (need && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  } else if (!need && wakeLock) {
    try {
      await wakeLock.release();
    } catch {
      /* すでに解放済み */
    }
    wakeLock = null;
  }
}

function setInert(on) {
  if (on === inertOn) return;
  inertOn = on;
  const phone = document.querySelector(".phone");
  if (phone) phone.inert = on;
  document.querySelectorAll(".rail").forEach((node) => {
    node.inert = on;
  });
}

function closeTransient() {
  clearTimeout(toastTimer);
  el.toast.hidden = true;
  el.toast.classList.remove("is-on");
  el.postureSheet.hidden = true;
  el.postureSheet.classList.remove("is-on");
  el.blinkSheet.hidden = true;
  el.blinkSheet.classList.remove("is-on");
  el.installSheet.hidden = true;
  el.installSheet.classList.remove("is-on");
  el.backdrop.hidden = true;
  el.backdrop.classList.remove("is-on");
  posturePending = false;
}

function openSheet(sheet) {
  sheet.hidden = false;
  el.backdrop.hidden = false;
  sheet.classList.remove("is-on");
  el.backdrop.classList.remove("is-on");
  void sheet.offsetWidth;
  sheet.classList.add("is-on");
  el.backdrop.classList.add("is-on");
}

function showToast() {
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add("is-on"));
  bump("blink");
  buzz([28, 50, 28]);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove("is-on");
    setTimeout(() => {
      if (!el.toast.classList.contains("is-on")) el.toast.hidden = true;
    }, 400);
  }, 4200);
}

function openBlink() {
  el.postureSheet.classList.remove("is-on");
  el.postureSheet.hidden = true;
  blinkCounted = false;
  openSheet(el.blinkSheet);
  render();
  el.blinkDone.focus();
}

function finishBlink() {
  if (blinkCounted) return;
  blinkCounted = true;
  bump("blink");
  closeTransient();
  render();
}

function openPosture() {
  el.blinkSheet.classList.remove("is-on");
  el.blinkSheet.hidden = true;
  posturePending = false;
  openSheet(el.postureSheet);
  buzz([50, 30, 50]);
  render();
  el.postureDone.focus();
}

function confirmPosture() {
  bump("posture");
  closeTransient();
  render();
}

function startSession() {
  const now = Date.now();
  session.phase = "working";
  session.duration = workMs();
  session.remain = session.duration;
  session.phaseEndsAt = now + session.duration;
  session.nextBlinkAt = now + blinkEvery();
  session.nextPostureAt = now + postureEvery();
  session.resumeAfter = false;
  session.alarmSilenced = false;
  endArm = 0;
  alarmHeard = false;
  stopAlarm();
  unlockSound();
  save();
  ensureTick();
  armClock();
  render();
}

function pauseSession() {
  const now = Date.now();
  session.remain = Math.max(0, session.phaseEndsAt - now);
  session.pausedBlinkIn = Math.max(0, session.nextBlinkAt - now);
  session.pausedPostureIn = Math.max(0, session.nextPostureAt - now);
  session.phase = "paused";
  closeTransient();
  stopAlarm();
  save();
  armClock();
  render();
}

function resumeSession() {
  const now = Date.now();
  session.phase = "working";
  session.phaseEndsAt = now + session.remain;
  session.nextBlinkAt = now + session.pausedBlinkIn;
  session.nextPostureAt = now + session.pausedPostureIn;
  unlockSound();
  save();
  ensureTick();
  armClock();
  render();
}

function endSession() {
  hush();
  stopAlarm();
  alarmHeard = false;
  session.phase = "idle";
  endArm = 0;
  clearTimeout(endTimer);
  closeTransient();
  save();
  armClock();
  syncWake();
  render();
}

function beginLook() {
  if (session.phase === "look") return;
  if (el.settingsDialog.open) el.settingsDialog.close();
  session.resumeAfter = session.phase === "working" || session.phase === "paused" || session.phase === "due";
  hush();
  stopAlarm();
  alarmHeard = false;
  disarmBackground();
  closeTransient();
  session.phase = "look";
  session.duration = LOOK_MS;
  session.phaseEndsAt = Date.now() + LOOK_MS;
  save();
  syncWake();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.lookNum.classList.remove("is-recede");
  void el.lookNum.offsetWidth;
  if (!reduce && (settings.sound || settings.speech)) el.lookNum.classList.add("is-recede");
  if (settings.sound) chime("start");
  if (settings.speech) {
    scheduleLines(
      [
        "画面から、目を離して。",
        "6メートル先を、20秒。",
        "ぼんやりと、見てください。",
        "終わりは、音で知らせます。",
      ],
      settings.sound ? 420 : 0
    );
  }
  buzz([45, 70, 45]);
  ensureTick();
  render();
  el.lookSkip.focus();
}

function enterDue() {
  if (session.phase === "due") return;
  clearTimeout(deadlineTimer);
  deadlineTimer = 0;
  const now = Date.now();
  session.phase = "due";
  session.resumeAfter = true;
  session.nextBlinkAt = Math.max(session.nextBlinkAt, now + blinkEvery());
  session.nextPostureAt = Math.max(session.nextPostureAt, now + postureEvery());
  closeTransient();
  save();
  session.alarmSilenced = false;
  alarmHeard = false;
  ringAlarm();
  render();
}

function completeLook(opts = {}) {
  if (session.phase !== "look") return;
  session.phase = "look-done";
  bump("look");
  if (!opts.quiet) {
    hush();
    if (settings.sound) chime("end");
    if (settings.speech) {
      scheduleLines(["20秒、たちました。", "めを、ほどきました。"], settings.sound ? 360 : 0);
    }
    buzz([20, 40, 20, 40, 80]);
  }
  syncWake();
  save();
  render();
  if (!opts.quiet) el.lookContinue.focus();
}

function skipLook() {
  if (session.phase !== "look") return;
  hush();
  const back = session.resumeAfter;
  session.phase = "idle";
  save();
  syncWake();
  if (back) startSession();
  else render();
}

function startHeat() {
  if (heat.phase === "run") return;
  heat.phase = "run";
  heat.duration = heatMs();
  heat.endsAt = Date.now() + heat.duration;
  save();
  syncWake();
  ensureTick();
  render();
}

function stopHeat() {
  heat.phase = "idle";
  save();
  syncWake();
  render();
}

function completeHeat(opts = {}) {
  if (heat.phase !== "run") return;
  heat.phase = "done";
  bump("heat");
  const busy = session.phase === "look" || session.phase === "look-done";
  if (!opts.quiet && !busy) {
    if (settings.sound) chime("end");
    if (settings.speech) scheduleLines(["5分、たちました。", "温熱ケアは、ここまでです。"], settings.sound ? 360 : 0);
    buzz([20, 40, 80]);
  }
  syncWake();
  save();
  render();
}

function shouldRun() {
  return session.phase === "working" || session.phase === "look" || heat.phase === "run";
}

function tick() {
  const now = Date.now();
  if (session.phase === "working" && now >= session.phaseEndsAt) {
    enterDue();
    return;
  }
  if (session.phase === "look" && now >= session.phaseEndsAt) {
    completeLook();
    return;
  }
  if (heat.phase === "run" && now >= heat.endsAt) {
    completeHeat();
    return;
  }
  if (session.phase === "working" && !sheetOpen()) {
    if (now >= session.nextPostureAt) {
      session.nextPostureAt = now + postureEvery();
      save();
      if (document.hidden) {
        posturePending = true;
        ping("目線まで上げる", "スマホは目の高さ。肘は反対の手で支えてください");
      } else {
        openPosture();
      }
    } else if (now >= session.nextBlinkAt && !el.toast.classList.contains("is-on")) {
      session.nextBlinkAt = now + blinkEvery();
      save();
      if (document.hidden) ping("まばたき", "ゆっくり閉じて、ゆっくり開いてください");
      else showToast();
    }
  }
  render();
}

function sheetOpen() {
  return el.postureSheet.classList.contains("is-on") || el.blinkSheet.classList.contains("is-on");
}

function ensureTick() {
  if (tid) return;
  const loop = () => {
    tick();
    if (shouldRun()) tid = setTimeout(loop, 250);
    else tid = 0;
  };
  tid = setTimeout(loop, 250);
}

function sayStatus(text) {
  if (text === lastStatus) return;
  lastStatus = text;
  el.liveStatus.textContent = text;
}

function renderStats() {
  const t = today();
  setText(el.statLook, String(t.look));
  setText(el.statBlink, String(t.blink));
  setText(el.statPosture, String(t.posture));
  setText(el.statHeat, String(t.heat));
  setText(
    el.todaySentence,
    t.look > 0 ? `今日、毛様体筋を ${t.look} 回ほどきました` : "今日は、まだ目をほどいていません"
  );
  const labels = ["月", "火", "水", "木", "金", "土", "日"];
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const todayKey = dayKey(now);
  let html = "";
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = dayKey(date);
    const count = stats.days[key]?.look || 0;
    const height = count <= 0 ? 0 : Math.min(100, count * 28);
    const cls = key === todayKey ? "is-today" : "";
    html += `<div class="${cls}" title="${labels[i]} ${count}回"><i style="--h:${height}%"><b></b></i><span>${labels[i]}</span></div>`;
  }
  if (el.week.dataset.sig !== html) {
    el.week.dataset.sig = html;
    el.week.innerHTML = html;
  }
}

function renderHero() {
  const now = Date.now();
  let kicker = "20-20-20";
  let time = fmt(workMs());
  let sub = "見たら、6メートル先を20秒";
  let meta = "";
  let ratio = 1;
  let status = "待機中です。画面を見はじめると、20分を数えます。";

  if (session.phase === "working") {
    const remain = Math.max(0, session.phaseEndsAt - now);
    kicker = settings.practice ? "練習 · アラームまで" : "つぎのリセット";
    time = fmt(remain);
    sub = settings.practice ? "30秒で、アラームが鳴ります" : HINTS[Math.floor(now / 8000) % HINTS.length];
    meta = `まばたき ${fmt(session.nextBlinkAt - now)} · 姿勢 ${fmt(session.nextPostureAt - now)}`;
    if (heat.phase === "run") meta = `温熱 ${fmt(heat.endsAt - now)} · ${meta}`;
    ratio = session.duration ? remain / session.duration : 0;
    status = settings.practice
      ? "練習中です。30秒でアラームが鳴ります。"
      : `画面時間を計測中。次のリセットまで約${Math.max(1, Math.ceil(remain / 60000))}分です。`;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      status += " 通知を許可すると、閉じても鳴ります。";
    } else {
      status += " アプリを閉じても、時間が来たら通知します。";
    }
  } else if (session.phase === "paused") {
    kicker = "一時停止";
    time = fmt(session.remain);
    sub = "カウントは止まっています";
    ratio = session.duration ? session.remain / session.duration : 0;
    status = "一時停止中です。";
  } else if (session.phase === "due") {
    const ringing = !session.alarmSilenced;
    kicker = alarmLabel();
    time = "20";
    sub = ringing ? "ストップを押すまで、鳴ります" : "スタートを押すと、はじまります";
    ratio = 1;
    status = ringing
      ? `${alarmLabel()}。ストップを押すまで、音と振動は続きます。`
      : `${alarmLabel()}。スタートを押すと、6メートル先を20秒見ます。`;
  } else if (settings.practice) {
    kicker = "練習";
    sub = "30秒で、アラームが鳴ります";
    time = fmt(workMs());
    status = "練習です。スタートすると30秒でアラームが鳴ります。";
  }

  setText(el.heroKicker, kicker);
  setText(el.heroTime, time);
  setText(el.heroSub, sub);
  el.metaLine.hidden = !meta;
  if (meta) setText(el.metaLine, meta);
  paintRing(el.ringProgress, ratio);
  el.hero.classList.toggle("is-due", session.phase === "due");
  el.hero.classList.toggle("is-paused", session.phase === "paused");
  el.hero.classList.toggle("is-idle", session.phase === "idle");

  const showStart = session.phase === "idle" || session.phase === "due";
  const ringing = session.phase === "due" && !session.alarmSilenced;
  el.stopAlarmBtn.hidden = !ringing;
  el.startBtn.hidden = !showStart;
  el.runActions.hidden = session.phase !== "working" && session.phase !== "paused";
  el.quickRow.hidden = session.phase === "due";
  setText(
    el.startBtn,
    session.phase === "due" ? "スタート" : settings.practice ? "30秒ではじめる" : "画面を見はじめる"
  );
  setText(el.pauseBtn, session.phase === "paused" ? "つづける" : "一時停止");
  setText(el.endBtn, Date.now() < endArm ? "本当に終わる" : "終わる");

  if (session.phase === "look") status = "いまは画面を見ず、6メートル先を20秒見てください。";
  if (session.phase === "look-done") status = "20秒終わりました。毛様体筋がゆるみました。";
  sayStatus(status);
}

function renderLook() {
  const on = session.phase === "look" || session.phase === "look-done";
  el.look.classList.toggle("is-on", on);
  el.look.setAttribute("aria-hidden", on ? "false" : "true");
  document.body.classList.toggle("is-look", on);
  el.themeColor.setAttribute("content", on ? "#120E0B" : "#F4EEE4");
  el.lookRunning.hidden = session.phase !== "look";
  el.lookDone.hidden = session.phase !== "look-done";
  if (session.phase === "look") {
    const remain = Math.max(0, session.phaseEndsAt - Date.now());
    const sec = Math.max(0, Math.ceil(remain / 1000 - 1e-9));
    setText(el.lookNum, String(sec));
    paintRing(el.lookProgress, session.duration ? remain / session.duration : 0);
    const quiet = settings.sound || settings.speech;
    el.look.classList.toggle("is-quiet", quiet);
    setText(
      el.lookHint,
      quiet
        ? "終わりは、音で知らせます。\n画面は見ないでください。"
        : "数字が 0 になるまで、\nぼんやり見てください。"
    );
  } else {
    el.look.classList.remove("is-quiet");
  }
}

function renderHeat() {
  el.heatIdle.hidden = heat.phase !== "idle";
  el.heatRun.hidden = heat.phase !== "run";
  el.heatDone.hidden = heat.phase !== "done";
  setText(el.heatStart, settings.practice ? "練習：20秒であたためる" : "5分であたためる");
  if (heat.phase === "run") {
    const remain = Math.max(0, heat.endsAt - Date.now());
    const elapsed = Math.max(0, heat.duration - remain);
    const p = heat.duration ? (elapsed / heat.duration) * 100 : 0;
    el.heatRing.style.setProperty("--p", p.toFixed(2));
    setText(el.heatClock, fmt(remain));
    setText(el.heatCaption, HEAT_LINES[Math.floor(elapsed / 15000) % HEAT_LINES.length]);
  }
}

function renderChrome() {
  el.practicePill.hidden = !settings.practice;
  const looking = session.phase === "look" || session.phase === "look-done";
  const showMini = view !== "now" && session.phase !== "idle" && !looking;
  el.miniBar.hidden = !showMini;
  if (showMini) {
    if (session.phase === "due") {
      setText(el.miniLabel, alarmLabel());
      setText(el.miniTime, "スタート");
    } else if (session.phase === "paused") {
      setText(el.miniLabel, "一時停止");
      setText(el.miniTime, fmt(session.remain));
    } else {
      setText(el.miniLabel, "つぎのリセット");
      setText(el.miniTime, fmt(session.phaseEndsAt - Date.now()));
    }
  }
  let title = "ピント — 20分ごとに、目をほどく";
  if (session.phase === "working") title = `${fmt(session.phaseEndsAt - Date.now())} · ピント`;
  else if (session.phase === "due") title = `${alarmLabel()} · ピント`;
  else if (session.phase === "look") title = "画面を見ない · ピント";
  else if (session.phase === "paused") title = "一時停止 · ピント";
  else if (session.phase === "look-done") title = "ほどけた · ピント";
  if (document.title !== title) document.title = title;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function deviceKind() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const inApp = /Line\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|MicroMessenger|Snapchat/i.test(ua) || /; wv\)/.test(ua);
  const iosOther = ios && /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//.test(ua);
  return { ios, android, inApp, iosOther };
}

function setSteps(items) {
  el.installSteps.replaceChildren();
  for (const [n, text] of items) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = n;
    li.append(span, document.createTextNode(text));
    el.installSteps.append(li);
  }
}

function wantsInstallBar() {
  if (!settings.onboarded || settings.installDismissed || isStandalone()) return false;
  const narrow = window.matchMedia("(max-width: 979px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const { ios, android } = deviceKind();
  return narrow || coarse || ios || android;
}

function renderInstall() {
  const installed = isStandalone();
  el.installCard.hidden = !wantsInstallBar();
  el.installBtn.hidden = installed;
  if (installed) {
    setText(el.installNote, "ホーム画面から開いています。記録はこの端末の中だけに残ります。");
    return;
  }
  setText(el.installBtn, deferredPrompt ? "アプリとして追加" : "ホーム画面に追加");
  setText(
    el.installNote,
    "ホーム画面に追加すると、アプリとして開き、ほかの画面にいても20分の合図が届きやすくなります。記録はこの端末の中だけに残ります。"
  );
}

function fillInstallGuide() {
  const { ios, android, inApp, iosOther } = deviceKind();
  el.installNow.hidden = true;
  el.installSteps.hidden = false;
  if (inApp || iosOther) {
    setText(el.installLead, "この画面では追加できません。下のリンクをコピーし、Safariで開いてからホーム画面に追加してください。");
    el.installSteps.hidden = true;
    setSteps([]);
    el.installNow.hidden = false;
    el.installNow.dataset.action = "copy";
    setText(el.installNow, "リンクをコピー");
    return;
  }
  if (ios) {
    setText(el.installLead, "Safariの共有から、ホーム画面に追加します。追加したアイコンから開くと、アプリとして動きます。");
    setSteps([
      ["01", "画面下の共有ボタン（四角から上向きの矢印）をタップ"],
      ["02", "「ホーム画面に追加」を選ぶ"],
      ["03", "右上の「追加」をタップ"],
    ]);
    return;
  }
  if (deferredPrompt) {
    setText(el.installLead, "この端末のアプリとして追加します。ホーム画面のアイコンから開けます。");
    el.installSteps.hidden = true;
    setSteps([]);
    el.installNow.hidden = false;
    el.installNow.dataset.action = "prompt";
    setText(el.installNow, "追加する");
    return;
  }
  setText(
    el.installLead,
    android
      ? "ブラウザのメニューから、アプリとして追加できます。"
      : "ブラウザのメニューから、インストールできます。"
  );
  setSteps(
    android
      ? [
          ["01", "右上のメニュー（︙）を開く"],
          ["02", "「アプリをインストール」または「ホーム画面に追加」を選ぶ"],
          ["03", "「インストール」をタップ"],
        ]
      : [
          ["01", "アドレスバー右のインストールアイコン、またはメニューを開く"],
          ["02", "「ピントをインストール」を選ぶ"],
        ]
  );
}

async function offerInstall() {
  if (el.settingsDialog.open) el.settingsDialog.close();
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome === "accepted") settings.installDismissed = true;
      save();
      renderInstall();
      return;
    } catch {
      deferredPrompt = null;
    }
  }
  fillInstallGuide();
  openSheet(el.installSheet);
  render();
  (el.installNow.hidden ? el.installLater : el.installNow).focus();
}

function renderNotify() {
  if (!("Notification" in window)) {
    setText(el.notifyBtn, "このブラウザは通知に対応していません");
    el.notifyBtn.disabled = true;
    return;
  }
  el.notifyBtn.disabled = Notification.permission === "granted";
  if (Notification.permission === "granted") setText(el.notifyBtn, "通知はオン");
  else if (Notification.permission === "denied") setText(el.notifyBtn, "通知がブロックされています");
  else setText(el.notifyBtn, "通知を許可する");
}

function render() {
  renderHero();
  renderLook();
  renderHeat();
  renderStats();
  renderChrome();
  renderInstall();
  const sheetOn =
    el.postureSheet.classList.contains("is-on") ||
    el.blinkSheet.classList.contains("is-on") ||
    el.installSheet.classList.contains("is-on");
  const lookOn = session.phase === "look" || session.phase === "look-done";
  setInert(sheetOn || lookOn || !settings.onboarded);
}

function showView(name) {
  view = name;
  el.viewNow.classList.toggle("is-on", name === "now");
  el.viewHeat.classList.toggle("is-on", name === "heat");
  el.viewScience.classList.toggle("is-on", name === "science");
  el.navNow.classList.toggle("is-on", name === "now");
  el.navHeat.classList.toggle("is-on", name === "heat");
  el.navScience.classList.toggle("is-on", name === "science");
  for (const [button, on] of [
    [el.navNow, name === "now"],
    [el.navHeat, name === "heat"],
    [el.navScience, name === "science"],
  ]) {
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  render();
}

function syncIntro() {
  const on = !settings.onboarded;
  el.intro.classList.toggle("is-on", on);
  el.intro.setAttribute("aria-hidden", on ? "false" : "true");
  if (!on) document.documentElement.classList.remove("need-intro");
}

function syncSettingsForm() {
  el.setSound.checked = settings.sound;
  el.setSpeech.checked = settings.speech;
  el.setVibrate.checked = settings.vibrate;
  el.setPractice.checked = settings.practice;
  renderNotify();
}

function bindSettings(input, key) {
  input.addEventListener("change", () => {
    settings[key] = input.checked;
    save();
    render();
  });
}

function reconcile() {
  const now = Date.now();
  if (session.phase === "working" && session.phaseEndsAt <= now) enterDue();
  else if (session.phase === "due" && !session.alarmSilenced) ringAlarm();
  if (session.phase === "look" && session.phaseEndsAt <= now) completeLook({ quiet: true });
  if (heat.phase === "run" && heat.endsAt <= now) completeHeat({ quiet: true });
}

function onVisible() {
  if (document.hidden) return;
  if (session.phase === "working" && Date.now() >= session.phaseEndsAt) enterDue();
  else if (session.phase === "due" && !session.alarmSilenced) {
    if (!alarmAudio || alarmAudio.paused) playAlarmSound();
    startVibeLoop();
  }
  if (posturePending && session.phase === "working") openPosture();
  if (session.phase === "look" || heat.phase === "run") syncWake();
  tick();
  if (shouldRun()) ensureTick();
}

function bind() {
  el.introBtn.addEventListener("click", () => {
    prime();
    settings.onboarded = true;
    save();
    syncIntro();
    render();
  });
  el.settingsBtn.addEventListener("click", () => {
    syncSettingsForm();
    el.settingsDialog.showModal();
  });
  el.settingsClose.addEventListener("click", () => el.settingsDialog.close());
  bindSettings(el.setSound, "sound");
  bindSettings(el.setSpeech, "speech");
  bindSettings(el.setVibrate, "vibrate");
  el.setPractice.addEventListener("change", () => {
    settings.practice = el.setPractice.checked;
    if (session.phase === "working") {
      const span = workMs();
      session.duration = span;
      session.remain = span;
      session.phaseEndsAt = Date.now() + span;
      armClock();
    } else if (session.phase === "paused") {
      session.duration = workMs();
      session.remain = workMs();
    }
    save();
    render();
  });
  el.notifyBtn.addEventListener("click", async () => {
    prime();
    await allowNotify();
    if (session.phase === "working") scheduleBackgroundAlarm();
  });
  el.installBtn.addEventListener("click", () => {
    prime();
    offerInstall();
  });
  el.installOpen.addEventListener("click", () => {
    prime();
    offerInstall();
  });
  el.installDismiss.addEventListener("click", () => {
    settings.installDismissed = true;
    save();
    renderInstall();
  });
  el.installLater.addEventListener("click", () => {
    closeTransient();
    render();
  });
  el.installNow.addEventListener("click", async () => {
    if (el.installNow.dataset.action === "copy") {
      const url = `${location.origin}${location.pathname}`;
      try {
        await navigator.clipboard.writeText(url);
        setText(el.installNow, "コピーしました");
      } catch {
        setText(el.installLead, url);
      }
      return;
    }
    if (el.installNow.dataset.action === "prompt") {
      closeTransient();
      await offerInstall();
      return;
    }
    closeTransient();
    render();
  });
  document.querySelectorAll(".nav button").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  el.miniBar.addEventListener("click", () => showView("now"));
  el.stopAlarmBtn.addEventListener("click", () => {
    prime();
    silenceAlarm();
  });
  el.startBtn.addEventListener("click", async () => {
    prime();
    if (session.phase === "due") {
      beginLook();
      return;
    }
    await allowNotify();
    startSession();
  });
  el.pauseBtn.addEventListener("click", () => {
    prime();
    if (session.phase === "paused") resumeSession();
    else pauseSession();
  });
  el.endBtn.addEventListener("click", () => {
    prime();
    if (endArm && Date.now() <= endArm) {
      clearTimeout(endTimer);
      endSession();
      return;
    }
    endArm = Date.now() + 4000;
    render();
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      endArm = 0;
      render();
    }, 4000);
  });
  el.quickLook.addEventListener("click", () => {
    prime();
    beginLook();
  });
  el.quickBlink.addEventListener("click", () => {
    prime();
    openBlink();
  });
  el.quickPosture.addEventListener("click", () => {
    prime();
    openPosture();
  });
  el.lookSkip.addEventListener("click", () => {
    prime();
    skipLook();
  });
  el.lookContinue.addEventListener("click", () => {
    prime();
    hush();
    startSession();
  });
  el.lookFinish.addEventListener("click", () => {
    hush();
    session.phase = "idle";
    save();
    syncWake();
    render();
  });
  el.toast.addEventListener("click", () => {
    el.toast.classList.remove("is-on");
    el.toast.hidden = true;
  });
  el.blinkDone.addEventListener("click", finishBlink);
  el.blinkLater.addEventListener("click", () => {
    closeTransient();
    render();
  });
  el.postureDone.addEventListener("click", confirmPosture);
  el.postureLater.addEventListener("click", () => {
    closeTransient();
    render();
  });
  el.backdrop.addEventListener("click", () => {
    closeTransient();
    render();
  });
  el.heatStart.addEventListener("click", () => {
    prime();
    startHeat();
  });
  el.heatStop.addEventListener("click", stopHeat);
  el.heatAgain.addEventListener("click", () => {
    heat.phase = "idle";
    save();
    render();
  });
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("pagehide", () => {
    if (session.phase !== "working") return;
    swPost({ type: "arm", at: session.phaseEndsAt, title: alarmLabel() });
    scheduleBackgroundAlarm();
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "due") {
        if (session.phase === "working") enterDue();
        else if (session.phase === "due" && !session.alarmSilenced) ringAlarm();
      }
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    renderInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    settings.installDismissed = true;
    save();
    closeTransient();
    render();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", render);
  window.matchMedia("(max-width: 979px)").addEventListener("change", render);
}

loadStore();
bind();
syncIntro();
reconcile();
render();
syncWake();
if (shouldRun()) ensureTick();
if (session.phase === "working") armClock();
if ("serviceWorker" in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    location.reload();
  });
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(() => {
    if (session.phase === "working") armClock();
  }).catch(() => {});
}
