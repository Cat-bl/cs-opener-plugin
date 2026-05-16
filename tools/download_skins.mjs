#!/usr/bin/env node
/* CLI 入口：增量下载 ByMykel 全部箱图 + 物品图
 *
 *   node tools/download_skins.mjs              # 增量
 *   node tools/download_skins.mjs --refresh    # 强制重拉 crates.json
 *
 * 结果：assets/skins/{crates,items}/*.png
 * 中断可重跑，已存在文件自动跳过。
 *
 * 在 QQ 中也可用 `#csgo 更新数据`（仅主人可执行）触发同一流程。
 */

import { downloadAll } from '../model/downloader.js'

const forceRemote = process.argv.includes('--refresh')

let lastBytes = 0
const t0 = Date.now()

const summary = await downloadAll({
  forceRemote,
  onLog: msg => console.log(msg),
  onProgress: p => {
    const speed = ((p.bytes - lastBytes) / 1024).toFixed(0)
    lastBytes = p.bytes
    process.stdout.write(
      `\r[${p.done}/${p.total}] ${p.percent}% | 新增 ${p.okNew} · 已存 ${p.okSkip} · 失败 ${p.fail} · ${(p.bytes/1024/1024).toFixed(1)}MB (+${speed}KB/s) `
    )
  },
})

console.log('\n\n========== 汇总 ==========')
console.log(`新增下载  ${summary.okNew}`)
console.log(`已存跳过  ${summary.okSkip}`)
console.log(`旧名重命名 ${summary.okRen}`)
console.log(`失败      ${summary.fail}`)
console.log(`下载总量  ${(summary.bytes/1024/1024).toFixed(2)} MB`)
console.log(`耗时      ${(summary.elapsedMs/1000).toFixed(1)} s`)
if (summary.fails.length) {
  console.log('--- 失败列表（前 10 条） ---')
  for (const f of summary.fails.slice(0, 10)) console.log(' ', f.err, f.url)
  console.log('（可重跑此脚本，已存在文件会跳过）')
}
process.exit(summary.fail ? 1 : 0)
