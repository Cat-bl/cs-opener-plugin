/* 简易命令冷却：内存级 per-(命令,uid) 时间戳
 *
 *   import { checkCooldown } from '../model/cooldown.js'
 *   const remain = checkCooldown('open', e.user_id, 2)  // 2 秒冷却
 *   if (remain) return e.reply(`命令冷却中，${remain}s 后再试`)
 *
 * 返回值：null 表示未在冷却（已记录本次时间）；数字表示剩余秒数（不记录）
 */

import Config from './config.js'

const buckets = new Map()

export function checkCooldown(cmdKey, uid, secs) {
  // secs 不传 → 从 config.cooldown[cmdKey] 读
  if (secs == null) secs = Config.get().cooldown?.[cmdKey]
  if (!secs || secs <= 0) return null

  let bucket = buckets.get(cmdKey)
  if (!bucket) { bucket = new Map(); buckets.set(cmdKey, bucket) }

  const last = bucket.get(uid) || 0
  const now = Date.now()
  const elapsed = (now - last) / 1000
  if (elapsed < secs) return Math.ceil(secs - elapsed)
  bucket.set(uid, now)
  return null
}

/* 每 5 分钟清扫一次：删除超过 cooldown * 10 倍时长的 stale entry（基本可判定不会再用） */
setInterval(() => {
  const cfg = Config.get().cooldown || {}
  const now = Date.now()
  for (const [cmdKey, bucket] of buckets) {
    const cd = cfg[cmdKey] || 0
    if (cd <= 0) continue
    const thresholdMs = cd * 10 * 1000
    for (const [uid, ts] of bucket) {
      if (now - ts > thresholdMs) bucket.delete(uid)
    }
    if (bucket.size === 0) buckets.delete(cmdKey)
  }
}, 5 * 60 * 1000).unref?.()
