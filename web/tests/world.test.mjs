import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROTATION_PER_PIXEL,
  rotationVelocity,
  stepRotation,
} from '../src/world/rotation.ts'

test('drag distance maps directly to island rotation', () => {
  assert.ok(Math.abs(100 * ROTATION_PER_PIXEL - 0.7) < Number.EPSILON)
})

test('release velocity uses recent movement and stays bounded', () => {
  assert.ok(
    Math.abs(rotationVelocity([
      { x: 10, time: 0 },
      { x: 30, time: 50 },
      { x: 50, time: 100 },
    ]) - 2.8) < 1e-12,
  )
  assert.equal(
    rotationVelocity([
      { x: 0, time: 0 },
      { x: 1000, time: 20 },
    ]),
    4.5,
  )
})

test('inertia advances continuously and decays to rest', () => {
  let state = { rotation: 0, velocity: 3 }
  for (let i = 0; i < 180; i++)
    state = stepRotation(state.rotation, state.velocity, 1 / 60)
  assert.ok(state.rotation > 0.45)
  assert.equal(state.velocity, 0)
  assert.deepEqual(stepRotation(1, 2, -1), { rotation: 1, velocity: 2 })
})
