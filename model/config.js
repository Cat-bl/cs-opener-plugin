import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import chokidar from 'chokidar'
import _ from 'lodash'

const log = globalThis.logger || { mark: (...a) => console.log(...a), error: (...a) => console.error(...a), info: (...a) => console.log(...a) }
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const DEFAULT_DIR = path.join(PLUGIN_ROOT, 'config_default')
const USER_DIR    = path.join(PLUGIN_ROOT, 'config')

function ensureUserConfig() {
  if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true })
  for (const name of fs.readdirSync(DEFAULT_DIR)) {
    const user = path.join(USER_DIR, name)
    if (!fs.existsSync(user)) {
      fs.copyFileSync(path.join(DEFAULT_DIR, name), user)
      log.mark?.(`[csgo-opener] 创建默认配置 config/${name}`)
    }
  }
}

function readYaml(file) {
  try { return YAML.parse(fs.readFileSync(file, 'utf8')) || {} }
  catch (err) {
    log.error?.(`[csgo-opener] 解析配置失败 ${file}: ${err?.message || err}`)
    return {}
  }
}

/* 递归找 default 里有、user 里没有的 leaf path */
function missingPaths(user, defaults, prefix = '') {
  const result = []
  for (const [k, dv] of Object.entries(defaults || {})) {
    const p = prefix ? `${prefix}.${k}` : k
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
    if (user == null || !(k in user)) {
      result.push({ path: p, value: dv })
    } else if (isObj(dv) && isObj(user[k])) {
      result.push(...missingPaths(user[k], dv, p))
    }
  }
  return result
}

class Config {
  constructor() {
    ensureUserConfig()
    this.cache = {}
    this.watchers = {}
    this.load('config')
  }

  load(name) {
    const userFile    = path.join(USER_DIR, `${name}.yaml`)
    const defaultFile = path.join(DEFAULT_DIR, `${name}.yaml`)
    const defaults    = readYaml(defaultFile)
    let user          = readYaml(userFile)

    // 启动时自动把 default 新增字段写入 user 文件（保留原注释和已有改动）
    const missing = missingPaths(user, defaults)
    if (missing.length > 0) {
      try {
        const doc = YAML.parseDocument(fs.readFileSync(userFile, 'utf8'))
        for (const { path: p, value } of missing) {
          doc.addIn(p.split('.'), value)
        }
        fs.writeFileSync(userFile, String(doc), 'utf8')
        user = readYaml(userFile)
        log.mark?.(`[csgo-opener] config/${name}.yaml 自动补齐 ${missing.length} 项新配置: ${missing.map(m => m.path).join(', ')}`)
      } catch (err) {
        log.error?.(`[csgo-opener] 自动补齐配置失败: ${err?.message || err}`)
      }
    }

    this.cache[name]  = _.merge({}, defaults, user)
    this.watch(name, userFile)
    return this.cache[name]
  }

  watch(name, file) {
    if (this.watchers[name]) return
    const watcher = chokidar.watch(file, { ignoreInitial: true })
    watcher.on('change', () => {
      log.mark?.(`[csgo-opener] 配置变更, 热更新 config/${name}.yaml`)
      const defaults = readYaml(path.join(DEFAULT_DIR, `${name}.yaml`))
      const user     = readYaml(file)
      this.cache[name] = _.merge({}, defaults, user)
    })
    this.watchers[name] = watcher
  }

  get(name = 'config') {
    if (!this.cache[name]) this.load(name)
    return this.cache[name]
  }

  /* 把 cache[name] 写回 config/name.yaml（chokidar 自身的写入会触发一次 reload，幂等） */
  save(name = 'config') {
    if (!this.cache[name]) return
    const userFile = path.join(USER_DIR, `${name}.yaml`)
    fs.writeFileSync(userFile, YAML.stringify(this.cache[name]), 'utf8')
    log.mark?.(`[csgo-opener] 已保存 config/${name}.yaml`)
  }
}

export default new Config()
