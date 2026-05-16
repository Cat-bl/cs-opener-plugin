import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './model/config.js'

const log = globalThis.logger || { info: (...a) => console.log(...a), error: (...a) => console.error(...a), mark: (...a) => console.log(...a) }
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APPS_DIR = path.join(__dirname, 'apps')

log.info('\x1b[36m[csgo-opener] 插件开始加载\x1b[0m')

if (!global.segment) {
  try { global.segment = (await import('oicq')).segment } catch {}
}

const files = fs.readdirSync(APPS_DIR).filter(f => f.endsWith('.js'))
const ret = files.map(f => import(`./apps/${f}`))
const results = await Promise.allSettled(ret)

const apps = {}
results.forEach((r, i) => {
  const name = files[i].replace(/\.js$/, '')
  if (r.status === 'fulfilled') {
    const mod = r.value
    apps[name] = mod[Object.keys(mod)[0]]
  } else {
    log.error(`\x1b[31m[csgo-opener] ${name} 加载失败\x1b[0m`, r.reason)
  }
})

log.info('\x1b[36m[csgo-opener] 插件加载完成\x1b[0m')

export { apps }
