const CACHE = "eitango-v8";
// 音声は別のキャッシュに入れる。本体のキャッシュ名が変わっても消さないため(8.7MBの再取得を避ける)。
const AUDIO_CACHE = "eitango-audio-v1";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js", "./js/srs.js", "./js/store.js", "./js/tts.js", "./js/audio.js", "./js/audiocache.js",
  "./js/ui.js", "./js/notify.js",
  "./audio/manifest.json",
  "./js/screens/home.js", "./js/screens/cards.js", "./js/screens/list.js",
  "./js/screens/readaloud.js", "./js/screens/quiz.js", "./js/screens/stats.js",
  "./js/screens/settings.js", "./js/screens/audiopanel.js", "./js/screens/profiles.js",
  "./vocab_seed.json",
  "./icon-180.png", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ページ本体・スクリプト・単語データはネットワーク優先(更新を確実に反映)。
// オフラインのときだけキャッシュを使う。アイコンなどはキャッシュ優先。
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const networkFirst =
    e.request.mode === "navigate" ||
    /\.(js|css|json|webmanifest)$/.test(url.pathname);

  if (networkFirst) {
    // no-cache を付けてブラウザのHTTPキャッシュを必ず検証させる。
    // これをしないと、配信側を更新しても端末に古い版が残り続ける。
    e.respondWith(
      fetch(e.request, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => {
            // アプリ本体のページだけ ./index.html の1件に寄せる(?v=1 のような版を溜めない)。
            // test.html など別のページまで寄せると、index.html を上書きしてしまう。
            const isAppPage = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
            c.put(e.request.mode === "navigate" && isAppPage ? "./index.html" : e.request, copy);
          });
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined)))
    );
    return;
  }

  // 例文の mp3 は audiocache.js が AUDIO_CACHE に入れる。
  // ここで本体のキャッシュにも入れると二重に持つことになるので、保存しない。
  const isClip = url.pathname.includes("/audio/") && url.pathname.endsWith(".mp3");

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (!isClip && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
