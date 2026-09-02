export type RotationSample = { x: number; time: number }

export const ROTATION_PER_PIXEL = 0.007
const MAX_VELOCITY = 4.5
const INERTIA_FRICTION = 5.5

export function rotationVelocity(samples: RotationSample[]) {
  const last = samples.at(-1)
  if (!last) return 0
  const windowStart = last.time - 120
  const first = samples.find((sample) => sample.time >= windowStart) || last
  const seconds = (last.time - first.time) / 1000
  if (seconds < 0.016) return 0
  return Math.max(
    -MAX_VELOCITY,
    Math.min(MAX_VELOCITY, ((last.x - first.x) * ROTATION_PER_PIXEL) / seconds),
  )
}

export function stepRotation(rotation: number, velocity: number, dt: number) {
  const safeDt = Math.max(0, Math.min(dt, 0.05))
  const nextRotation = rotation + velocity * safeDt
  const nextVelocity = velocity * Math.exp(-INERTIA_FRICTION * safeDt)
  return {
    rotation: nextRotation,
    velocity: Math.abs(nextVelocity) < 0.01 ? 0 : nextVelocity,
  }
}
