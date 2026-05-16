/* puppeteer 渲染封装
 *
 *   const img = await renderTpl('shop', { ... })
 *   e.reply(img)
 *
 * 工作模式:
 *   - Yunzai 环境：import 顶层 'lib/puppeteer/puppeteer.js'，调 puppeteer.screenshot()
 *   - 本地测试（无 Yunzai）：fallback 到 puppeteer-core 直接启动 chrome 截图
 *     需要本地安装 puppeteer 或 puppeteer-core（仅 dev 用）
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Config from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const PLUGIN_NAME = 'cs-opener'

let _puppeteer = null
async function getPuppeteer() {
  if (_puppeteer) return _puppeteer
  // 尝试 Yunzai 内置
  try {
    const cwd = process.cwd()
    const mod = await import(path.join(cwd, 'lib', 'puppeteer', 'puppeteer.js')).catch(() => null)
        || await import('../../../lib/puppeteer/puppeteer.js').catch(() => null)
    if (mod && mod.default) {
      _puppeteer = { mode: 'yunzai', api: mod.default }
      return _puppeteer
    }
  } catch {}
  // Fallback: puppeteer-core / puppeteer
  try {
    const mod = await import('puppeteer').catch(() => null) || await import('puppeteer-core').catch(() => null)
    if (mod && mod.default) {
      _puppeteer = { mode: 'standalone', api: mod.default }
      return _puppeteer
    }
  } catch {}
  throw new Error('未找到 puppeteer：Yunzai 环境需挂在 plugins/，本地需 npm i -D puppeteer')
}

/* 简易模板替换：兼容 art-template 的 {{key}} 与 {{@ key}}（@ = 原样输出）
 * 本 standalone 替换器对两种语法等价（都原样注入；调用方需自行 escape 标量） */
function applyTpl(html, data) {
  return html.replace(/\{\{\s*@?\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data)
    return v == null ? '' : String(v)
  })
}

import fs from 'node:fs/promises'

/* 全局固定水印（作者标识） */
export const WATERMARK = 'Trss-Yunzai · cs-opener-plugin · 冰凉到通透'

export async function renderTpl(tpl, data = {}, opts = {}) {
  const cfg = Config.get().puppeteer || {}
  const width  = opts.width  ?? cfg.width  ?? 1280
  const height = opts.height ?? cfg.height ?? 720
  const scale  = opts.scale  ?? cfg.scale  ?? 1

  const tplFile = path.join(PLUGIN_ROOT, 'resources', 'html', `${tpl}.html`)
  const pluResPath = path.join(PLUGIN_ROOT, 'resources').replace(/\\/g, '/')
  const pluRoot    = PLUGIN_ROOT.replace(/\\/g, '/')

  const enriched = {
    ...data,
    pluResPath, pluRoot, pluResUrl: 'file:///' + pluResPath,
    watermark: WATERMARK,    // 模板里用 {{watermark}}
  }

  const pp = await getPuppeteer()
  if (pp.mode === 'yunzai') {
    return await pp.api.screenshot(PLUGIN_NAME, {
      saveId: `${tpl}-${Date.now()}`,
      imgType: 'png',
      tplFile,
      pluResPath: 'file:///' + pluResPath + '/',
      pluRoot,
      width, height, scale,
      _data: enriched,   // 透传给模板（如果模板用 template engine 也会用上）
      ...enriched,        // 顶层也铺一份，方便 puppeteer 默认模板引擎使用
    })
  }

  // standalone：自己渲染模板 + 截图
  const raw = await fs.readFile(tplFile, 'utf8')
  const html = applyTpl(raw, enriched)
  const browser = await pp.api.launch({ headless: 'new', args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: scale })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const buf = await page.screenshot({ type: 'png', fullPage: true })
    // 返回 segment.image 兼容对象（Yunzai 环境下 segment 是 global）
    if (globalThis.segment?.image) return globalThis.segment.image(buf)
    return buf
  } finally {
    await browser.close()
  }
}

/* 渲染到文件（CLI 调试用） */
export async function renderToFile(tpl, data, outFile, opts = {}) {
  const cfg = Config.get().puppeteer || {}
  const width  = opts.width  ?? cfg.width  ?? 1280
  const height = opts.height ?? cfg.height ?? 720
  const scale  = opts.scale  ?? cfg.scale  ?? 1

  const tplFile = path.join(PLUGIN_ROOT, 'resources', 'html', `${tpl}.html`)
  const pluResPath = path.join(PLUGIN_ROOT, 'resources').replace(/\\/g, '/')
  const pluRoot    = PLUGIN_ROOT.replace(/\\/g, '/')
  const enriched = { ...data, pluResPath, pluRoot, pluResUrl: 'file:///' + pluResPath }

  const pp = await getPuppeteer()
  const raw = await fs.readFile(tplFile, 'utf8')
  const html = applyTpl(raw, enriched)

  if (pp.mode === 'standalone') {
    const browser = await pp.api.launch({ headless: 'new', args: ['--no-sandbox'] })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width, height, deviceScaleFactor: scale })
      // 设置 baseURL 让相对路径资源可加载
      await page.goto('file:///' + tplFile.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' })
      await page.setContent(html, { waitUntil: 'networkidle0' })
      await page.screenshot({ path: outFile, type: 'png', fullPage: true })
    } finally {
      await browser.close()
    }
    return outFile
  }
  throw new Error('renderToFile 仅 standalone 模式可用（用于 CLI 调试）')
}
