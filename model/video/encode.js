/* ffmpeg pipe rawvideo → mp4 + 音轨混音
 *
 * ffmpeg 二进制按下面优先级查找:
 *   1) process.env.FFMPEG（用户在 Yunzai 启动脚本里显式指定）
 *   2) 系统 PATH 中的 'ffmpeg'
 *   3) ../tools/ffmpeg/bin/ffmpeg.exe（本地原型期残留，便于开发机直接跑）
 */

import { spawn } from 'node:child_process'
import fss from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ASSETS_DIR } from './assets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_FFMPEG = path.resolve(__dirname, '..', '..', 'tools', 'ffmpeg', 'bin',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')

function resolveFFmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  if (fss.existsSync(LOCAL_FFMPEG)) return LOCAL_FFMPEG
  return 'ffmpeg'  // 走 PATH
}

export function encodeMP4({
  width, height, fps, totalMs,
  introMs, transitionMs, spinDurMs, drop,
  outPath, frameSource,         // async iterator over RGBA buffers
  noAudio = false,
}) {
  const FFMPEG = resolveFFmpeg()

  const videoIn = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`, '-framerate', String(fps),
    '-i', 'pipe:0',
  ]

  let args
  if (noAudio) {
    args = [...videoIn, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', outPath]
  } else {
    const WIN_MAP = {
      1: 'case_awarded_0', 2: 'case_awarded_0', 3: 'case_awarded_1',
      4: 'case_awarded_2', 5: 'case_awarded_3', 6: 'case_awarded_4', 7: 'case_awarded_5',
    }
    const drop_a = path.join(ASSETS_DIR, 'audio', 'case_drop_01.mp3')
    const kx_a   = path.join(ASSETS_DIR, 'audio', 'kaixiang_case.m4a')
    const win_a  = path.join(ASSETS_DIR, 'audio', `${WIN_MAP[drop.rarityNum] || 'case_awarded_1'}.mp3`)

    const DROP_AT = introMs
    const KX_AT   = introMs + transitionMs
    const WIN_AT  = KX_AT + spinDurMs

    const filter =
      `[1:a]adelay=${DROP_AT}|${DROP_AT},volume=0.6[a1];` +
      `[2:a]atrim=0:6.1,adelay=${KX_AT}|${KX_AT},afade=t=out:st=6:d=0.3,volume=1.0[a2];` +
      `[3:a]adelay=${WIN_AT}|${WIN_AT},volume=1.0[a3];` +
      `[a1][a2][a3]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,` +
      `apad=whole_dur=${totalMs}ms[aout]`

    args = [
      ...videoIn,
      '-i', drop_a, '-i', kx_a, '-i', win_a,
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '160k',
      outPath,
    ]
  }

  return new Promise(async (resolve, reject) => {
    let ff
    try { ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] }) }
    catch (e) { return reject(e) }
    ff.on('error', reject)
    ff.on('exit', code => code === 0 ? resolve(outPath) : reject(new Error('ffmpeg exit ' + code)))

    try {
      for await (const buf of frameSource) {
        const ok = ff.stdin.write(buf)
        if (!ok) await new Promise(r => ff.stdin.once('drain', r))
      }
      ff.stdin.end()
    } catch (e) {
      try { ff.kill() } catch {}
      reject(e)
    }
  })
}

export { resolveFFmpeg }
