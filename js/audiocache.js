// 同梱音声のダウンロードとキャッシュ(SPEC §4.5.1)。
// 自動では1バイトも落とさない。まとめてダウンロードはユーザーがボタンを押したときだけ、
// 音読セットを開いたときはそのセットのぶんだけ取る。
//
// アプリ本体とは別のキャッシュに入れる。コードを更新して本体のキャッシュ名が変わっても、
// 8.7MB の音声を消さずに残すため。
"use strict";

export const AUDIO_CACHE = "eitango-audio-v1";
const CHUNK = 20;              // 一度に取る件数

export function supported() {
  return typeof caches !== "undefined";
}

// ---- URL の組み立て(純粋) ----

// 全曲(normal + slow)のURL。clips は manifest.json の中身。
export function allUrls(clips) {
  const urls = [];
  for (const id of Object.keys(clips || {})) {
    const clip = clips[id];
    for (const variant of ["normal", "slow"]) {
      if (clip[variant]) urls.push("./audio/" + clip[variant]);
    }
  }
  return urls;
}

// 音読セット1つぶんのURL(10文 × normal/slow = 20件)
export function urlsForSet(phrases, clips) {
  const urls = [];
  for (const p of phrases) {
    const clip = clips && clips[p.id];
    if (!clip) continue;
    for (const variant of ["normal", "slow"]) {
      if (clip[variant]) urls.push("./audio/" + clip[variant]);
    }
  }
  return urls;
}

// ---- 通信環境の確認(純粋) ----

// モバイル回線やデータセーバーのときに出す注意文。
// 判定できない端末(iOS Safari など)では null を返す。できない判定を、できるように見せない。
export function connectionWarning(connection) {
  if (!connection) return null;
  if (connection.saveData) return "データセーバーがオンになっています。";
  if (connection.type === "cellular") return "モバイル通信で接続しているようです。";
  return null;
}

export function currentConnection() {
  return (typeof navigator !== "undefined" &&
    (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) || null;
}

// ---- キャッシュの読み書き ----

function pathOf(url) {
  try { return new URL(url, location.href).pathname; }
  catch (e) { return url; }
}

async function cachedPaths() {
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  return new Set(keys.map((req) => new URL(req.url).pathname));
}

// 何件そろっているか
export async function status(urls) {
  if (!supported() || !urls.length) return { done: 0, total: urls.length, complete: !urls.length };
  const have = await cachedPaths();
  const done = urls.filter((u) => have.has(pathOf(u))).length;
  return { done, total: urls.length, complete: done >= urls.length };
}

export function newJob() {
  return { cancelled: false };
}

// urls をまとめて取る。取得済みは飛ばすので、途中で止めても次に続きから進む。
export async function download(urls, onProgress, job = newJob()) {
  if (!supported()) return { done: 0, total: urls.length, failed: urls.length, cancelled: false };

  const cache = await caches.open(AUDIO_CACHE);
  const have = await cachedPaths();
  const todo = urls.filter((u) => !have.has(pathOf(u)));

  let done = urls.length - todo.length;
  let failed = 0;
  const report = () => onProgress && onProgress({ done, total: urls.length, failed });
  report();

  for (let i = 0; i < todo.length; i += CHUNK) {
    if (job.cancelled) break;
    const batch = todo.slice(i, i + CHUNK);
    await Promise.all(batch.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        await cache.put(url, res);
        done += 1;
      } catch (e) {
        failed += 1;      // 失敗した分は再生時に取りに行く
      }
    }));
    report();
  }

  return { done, total: urls.length, failed, cancelled: job.cancelled };
}

// 音読セットを開いたときに、そのセットぶんだけ静かに取る(失敗は無視)
export async function prefetchSet(phrases, clips) {
  if (!supported()) return;
  const urls = urlsForSet(phrases, clips);
  if (!urls.length) return;
  try { await download(urls, null); } catch (e) { /* 取れなくても再生時に取りに行く */ }
}

export async function clear() {
  if (!supported()) return false;
  return caches.delete(AUDIO_CACHE);
}

// おおよその容量(件数 × 平均11KB)。表示用。
export function approxMb(count) {
  return (count * 11.2 / 1024).toFixed(1);
}
