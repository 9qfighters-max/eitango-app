// 端末内のデータ(進捗・設定・履歴)の読み書きと、シードデータの取り込み。
// 保存先は localStorage のみ。アカウント・サーバーは使わない(SPEC §7)。
//
// 進捗・設定・追加語は**プロフィールごと**に持つ(SPEC §4.10)。
// 単語・熟語のデータ本体は家族で共通。
"use strict";

import { toDateStr, newProgress, grade, isGraduated, retention, streak } from "./srs.js";
import { normalizeRate, DEFAULT_RATE } from "./tts.js";

const KEY = "eitango-app-v1";
const SEED_URL = "./vocab_seed.json";

export const MAX_PROFILES = 5;
export const PROFILE_COLORS = ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff2d55"];

export const DEFAULT_SETTINGS = {
  newPerDay: 30,          // 1日の新規単語数(10〜50)
  newPhrasesPerDay: 10,   // 1日の新規熟語数(5〜20)
  notifyTime: "20:00",
  ttsLang: "en-US",
  ttsRate: DEFAULT_RATE,
  ttsVoiceId: null,
  examDate: null,
};

function emptyBucket() {
  return {
    progress: {},     // itemId -> Progress
    readAloud: {},    // phraseId -> { listen, repeat, shadowing, recite }
    userItems: [],    // UserItem[]
    settings: { ...DEFAULT_SETTINGS },
    history: {},      // "YYYY-MM-DD" -> { words, phrases }
    quizzes: [],      // { date, correct, total }
  };
}

// 保存される部分。seed(words/phrases)は毎回 JSON から読む。
const saved = {
  format: 2,              // 保存形式の版(1 = プロフィール導入前)
  seedVersion: 0,
  profiles: [],           // [{ id, name, color, createdAt }]
  currentProfileId: null,
  byProfile: {},          // profileId -> bucket
};

function bucket() {
  const id = saved.currentProfileId;
  if (!id || !saved.byProfile[id]) {
    // 万一プロフィールが無ければ作る(データを失わないための保険)
    const p = createProfile("本人");
    saved.currentProfileId = p.id;
  }
  return saved.byProfile[saved.currentProfileId];
}

export const state = {
  seedVersion: 0,
  words: [],        // シード + 今のプロフィールの追加語
  phrases: [],
  seedWordCount: 0,
  seedPhraseCount: 0,
  seedWords: [],
  seedPhrases: [],
  get progress() { return bucket().progress; },
  get readAloud() { return bucket().readAloud; },
  get settings() { return bucket().settings; },
  get history() { return bucket().history; },
  get quizzes() { return bucket().quizzes; },
  get userItems() { return bucket().userItems; },
  get profiles() { return saved.profiles; },
  get currentProfileId() { return saved.currentProfileId; },
};

export function today() {
  return toDateStr(new Date());
}

// ---- 永続化 ----

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
  if (!raw) { ensureProfile(); return; }

  let data = null;
  try { data = JSON.parse(raw); }
  catch (e) {
    console.warn("保存データを読めませんでした。初期状態で起動します。", e);
    ensureProfile();
    return;
  }

  if (data.format === 2 && data.profiles) {
    saved.seedVersion = data.seedVersion || 0;
    saved.profiles = data.profiles;
    saved.currentProfileId = data.currentProfileId;
    saved.byProfile = {};
    for (const p of saved.profiles) {
      saved.byProfile[p.id] = { ...emptyBucket(), ...(data.byProfile?.[p.id] || {}) };
      normalizeBucket(saved.byProfile[p.id]);
    }
  } else {
    migrateFromSingleUser(data);
  }
  ensureProfile();
}

// プロフィール導入前の形(進捗が1人分だけ)を「本人」プロフィールへ移す
export function migrateFromSingleUser(data) {
  saved.seedVersion = data.seedVersion || 0;
  saved.profiles = [];
  saved.byProfile = {};
  const profile = createProfile("本人");
  saved.currentProfileId = profile.id;
  const b = saved.byProfile[profile.id];
  b.progress = data.progress || {};
  b.readAloud = data.readAloud || {};
  b.userItems = data.userItems || [];
  b.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  b.history = data.history || {};
  b.quizzes = data.quizzes || [];
  normalizeBucket(b);
  return saved;
}

function normalizeBucket(b) {
  b.settings = { ...DEFAULT_SETTINGS, ...(b.settings || {}) };
  b.settings.ttsRate = normalizeRate(b.settings.ttsRate);
}

function ensureProfile() {
  if (!saved.profiles.length) {
    const p = createProfile("本人");
    saved.currentProfileId = p.id;
  }
  if (!saved.currentProfileId || !saved.byProfile[saved.currentProfileId]) {
    saved.currentProfileId = saved.profiles[0].id;
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn("保存に失敗しました(容量不足の可能性)", e);
  }
}

