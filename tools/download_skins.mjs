#!/usr/bin/env node
/* ========== 一次性下载 ByMykel 全部箱图 + 物品图到本地 ==========
 *
 * 使用：
 *   1. 确保 Node.js ≥ 18（内置 fetch）
 *   2. 终端开代理（科学上网），让 Node 能访问 raw.githubusercontent.com
 *   3. cd 到项目根目录后执行：
 *        node tools/download_skins.mjs
 *
 * 结果：assets/skins/crates/*.png + assets/skins/items/*.png
 * 中断可重跑：已存在文件自动跳过
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const CRATES_URL  = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json';
const DATA_DIR    = path.join(ROOT, 'assets', 'data');
const CACHE_JSON  = path.join(DATA_DIR, 'crates.json');
const CACHE_JS    = path.join(DATA_DIR, 'crates.js');
const CRATES_DIR  = path.join(ROOT, 'assets', 'skins', 'crates');
const ITEMS_DIR   = path.join(ROOT, 'assets', 'skins', 'items');
const CONCURRENCY = 10;
const MAX_RETRY   = 3;

async function ensureDirs() {
  await fs.mkdir(DATA_DIR,   { recursive: true });
  await fs.mkdir(CRATES_DIR, { recursive: true });
  await fs.mkdir(ITEMS_DIR,  { recursive: true });
}

async function loadCrates() {
  let txt;
  try {
    txt = await fs.readFile(CACHE_JSON, 'utf8');
    console.log(`[json] use cache ${CACHE_JSON}`);
  } catch {
    console.log('[json] fetching crates.json ...');
    const resp = await fetch(CRATES_URL);
    if (!resp.ok) throw new Error('crates.json 拉取失败 ' + resp.status);
    txt = await resp.text();
    await fs.writeFile(CACHE_JSON, txt, 'utf8');
    console.log(`[json] saved to ${CACHE_JSON}`);
  }
  // 同时写一份 JS 包装版，<script> 直接加载，避开 file:// 下 fetch 本地资源被禁
  const jsWrap = `/* 由 tools/download_skins.mjs 生成 */\nwindow.__CSGO_CRATES__ = ${txt};\n`;
  await fs.writeFile(CACHE_JS, jsWrap, 'utf8');
  console.log(`[json] wrote ${CACHE_JS}`);
  return JSON.parse(txt);
}

function basenameFromUrl(url) {
  return url.split('/').pop().split('?')[0];
}

/* 与 js/data.js 的 hashUrl 完全一致，确保两端文件名匹配 */
function hashUrl(url) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < url.length; i++) {
    h ^= BigInt(url.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

function collectTargets(crates) {
  const targets = new Map();
  function add(url, dir, kind) {
    if (!url) return;
    const oldFile = path.join(dir, basenameFromUrl(url));
    const newFile = path.join(dir, hashUrl(url) + '.png');
    targets.set(url, { url, oldFile, file: newFile, kind });
  }
  for (const c of crates) {
    if (!c || !Array.isArray(c.contains)) continue;
    if (c.image) add(c.image, CRATES_DIR, 'crate');
    for (const s of c.contains) if (s && s.image) add(s.image, ITEMS_DIR, 'item');
    if (Array.isArray(c.contains_rare))
      for (const s of c.contains_rare) if (s && s.image) add(s.image, ITEMS_DIR, 'item');
  }
  return [...targets.values()];
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function downloadOne(target, idx, total) {
  // 新文件已存在：跳过
  if (await fileExists(target.file)) {
    return { ok: true, skipped: true, size: 0 };
  }
  // 旧 basename 文件存在（老脚本下载的长文件名）：重命名为新 hash 名，免重新下载
  if (target.oldFile && target.oldFile !== target.file && await fileExists(target.oldFile)) {
    try {
      await fs.rename(target.oldFile, target.file);
      return { ok: true, skipped: true, size: 0, renamed: true };
    } catch (e) { /* 失败就走下载流程 */ }
  }
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const resp = await fetch(target.url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buf = Buffer.from(await resp.arrayBuffer());
      await fs.writeFile(target.file, buf);
      if (idx % 50 === 0 || idx === total) {
        console.log(`[${idx}/${total}] ${target.kind} ${path.basename(target.file)} (${(buf.length/1024).toFixed(1)}KB)`);
      }
      return { ok: true, skipped: false, size: buf.length };
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRY) {
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  }
  console.error(`[${idx}/${total}] FAIL ${target.url} -> ${lastErr.message}`);
  return { ok: false, skipped: false, size: 0, url: target.url, err: lastErr.message };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx + 1, items.length);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function main() {
  await ensureDirs();
  const crates = await loadCrates();
  console.log(`[json] crates total ${crates.length}`);

  const targets = collectTargets(crates);
  console.log(`[targets] unique images ${targets.length}`);
  console.log(`[targets] crates dir ${CRATES_DIR}`);
  console.log(`[targets] items  dir ${ITEMS_DIR}`);
  console.log(`[run] concurrency=${CONCURRENCY} retry=${MAX_RETRY}`);

  const t0 = Date.now();
  const results = await runPool(targets, downloadOne);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  let okNew = 0, okSkip = 0, okRen = 0, fail = 0, bytes = 0;
  const fails = [];
  for (const r of results) {
    if (!r) { fail++; continue; }
    if (r.ok && r.renamed) okRen++;
    else if (r.ok && r.skipped) okSkip++;
    else if (r.ok) { okNew++; bytes += r.size; }
    else { fail++; fails.push(r); }
  }
  console.log('');
  console.log('========== 汇总 ==========');
  console.log(`成功(新下载) ${okNew}`);
  console.log(`成功(已存在) ${okSkip}`);
  console.log(`成功(旧文件重命名) ${okRen}`);
  console.log(`失败          ${fail}`);
  console.log(`下载总量      ${(bytes/1024/1024).toFixed(2)} MB`);
  console.log(`耗时          ${elapsed} s`);
  if (fails.length) {
    console.log('--- 失败列表（前 20 条） ---');
    for (const f of fails.slice(0, 20)) console.log(f.err, f.url);
    console.log('（可重跑此脚本，已存在文件会自动跳过）');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
