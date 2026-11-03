// 画面の切り替えと起動処理。
"use strict";

import * as store from "./store.js";
import * as audio from "./audio.js";
import * as tts from "./tts.js";
import { toast } from "./ui.js";
import { startReminder } from "./notify.js";

import * as home from "./screens/home.js";
import * as cards from "./screens/cards.js";
import * as list from "./screens/list.js";
import * as readaloud from "./screens/readaloud.js";
import * as quiz from "./screens/quiz.js";
import * as stats from "./screens/stats.js";
import * as settings from "./screens/settings.js";
import * as profiles from "./screens/profiles.js";

const ROUTES = {
  home:       { title: "英単語・熟語", tab: "home", mod: home },
  wordlist:   { title: "単語", tab: "wordlist", mod: list, params: { kind: "word" } },
  phraselist: { title: "熟語", tab: "phraselist", mod: list, params: { kind: "phrase" } },
  words:      { title: "単語の学習", tab: "wordlist", mod: cards, params: { kind: "word" }, back: "wordlist" },
  phrases:    { title: "熟語の学習", tab: "phraselist", mod: cards, params: { kind: "phrase" }, back: "phraselist" },
  readaloud:  { title: "音読", tab: "readaloud", mod: readaloud },
  quiz:       { title: "小テスト", tab: "stats", mod: quiz, back: "stats" },
  stats:      { title: "統計", tab: "stats", mod: stats },
  settings:   { title: "設定", mod: settings, back: "home" },
  profiles:   { title: "プロフィール", mod: profiles, back: "home" },
};

const TABS = [
  { route: "home", icon: "🏠", label: "ホーム" },
  { route: "wordlist", icon: "📖", label: "単語" },
  { route: "phraselist", icon: "🔗", label: "熟語" },
  { route: "readaloud", icon: "🎧", label: "音読" },
  { route: "stats", icon: "📊", label: "統計" },
];

let current = null;
let history = [];
let appEl, headerEl, tabbarEl;

function go(name, params) {
  const route = ROUTES[name];
  if (!route) return;
  if (current && ROUTES[current] && ROUTES[current].mod.onLeave) {
    ROUTES[current].mod.onLeave();
  }
  audio.stop();
  if (current && current !== name) history.push(current);
  current = name;
  paint(params);
  window.scrollTo(0, 0);
}

function back() {
  const route = ROUTES[current];
  const prev = history.pop();
  const target = prev || (route && route.back) || "home";
  if (route && route.mod.onLeave) route.mod.onLeave();
  audio.stop();
  current = target;
  paint();
  window.scrollTo(0, 0);
}

function paint(params) {
  const route = ROUTES[current];
  const showBack = current !== "home" && !TABS.some((t) => t.route === current);

  headerEl.innerHTML = `
    ${showBack ? `<button class="hbtn" id="backBtn" aria-label="戻る">‹</button>` : ""}
    <h1>${route.title}</h1>
    <button class="hbtn" id="gearBtn" aria-label="設定">⚙</button>`;
  const backBtn = headerEl.querySelector("#backBtn");
  if (backBtn) backBtn.onclick = back;
  headerEl.querySelector("#gearBtn").onclick = () => go("settings");

  const mount = document.getElementById("screen");
  mount.innerHTML = "";
  route.mod.render(mount, { ...(route.params || {}), ...(params || {}) }, go, () => paint(params));

  tabbarEl.innerHTML = TABS.map((t) => `
    <button data-tab="${t.route}" class="${route.tab === t.route ? "on" : ""}"
            aria-label="${t.label}" aria-current="${route.tab === t.route ? "page" : "false"}">
      <span class="ico" aria-hidden="true">${t.icon}</span><span>${t.label}</span>
    </button>`).join("");
  tabbarEl.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => { history = []; go(b.dataset.tab); };
  });
}

async function boot() {
  appEl = document.getElementById("app");
  headerEl = document.getElementById("header");
  tabbarEl = document.getElementById("tabbar");

  try {
    await store.init();
  } catch (e) {
    document.getElementById("screen").innerHTML =
      `<div class="warn">単語データ(vocab_seed.json)を読み込めませんでした。<br>${e.message}</div>`;
    return;
  }

  audio.useSettings(store.state.settings);
  await audio.init();          // 同梱音声の一覧(manifest)を読む

  tts.loadVoices().then(() => {
    if (current === "settings") paint();
  });

  go("home");
  startReminder();

  // ホーム画面に戻ったときは最新の状態で描き直す
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && current === "home") paint();
    if (document.hidden) audio.stop();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* オフライン対応なしで動く */ });
  }
}

window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
});

boot();
