// 音声データのダウンロードの表示と操作(SPEC §4.5.1)。
// ホームのカードと設定の行で同じものを使う。進み具合は画面を描き直さずその場で更新する。
"use strict";

import * as audio from "../audio.js";
import * as audiocache from "../audiocache.js";
import { confirmDialog, toast } from "../ui.js";

let job = null;                 // 実行中のダウンロード
let latest = null;              // { done, total, failed }
const listeners = new Set();

function urls() {
  return audiocache.allUrls(audio.allClips());
}

export function running() {
  return !!job && !job.cancelled;
}

export async function state() {
  const list = urls();
  if (!list.length) return { done: 0, total: 0, complete: true, running: false };
  const st = latest || await audiocache.status(list);
  return { ...st, complete: st.done >= st.total, running: running() };
}

// ---- 表示 ----

export function cardHtml(st) {
  if (!st.total) return "";
  if (st.complete && !st.running) return "";
  if (st.running) return progressHtml(st);
  return `
    <div class="card card-pad" id="audio-card">
      <div class="name" style="font-weight:600">音声データ</div>
      <p class="note" style="margin:.3rem 0 .8rem">
        例文の音声 約${audiocache.approxMb(st.total)}MB(${st.total}ファイル)。
        <strong>Wi-Fi につないでからダウンロードしてください。</strong><br>
        ダウンロードしなくても、音読セットを開いた分だけ少しずつ取得されます。
      </p>
      ${st.done ? `<div class="bar" style="margin-bottom:.6rem"><span style="width:${(st.done / st.total) * 100}%"></span></div>
        <p class="note" style="margin:0 0 .8rem">${st.done} / ${st.total} 取得済み</p>` : ""}
      <button class="btn" data-audio-dl>${st.done ? "続きをダウンロード" : "ダウンロード"}</button>
    </div>`;
}

function progressHtml(st) {
  const pct = st.total ? (st.done / st.total) * 100 : 0;
  return `
    <div class="card card-pad" id="audio-card">
      <div class="name" style="font-weight:600">音声をダウンロード中</div>
      <div class="bar" style="margin:.6rem 0"><span id="audio-bar" style="width:${pct}%"></span></div>
      <p class="note" id="audio-count" style="margin:0 0 .8rem">${st.done} / ${st.total}</p>
      <button class="btn secondary" data-audio-cancel>中止</button>
      <p class="note">閉じても大丈夫です。次に開いたとき続きから再開します。</p>
    </div>`;
}

export function rowsHtml(st) {
  const label = !st.total ? "音声データがありません"
    : st.complete ? `${st.total} / ${st.total} ・ 約${audiocache.approxMb(st.total)}MB`
    : `${st.done} / ${st.total} 取得済み`;
  return `
    <div class="row">
      <span class="grow"><span class="name">音声データ</span><span class="desc">${label}</span></span>
    </div>
    ${st.complete || st.running ? "" : `<div class="row"><button class="btn secondary" data-audio-dl>まとめてダウンロード</button></div>`}
    ${st.running ? `<div class="row"><button class="btn secondary" data-audio-cancel>ダウンロードを中止</button></div>` : ""}
    ${st.done ? `<div class="row"><button class="btn danger" data-audio-clear>音声データを削除</button></div>` : ""}`;
}

// ---- 操作 ----

export function wire(root, rerender) {
  const dl = root.querySelector("[data-audio-dl]");
  if (dl) dl.onclick = () => start(rerender);

  const cancel = root.querySelector("[data-audio-cancel]");
  if (cancel) cancel.onclick = () => {
    if (job) job.cancelled = true;
    toast("中止しました。次に開いたとき続きから再開します");
  };

  const clear = root.querySelector("[data-audio-clear]");
  if (clear) clear.onclick = async () => {
    const yes = await confirmDialog({
      title: "音声データを削除しますか？",
      message: "例文の音声が端末から消えます。学習の進捗は消えません。",
      okLabel: "削除", danger: true,
    });
    if (!yes) return;
    await audiocache.clear();
    latest = null;
    toast("削除しました");
    rerender();
  };

  listeners.add(rerender);
}

export function unwire(rerender) {
  listeners.delete(rerender);
}

async function start(rerender) {
  if (running()) return;

  // 回線の種類が分かる端末でだけ注意する。分からない端末では出さない。
  const warning = audiocache.connectionWarning(audiocache.currentConnection());
  if (warning) {
    const yes = await confirmDialog({
      title: "ダウンロードを始めますか？",
      message: `${warning}約${audiocache.approxMb(urls().length)}MB をダウンロードします。Wi-Fi でのダウンロードをおすすめします。`,
      okLabel: "続ける",
    });
    if (!yes) return;
  }

  job = audiocache.newJob();
  latest = null;
  rerender();

  const result = await audiocache.download(urls(), (p) => {
    latest = p;
    updateInPlace(p);
  }, job);

  const wasCancelled = job.cancelled;
  job = null;
  latest = { done: result.done, total: result.total, failed: result.failed };
  for (const fn of listeners) fn();

  if (wasCancelled) return;
  if (result.failed) toast(`${result.done} / ${result.total} 取得。${result.failed} 件は再生時に取りに行きます`);
  else toast("音声のダウンロードが終わりました");
}

// 画面を描き直さず、数字とバーだけ更新する
function updateInPlace(p) {
  const bar = document.getElementById("audio-bar");
  const count = document.getElementById("audio-count");
  if (bar) bar.style.width = `${(p.done / p.total) * 100}%`;
  if (count) count.textContent = `${p.done} / ${p.total}`;
}
