/* 群概率隔离：每个群独立的概率设置
 *
 * 存储：data/groups/{group_id}.json → { odds: {3:n,4:n,5:n,6:n,7:n} }
 * 优先级：群概率 > config.defaultOdds（全局兜底）
 * 私聊（无 group_id）始终用全局
 */

import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const GROUPS_DIR = path.join(PLUGIN_ROOT, 'data', 'groups')

if (!fss.existsSync(GROUPS_DIR)) fss.mkdirSync(GROUPS_DIR, { recursive: true })

function fileOf(gid) { return path.join(GROUPS_DIR, `${gid}.json`) }

async function readGroup(gid) {
  try { return JSON.parse(await fs.readFile(fileOf(gid), 'utf8')) }
  catch { return {} }
}

async function writeGroup(gid, data) {
  const tmp = fileOf(gid) + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
  await fs.rename(tmp, fileOf(gid))
}

/* 获取某群的概率；null = 该群没设过（用全局兜底） */
export async function getGroupOdds(groupId) {
  if (!groupId) return null
  const d = await readGroup(groupId)
  return d.odds || null
}

/* 设置某群的概率 */
export async function setGroupOdds(groupId, odds) {
  if (!groupId) return
  const d = await readGroup(groupId)
  d.odds = odds
  await writeGroup(groupId, d)
}

/* 清除某群的概率（回退到全局） */
export async function resetGroupOdds(groupId) {
  if (!groupId) return
  const d = await readGroup(groupId)
  delete d.odds
  await writeGroup(groupId, d)
}
