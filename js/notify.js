// リマインド通知。
// ブラウザのアプリ(PWA)は閉じている間に通知を出せないため、
// 「アプリを開いている間、設定時刻を過ぎていて今日の学習が残っていれば1回通知する」方式にしている。
"use strict";

import { selectSession } from "./srs.js";
import * as store from "./store.js";

let notifiedOn = null;
let timer = null;

export function supported() {
  return typeof Notification !== "undefined";
}

export function notifyState() {
  if (!supported()) return { canAsk: false, label: "この端末では通知が使えません" };
  if (Notification.permission === "granted") return { canAsk: false, label: "通知は許可されています" };
  if (Notification.permission === "denied") return { canAsk: false, label: "通知はブロックされています(ブラウザの設定で変更できます)" };
  return { canAsk: true, label: "通知は未許可です" };
}

export async function requestNotifyPermission() {
  if (!supported()) return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch (e) {
    return false;
  }
}

function remainingToday() {
  const today = store.today();
  const w = selectSession({
    items: store.state.words, progress: store.state.progress, today,
    newPerDay: store.state.settings.newPerDay,
  });
  const p = selectSession({
    items: store.state.phrases, progress: store.state.progress, today,
    newPerDay: store.state.settings.newPhrasesPerDay,
  });
  return w.reviews.length + w.news.length + p.reviews.length + p.news.length;
}

function check() {
  if (!supported() || Notification.permission !== "granted") return;
  const today = store.today();
  if (notifiedOn === today) return;

  const [h, m] = (store.state.settings.notifyTime || "20:00").split(":").map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;

  const left = remainingToday();
  if (left <= 0) { notifiedOn = today; return; }

  notifiedOn = today;
  try {
    new Notification("英単語の学習", {
      body: `今日の分が ${left} 語のこっています。`,
      icon: "./icon-192.png",
      tag: "eitango-daily",
    });
  } catch (e) { /* 通知が出せない環境では何もしない */ }
}

export function startReminder() {
  if (timer) clearInterval(timer);
  check();
  timer = setInterval(check, 60000);
}