// ---- プロフィール(SPEC §4.10) ----

function newProfileId() {
  return "pf" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createProfile(name, color) {
  const used = saved.profiles.map((p) => p.color);
  const profile = {
    id: newProfileId(),
    name: name || "新しい人",
    color: color || PROFILE_COLORS.find((c) => !used.includes(c)) || PROFILE_COLORS[0],
    createdAt: new Date().toISOString(),
  };
  saved.profiles.push(profile);
  saved.byProfile[profile.id] = emptyBucket();
  return profile;
}

export function currentProfile() {
  return saved.profiles.find((p) => p.id === saved.currentProfileId) || saved.profiles[0];
}

export function addProfile(name, color) {
  if (saved.profiles.length >= MAX_PROFILES) return null;
  const p = createProfile(name, color);
  save();
  return p;
}

export function renameProfile(id, name, color) {
  const p = saved.profiles.find((x) => x.id === id);
  if (!p) return false;
  if (name) p.name = name;
  if (color) p.color = color;
  save();
  return true;
}

export function removeProfile(id) {
  if (saved.profiles.length <= 1) return false;     // 最後の1人は消せない
  saved.profiles = saved.profiles.filter((p) => p.id !== id);
  delete saved.byProfile[id];
  if (saved.currentProfileId === id) saved.currentProfileId = saved.profiles[0].id;
  save();
  rebuildItems();
  return true;
}

export function switchProfile(id) {
  if (!saved.byProfile[id]) return false;
  saved.currentProfileId = id;
  save();
  rebuildItems();     // 追加語はプロフィールごとなので一覧を作り直す
  return true;
}

// ---- シードの取り込み(SPEC §6) ----
// 進捗は itemId で持つので、version が上がって語が増えても進捗は消えない。

export async function init() {
  load();
  const res = await fetch(SEED_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`vocab_seed.json を読めません (${res.status})`);
  const seed = await res.json();

  state.seedVersion = seed.version;
  state.seedWordCount = seed.words.length;
  state.seedPhraseCount = seed.phrases.length;
  state.seedWords = seed.words.map(normWord);
  state.seedPhrases = seed.phrases.map(normPhrase);
  rebuildItems();

  if (saved.seedVersion !== seed.version) {
    saved.seedVersion = seed.version;
  }
  save();
  return state;
}

// 今のプロフィールの追加語を足して、単語・熟語の一覧を作り直す
function rebuildItems() {
  const items = saved.currentProfileId ? bucket().userItems : [];
  const userWords = items.filter((u) => u.kind === "word").map(normWord);
  const userPhrases = items.filter((u) => u.kind === "phrase").map(normPhrase);
  state.words = dedupeById([...state.seedWords, ...userWords]);
  state.phrases = dedupeById([...state.seedPhrases, ...userPhrases]);
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function normWord(w) {
  return {
    id: w.id,
    order: w.order ?? 9999,
    en: w.en,
    pos: w.pos || "",
    ja: w.ja,
    meanings: w.meanings || [],
    antonyms: w.antonyms || [],
    derived: w.derived || [],
    tier: w.tier || "B",
    day: w.day ?? 0,
    source: w.source || "seed",
  };
}

function normPhrase(p) {
  return {
    id: p.id,
    order: p.order ?? 9999,
    en: p.en,
    ja: p.ja,
    example: p.example || "",
    tier: p.tier || "B",
    readAloudSet: p.readAloudSet ?? 0,
    readAloudOrder: p.readAloudOrder ?? 9999,
    category: p.category || "",
    source: p.source || "seed",
  };
}

// ---- 取得系 ----

export function itemById(id) {
  return state.words.find((w) => w.id === id) || state.phrases.find((p) => p.id === id) || null;
}

export function kindOf(id) {
  return state.phrases.some((p) => p.id === id) ? "phrase" : "word";
}

export function progressOf(id) {
  return bucket().progress[id] || null;
}

export function progressList(kind) {
  const items = kind === "phrase" ? state.phrases : state.words;
  const progress = bucket().progress;
  return items.map((i) => progress[i.id]).filter(Boolean);
}

// ---- 更新系 ----

// 新規語をセッションに出すときに進捗を作る(1日の新規数の数えどころ)
export function introduce(id) {
  const progress = bucket().progress;
  if (progress[id]) return progress[id];
  progress[id] = newProgress(id, today());
  save();
  return progress[id];
}

// 自己採点を保存し、学習履歴にも1件足す
export function gradeItem(id, result) {
  const d = today();
  const b = bucket();
  const current = b.progress[id] || newProgress(id, d);
  b.progress[id] = grade(current, result, d);

  const kind = kindOf(id) === "phrase" ? "phrases" : "words";
  if (!b.history[d]) b.history[d] = { words: 0, phrases: 0 };
  b.history[d][kind] += 1;

  save();
  return b.progress[id];
}

export function setReadAloud(phraseId, mode, done) {
  const ra = bucket().readAloud;
  const cur = ra[phraseId] || { listen: false, repeat: false, shadowing: false, recite: false };
  cur[mode] = !!done;
  ra[phraseId] = cur;
  save();
}

export function readAloudOf(phraseId) {
  return bucket().readAloud[phraseId] || { listen: false, repeat: false, shadowing: false, recite: false };
}

export function updateSettings(patch) {
  Object.assign(bucket().settings, patch);
  save();
}

export function addQuizResult(correct, total) {
  bucket().quizzes.push({ date: today(), correct, total });
  save();
}

// ---- ユーザー追加語(SPEC §4.2) ----

export function addUserItem({ kind, en, ja, example, tier, pos }) {
  const items = bucket().userItems;
  const n = items.length + 1;
  const id = `u${String(n).padStart(3, "0")}`;
  const item = {
    id, kind, en: en.trim(), ja: ja.trim(), source: "user",
    tier: tier || "B",
    order: 10000 + n,
  };
  if (kind === "word") {
    item.pos = pos || "";
    item.meanings = []; item.antonyms = []; item.derived = []; item.day = 0;
  } else {
    item.example = (example || "").trim();
    item.readAloudSet = 0; item.readAloudOrder = 10000 + n; item.category = "追加";
  }
  items.push(item);
  save();
  rebuildItems();
  return item;
}

export function removeUserItem(id) {
  const b = bucket();
  b.userItems = b.userItems.filter((u) => u.id !== id);
  delete b.progress[id];
  delete b.readAloud[id];
  save();
  rebuildItems();
}

// ---- 統計 ----

export function studiedDates() {
  const history = bucket().history;
  return Object.keys(history).filter((d) => {
    const h = history[d];
    return (h.words || 0) + (h.phrases || 0) > 0;
  });
}

// 一度でも出した語の数(学習計画の「残り」を出すのに使う)
export function introducedCount(kind) {
  const items = kind === "phrase" ? state.phrases : state.words;
  const progress = bucket().progress;
  return items.filter((i) => progress[i.id]).length;
}

export function stats() {
  const d = today();
  const progress = bucket().progress;
  const wordProg = progressList("word");
  const phraseProg = progressList("phrase");
  const byTier = {};
  for (const tier of ["A", "B", "C"]) {
    const items = [...state.words, ...state.phrases].filter((i) => i.tier === tier);
    const done = items.filter((i) => isGraduated(progress[i.id])).length;
    const started = items.filter((i) => progress[i.id]).length;   // 一度でも出した語
    byTier[tier] = {
      total: items.length, done, started,
      rate: items.length ? done / items.length : 0,
      startedRate: items.length ? started / items.length : 0,
    };
  }
  return {
    streak: streak(studiedDates(), d),
    wordRetention: retention(wordProg, state.words.length),
    phraseRetention: retention(phraseProg, state.phrases.length),
    byTier,
    daysToExam: bucket().settings.examDate ? daysUntil(bucket().settings.examDate, d) : null,
  };
}

function daysUntil(target, from) {
  const ms = new Date(target + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

// 弱点リスト = 直近の自己採点が △ だった語
export function weakList() {
  return Object.values(bucket().progress)
    .filter((p) => p.lastResult === "unsure")
    .map((p) => ({ progress: p, item: itemById(p.itemId) }))
    .filter((x) => x.item)
    .sort((a, b) => (a.progress.updatedAt < b.progress.updatedAt ? 1 : -1));
}

// ---- バックアップ(SPEC §4.9) ----
// プロフィール単位で書き出す。

export function exportData() {
  const p = currentProfile();
  return JSON.stringify({
    app: "eitango-app",
    format: 2,
    exportedAt: new Date().toISOString(),
    seedVersion: saved.seedVersion,
    profile: { name: p.name, color: p.color },
    ...bucket(),
  }, null, 2);
}

// 今のプロフィールに読み込む(他のプロフィールには触らない)
export function importData(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== "object" || !data.progress) {
    throw new Error("このファイルは英単語アプリのバックアップではないようです");
  }
  const b = bucket();
  b.progress = data.progress || {};
  b.readAloud = data.readAloud || {};
  b.userItems = data.userItems || [];
  b.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  b.history = data.history || {};
  b.quizzes = data.quizzes || [];
  normalizeBucket(b);
  if (data.seedVersion) saved.seedVersion = data.seedVersion;
  save();
  rebuildItems();
}

// 今のプロフィールのデータだけを消す
export function resetAll() {
  saved.byProfile[saved.currentProfileId] = emptyBucket();
  save();
  rebuildItems();
}
