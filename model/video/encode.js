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

  /* H.264 编码参数（QQ 流畅播放优化）
   *   -preset medium     比 veryfast 画质好得多，QQ 二次压缩后保留更多细节
   *   -crf 20            画质略高于默认 23，文件略大但 QQ 不易出色块
   *   -g {fps}           每秒一个关键帧（默认 250 帧 = 4 秒，seek/缓冲会卡）
   *   -keyint_min {fps}  避免插入额外关键帧，GOP 稳定
   *   -sc_threshold 0    关场景切换检测，关键帧严格按 GOP
   *   -profile:v high    现代手机/QQ 都支持，画质比 main 好
   *   -level 4.1         60fps 720p 至少需 Level 3.2，4.1 更稳
   *   -movflags +faststart  把 mp4 元数据移到文件头，QQ 客户端能边下边播
   */
  const x264 = [
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-g', String(fps),
    '-keyint_min', String(fps),
    '-sc_threshold', '0',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ]

  let args
  if (noAudio) {
    args = [...videoIn, ...x264, outPath]
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

    // 滚动嘀嘀声: 截前 6 秒(对应 spin 时长)，硬切到中奖音，不做淡出
    const filter =
      `[1:a]adelay=${DROP_AT}|${DROP_AT},volume=0.6[a1];` +
      `[2:a]atrim=0:6,adelay=${KX_AT}|${KX_AT},volume=1.0[a2];` +
      `[3:a]adelay=${WIN_AT}|${WIN_AT},volume=1.0[a3];` +
      `[a1][a2][a3]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,` +
      `apad=whole_dur=${totalMs}ms[aout]`

    args = [
      ...videoIn,
      '-i', drop_a, '-i', kx_a, '-i', win_a,
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[aout]',
      ...x264,
      '-c:a', 'aac', '-b:a', '160k',
      outPath,
    ]
  }

  return new Promise(async (resolve, reject) => {
    let ff
    // stdout 完全丢弃；stderr 仅缓存最后 ~10KB，正常退出不打印，出错时给主进程看
    try { ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] }) }
    catch (e) { return reject(e) }

    let errBuf = ''
    ff.stderr.on('data', d => {
      errBuf += d
      if (errBuf.length > 10240) errBuf = errBuf.slice(-8192)
    })
    ff.on('error', reject)
    ff.on('exit', code => {
      if (code === 0) return resolve(outPath)
      const tail = errBuf.split('\n').slice(-12).join('\n')
      console.error('[csgo-opener] ffmpeg 失败 (exit ' + code + '):\n' + tail)
      reject(new Error('ffmpeg exit ' + code))
    })

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
