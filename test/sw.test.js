// Service Worker の先読みリスト(sw.js の ASSETS)のテスト。
// index.html から import をたどって、アプリが必要とするファイルを割り出し、
// 先読みリストに漏れが無いか確かめる。
// (1つでも漏れるとオフラインでアプリが起動しなくなる。実際に踏んだ)
import { makeSuite } from "./helper.js";

const ROOT = new URL("../", import.meta.url);
// ブラウザのHTTPキャッシュで古いファイルを見ると、漏れを見逃すので必ず取り直す
const NO_CACHE = { cache: "no-store" };

function resolve(path, base) {
  return new URL(path, base).pathname;
}

async function collectModules() {
  const html = await (await fetch(new URL("index.html", ROOT), NO_CACHE)).text();
  const entries = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

  const seen = new Set();
  const queue = entries.map((e) => resolve(e, ROOT));

  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    let code = "";
    try { code = await (await fetch(path, NO_CACHE)).text(); } catch (e) { continue; }
    const specs = [
      ...code.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      queue.push(resolve(spec, new URL(path, location.origin)));
    }
  }
  return seen;
}

async function swAssets() {
  const code = await (await fetch(new URL("sw.js", ROOT), NO_CACHE)).text();
  const block = code.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!block) return null;
  return new Set(
    [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => resolve(m[1], ROOT))
  );
}

export async function run() {
  const { results, test, eq } = makeSuite();
  const [modules, assets] = await Promise.all([collectModules(), swAssets()]);

  test("sw.js から先読みリストを読める", () => {
    eq(assets !== null, true);
  });

  // 追跡に失敗すると「0件中0件そろっている」で素通りしてしまうので、まず拾えているか見る
  test("アプリのモジュールを追跡できている", () => {
    eq(modules.size >= 10, true, `追跡できたモジュール ${modules.size} 件`);
    eq([...modules].some((m) => m.endsWith("/js/app.js")), true, "app.js");
  });

  test("アプリが読み込む JS がすべて先読みリストに入っている", () => {
    const missing = [...modules].filter((m) => !assets.has(m)).sort();
    eq(missing, [], "先読みリストへの入れ忘れ");
  });

  test("先読みリストのファイルがすべて存在する", async () => {
    // 同期テストなので、存在確認は下の非同期テストで行う
    eq(assets.size > 0, true);
  });

  const broken = [];
  for (const path of assets) {
    if (path.endsWith("/")) continue;
    try {
      const res = await fetch(path, NO_CACHE);
      if (!res.ok) broken.push(`${path} → ${res.status}`);
    } catch (e) { broken.push(`${path} → ${e.message}`); }
  }
  test("先読みリストに実在しないファイルが無い", () => {
    eq(broken, [], "存在しないファイル");
  });

  test("CSS と単語データも先読みに入っている", () => {
    eq(assets.has(resolve("./css/style.css", ROOT)), true, "style.css");
    eq(assets.has(resolve("./vocab_seed.json", ROOT)), true, "vocab_seed.json");
    eq(assets.has(resolve("./audio/manifest.json", ROOT)), true, "audio/manifest.json");
  });

  return results;
}
