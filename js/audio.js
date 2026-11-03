// 熟語の例文を鳴らす層(SPEC §4.5.1)。
// 同梱の mp3 を優先し、音声が無い文(ユーザーが追加した例文など)だけ端末の読み上げに回す。
"use strict";

import * as tts from "./tts.js";

const MANIFEST_URL = "./audio/manifest.json";
const BASE = "./audio/";

let clips = null;          // { p001: { text, normal, slow }, ... }
let manifestError = null;
let element = null;        // iOS 対策で 1つの Audio 要素を使い回す
let generation = 0;        // 止めたときに古い ended を無視するための世代番号

// 速度 → ファイルの種類(SPEC §4.5.1)。playbackRate は使わない。
export function variantForRate(rate) {
  return tts.normalizeRate(rate) === 1 ? "normal" : "slow";
}

export async function init() {
  if (clips) return clips;
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    clips = data.clips || {};
  } catch (e) {
    manifestError = e;
    clips = {};            // 音声なしとして動かす(読み上げにフォールバック)
  }
  return clips;
}

export function hasClip(phraseId) {
  return !!(clips && clips[phraseId]);
}

// manifest の中身。URL の組み立て(audiocache.js)で使う。
export function allClips() { return clips || {}; }

export function clipCount() {
  return clips ? Object.keys(clips).length : 0;
}

export function manifestFailed() {
  return !!manifestError;
}

// 1文ぶんの音声URL。無ければ null。
export function urlFor(phraseId, rate) {
  const clip = clips && clips[phraseId];
  if (!clip) return null;
  const name = clip[variantForRate(rate)];
  return name ? BASE + name : null;
}

function audioElement() {
  if (!element) {
    element = new Audio();
    element.preload = "auto";
  }
  return element;
}

export function stop() {
  generation += 1;
  tts.stop();
  if (!element) return;
  try {
    element.pause();
    element.currentTime = 0;
  } catch (e) { /* まだ読み込んでいないときは何もしない */ }
}

// 例文を鳴らす。
// 返り値: { ms, cancelled, usedTts, error }
//   ms は実際にかかった時間。リピートの無音(再生時間+1秒)に使う。
export function play(phrase, rate) {
  const url = urlFor(phrase.id, rate);
  if (!url) return speakFallback(phrase, rate);

  stop();
  const myGen = generation;
  const el = audioElement();
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ms: Date.now() - startedAt, cancelled: myGen !== generation, usedTts: false, ...payload });
    };
    const onEnded = () => finish({});
    const onError = () => {
      cleanup();
      if (settled) return;
      settled = true;
      // ファイルが取れないときは読み上げに回す(キャッシュ漏れ・取得失敗)
      speakFallback(phrase, rate).then((r) => resolve({ ...r, recovered: true }));
    };
    function cleanup() {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    }
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    el.src = url;
    el.playbackRate = 1;         // 速度はファイルで切り替えるので等倍で鳴らす
    const started = el.play();
    if (started && started.catch) started.catch(() => onError());
  });
}

function speakFallback(phrase, rate) {
  const text = phrase.example || phrase.en || "";
  return tts.speak(text, {
    lang: ttsLang(),
    rate: tts.normalizeRate(rate),
    voiceId: ttsVoice(),
  }).then((r) => ({ ...r, usedTts: true }));
}

// 設定は store が持っているが、循環参照を避けるため呼び出し側から渡せるようにする
let settingsRef = { ttsLang: "en-US", ttsVoiceId: null };
export function useSettings(settings) {
  settingsRef = settings || settingsRef;
}
function ttsLang() { return settingsRef.ttsLang || "en-US"; }
function ttsVoice() { return settingsRef.ttsVoiceId || null; }

// 中断できる待ち時間(リピートの無音など)。stop() で打ち切られる。
export function wait(ms) {
  const myGen = generation;
  return new Promise((resolve) => {
    const step = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (myGen !== generation) { clearInterval(timer); resolve({ cancelled: true }); return; }
      elapsed += step;
      if (elapsed >= ms) { clearInterval(timer); resolve({ cancelled: false }); }
    }, step);
  });
}
