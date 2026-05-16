/* 插件自更新（git pull）
 *
 *   #csgo更新    从 git 仓库拉取最新代码
 */

import plugin from '../../../lib/plugins/plugin.js'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')

export class CsgoUpdate extends plugin {
  constructor() {
    super({
      name: 'CSGO更新',
      dsc: 'CS:GO 开箱插件自更新',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*(插件)?\\s*更新$', fnc: 'update' },
      ],
    })
  }

  async update(e) {
    if (!e.isMaster) { await e.reply('仅主人可用'); return true }
    await e.reply('开始拉取更新...')

    exec('git pull', { cwd: PLUGIN_ROOT }, async (err, stdout, stderr) => {
      if (err) {
        await e.reply(`更新失败:\n${stderr || err.message}`)
        return
      }
      const output = stdout.trim() || 'Already up to date.'
      if (output.includes('Already up to date')) {
        await e.reply('当前已是最新版本')
      } else {
        await e.reply(`更新成功:\n${output}\n\n请重启 Yunzai 生效`)
      }
    })
    return true
  }
}
