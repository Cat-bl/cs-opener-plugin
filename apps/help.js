import plugin from '../../../lib/plugins/plugin.js'
import { renderTpl } from '../model/render.js'

export class CsgoHelp extends plugin {
  constructor() {
    super({
      name: 'CSGO帮助',
      dsc: 'CS:GO 开箱命令列表',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo(\\s*(帮助|help))?$', fnc: 'help' },
      ],
    })
  }

  async help(e) {
    const img = await renderTpl('help', {})
    await e.reply(img)
    return true
  }
}
