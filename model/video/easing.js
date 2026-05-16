/* cubic-bezier 缓动求值 */
export function cubicBezier(p1x, p1y, p2x, p2y) {
  const ax = 3*p1x - 3*p2x + 1, bx = 3*p2x - 6*p1x, cx = 3*p1x
  const ay = 3*p1y - 3*p2y + 1, by = 3*p2y - 6*p1y, cy = 3*p1y
  const X = t => ((ax*t + bx)*t + cx)*t
  const Y = t => ((ay*t + by)*t + cy)*t
  return (x) => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const xt = X(t) - x
      const dx = (3*ax*t + 2*bx)*t + cx
      if (Math.abs(dx) < 1e-6) break
      t -= xt / dx
    }
    t = Math.max(0, Math.min(1, t))
    return Y(t)
  }
}

export const EASE_SPIN = cubicBezier(0.39, 0.58, 0.57, 1)
export const EASE_OUT  = cubicBezier(0,    0,    0.2,  1)
