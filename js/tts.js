// 読み上げ(TTS)のラッパー。端末の音声合成(Web Speech API)を使う。
// 単語カードの発音ボタンと音読モードは、どちらもこのラッパー経由で鳴らす(SPEC §4.5)。
"use strict";

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

let voiceCache = [];
let voicesLoaded = false;
let generation = 0;        // 再生を止めたときに古い onend を無視するための世代番号

// 音読の速度(SPEC §4.5)。0.6倍は音が不自然なので採用しない。
// 画面ごとに配列を書くと片方だけ直す事故が起きるため、ここだけに置く。
export const RATES = [0.8, 1.0];
export const DEFAULT_RATE = 0.8;

// 保存されている速度を、使える値に丸める。
// 以前の版の 0.6 が残っている端末があるので、読み込み時に必ず通す。
export function normalizeRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RATE;
  if (RATES.includes(n)) return n;
  let best = DEFAULT_RATE;
  let diff = Infinity;
  for (const r of RATES) {
    const d = Math.abs(r - n);
    if (d < diff) { diff = d; best = r; }
  }
  return best;
}

export function isSupported() {
  return !!synth && typeof SpeechSynthesisUtterance !== "undefined";
}

// 端末の音声一覧は非同期に埋まるので、voiceschanged を待つ。
export function loadVoices(timeoutMs = 2000) {
  if (!isSupported()) return Promise.resolve([]);
  if (voicesLoaded && voiceCache.length) return Promise.resolve(voiceCache);

  return new Promise((resolve) => {
    const pick = () => {
      const all = synth.getVoices() || [];
      if (all.length) {
        voiceCache = all.filter((v) => /^en(-|_|$)/i.test(v.lang));
        voicesLoaded = true;
        cleanup();
        resolve(voiceCache);
      }
    };
    const onChanged = () => pick();
    const timer = setTimeout(() => {
      voicesLoaded = true;
      cleanup();
      resolve(voiceCache);
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", onChanged);
    }
    synth.addEventListener("voiceschanged", onChanged);
    pick();
  });
}

export function englishVoices() {
  return voiceCache;
}

// 設定で音声を指定していればそれを使う。
// 指定が無いときは voice を設定せず lang だけ渡して、端末の既定の音声に任せる。
// (一覧の先頭を選ぶと、macOS の "Albert" のような効果音系の声を拾ってしまうため)
function resolveVoice(lang, voiceId) {
  if (!voiceCache.length) return null;
  if (voiceId) {
    const exact = voiceCache.find((v) => v.voiceURI === voiceId);
    if (exact) return exact;
  }
  const preferred = voiceCache.find((v) => v.default && v.lang.replace("_", "-") === lang);
  return preferred || null;
}

// 設定画面の一覧用。既定の音声を先頭に、同じ言語のものを優先して並べる。
export function voicesForPicker(lang) {
  const score = (v) => {
    const l = v.lang.replace("_", "-");
    return (v.default ? 0 : 1) + (l === lang ? 0 : 2) + (l.slice(0, 2) === lang.slice(0, 2) ? 0 : 4);
  };
  return [...voiceCache].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

export function hasVoiceFor(lang) {
  if (!voiceCache.length) return false;
  const base = lang.slice(0, 2).toLowerCase();
  return voiceCache.some((v) => v.lang.slice(0, 2).toLowerCase() === base);
}

export function stop() {
  generation += 1;
  if (!isSupported()) return;
  try {
    if (synth.paused) synth.resume();   // 一時停止のまま cancel すると残ることがある
    synth.cancel();
  } catch (e) { /* 読み上げが使えない環境では何もしない */ }
}

// 1文を読み上げる。
// 返り値: { cancelled, ms, error }  ms は実際にかかった時間(リピートの無音に使う)
export function speak(text, { lang = "en-US", rate = 0.8, voiceId = null } = {}) {
  if (!isSupported() || !text) {
    return Promise.resolve({ cancelled: true, ms: 0, error: "unsupported" });
  }
  stop();                       // 前の読み上げを必ず止める(音を重ねない: 受け入れ基準6)
  const myGen = generation;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({ ms: Date.now() - startedAt, cancelled: false, ...payload });
    };

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const voice = resolveVoice(lang, voiceId);
    if (voice) u.voice = voice;

    u.onend = () => finish({ cancelled: myGen !== generation });
    u.onerror = (ev) => finish({
      cancelled: myGen !== generation,
      error: (ev && ev.error) || "error",
    });

    // 端末によっては onend が来ないことがあるため、長さから概算した上限で打ち切る
    const estimate = Math.max(3000, (text.length / Math.max(rate, 0.1)) * 220);
    const watchdog = setTimeout(() => finish({ cancelled: myGen !== generation, error: "timeout" }), estimate);

    try {
      synth.speak(u);
    } catch (e) {
      finish({ error: "speak-failed" });
    }
  });
}

// 中断できる待ち時間(リピートモードの無音など)
export function wait(ms) {
  const myGen = generation;
  return new Promise((resolve) => {
    const step = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (myGen !== generation) {       // stop() されたら待つのをやめる
        clearInterval(timer);
        resolve({ cancelled: true });
        return;
      }
      elapsed += step;
      if (elapsed >= ms) {
        clearInterval(timer);
        resolve({ cancelled: false });
      }
    }, step);
  });
}

export function currentGeneration() {
  return generation;
}
