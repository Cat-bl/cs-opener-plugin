/* 管理员命令（仅主人 e.isMaster）
 *
 *   #csgo 更新数据         触发增量下载（后台执行 + 节流进度回执，完成自动 reload）
 *   #csgo 更新数据 强制     强制重拉 crates.json 再下载
 *   #csgo 状态              查看当前下载任务状态
 */

import plugin from '../../../lib/plugins/plugin.js'
import { downloadAll } from '../model/downloader.js'
import { reloadCases } from '../model/data.js'

const log = globalThis.logger || { mark: (...a) => console.log(...a) }

let running = null   // { startAt, lastReport, e }

export class CsgoAdmin extends plugin {
  constructor() {
    super({
      name: 'CSGO管理',
      dsc: 'CS:GO 资源更新与维护（主人）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#csgo\\s*更新数据(\\s+强制)?$', fnc: 'updateData' },
        { reg: '^#csgo\\s*状态$',                 fnc: 'status' },
      ],
    })
  }

  async updateData(e) {
    if (!e.isMaster) { await e.reply('仅主人可用'); return true }
    if (running) {
      await e.reply(`已有下载任务在跑（开始于 ${Math.round((Date.now()-running.startAt)/1000)} 秒前），用 #csgo 状态 查看`)
      return true
    }
    const force = /强制/.test(e.msg)
    await e.reply(`开始增量下载箱图/物品图${force ? '（强制重拉 crates.json）' : ''}。约 5–60 分钟（看网速/代理），完成后会通知您。期间可发 #csgo 状态 查进度。`)

    running = { startAt: Date.now(), lastReport: Date.now(), latest: null, e }
    downloadAll({
      forceRemote: force,
      concurrency: 10,
      onLog: msg => log.mark?.(`[csgo-opener] ${msg}`),
      onProgress: p => {
        running.latest = p
        // 每 60s 主动向命令发起者推一次（避免刷屏；用户也能用 #csgo 状态 主动拉）
        if (Date.now() - running.lastReport >= 60_000) {
          running.lastReport = Date.now()
          e.reply(`进度: ${p.done}/${p.total} (${p.percent}%) · 新增 ${p.okNew} · 已存 ${p.okSkip} · 失败 ${p.fail} · 已下 ${(p.bytes/1024/1024).toFixed(1)}MB`)
            .catch(() => {})
        }
      },
    }).then(async sum => {
      const sec = (sum.elapsedMs / 1000).toFixed(1)
      let reloadMsg = ''
      try {
        const n = await reloadCases()
        reloadMsg = `已自动加载新数据，当前 ${n} 个箱子可用`
      } catch (err) {
        reloadMsg = `自动加载失败: ${err?.message || err}（重启 Yunzai 可恢复）`
      }
      await e.reply(
        `✅ 下载完成（耗时 ${sec}s）\n` +
        `· 新增 ${sum.okNew}\n` +
        `· 已存 ${sum.okSkip}\n` +
        `· 重命名 ${sum.okRen}\n` +
        `· 失败 ${sum.fail}\n` +
        `· 总量 ${(sum.bytes/1024/1024).toFixed(2)} MB\n\n` +
        reloadMsg + (sum.fail ? `\n（${sum.fail} 张失败，可再次 #csgo 更新数据 重试）` : '')
      )
    }).catch(err => {
      e.reply(`❌ 下载失败: ${err?.message || err}`).catch(() => {})
    }).finally(() => {
      running = null
    })

    return true
  }

  async status(e) {
    if (!running) {
      await e.reply('当前没有下载任务在跑')
      return true
    }
    const sec = Math.round((Date.now() - running.startAt) / 1000)
    if (!running.latest) {
      await e.reply(`任务已启动 ${sec}s，尚未产生进度`)
      return true
    }
    const p = running.latest
    await e.reply(
      `下载进度 (${sec}s):\n` +
      `${p.done}/${p.total} (${p.percent}%)\n` +
      `新增 ${p.okNew} · 已存 ${p.okSkip} · 失败 ${p.fail}\n` +
      `已下 ${(p.bytes/1024/1024).toFixed(1)}MB`
    )
    return true
  }

}
