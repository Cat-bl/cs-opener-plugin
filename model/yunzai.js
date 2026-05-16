/* Yunzai 基类引入（本地缺失时降级为 stub，使 apps/ 静态分析仍可加载） */

import path from 'node:path'

let plugin
try {
  const mod = await import(path.join(process.cwd(), 'lib', 'plugins', 'plugin.js'))
  plugin = mod.default || mod
} catch {
  // 本地无 Yunzai 时的 stub —— apps/ 里的 extends plugin 仍能解析，但不会被 Yunzai 加载
  plugin = class {
    constructor(opts) { Object.assign(this, opts || {}) }
    async reply() {}
  }
}

let segment
try { segment = (await import('icqq').catch(() => import('oicq'))).segment } catch {}
if (!segment) segment = globalThis.segment || {
  image: x => ({ type: 'image', file: x }),
  video: x => ({ type: 'video', file: x }),
  at:    x => ({ type: 'at', qq: x }),
}

export { plugin, segment }
