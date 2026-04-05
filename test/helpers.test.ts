import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractNotifications,
  formatMeasurement,
  kelvinToCelsius,
  metersPerSecondToKnots,
  radiansToDegrees
} from '../src/helpers'
import type { SignalKDelta } from '../src/types'

test('kelvinToCelsius converts Kelvin to Celsius', () => {
  assert.equal(kelvinToCelsius(273.15), 0)
})

test('kelvinToCelsius rejects negative Kelvin values', () => {
  assert.throws(
    () => kelvinToCelsius(-1),
    /Temperature in Kelvin cannot be negative/
  )
})

test('metersPerSecondToKnots converts meters per second to knots', () => {
  assert.equal(metersPerSecondToKnots(1), 1.94384449)
})

test('radiansToDegrees converts radians to degrees', () => {
  assert.equal(radiansToDegrees(Math.PI), 180)
})

test('formatMeasurement converts Kelvin values to Celsius with correct encoding', () => {
  assert.deepEqual(formatMeasurement(273.15, 'K'), {
    valueText: '0.0',
    unitLabel: '°C'
  })
})

test('formatMeasurement preserves zero values', () => {
  assert.deepEqual(formatMeasurement(0, 'C'), {
    valueText: '0',
    unitLabel: '°C'
  })
})

test('formatMeasurement converts meters per second to knots', () => {
  assert.deepEqual(formatMeasurement(0, 'm/s'), {
    valueText: '0.0',
    unitLabel: 'kn'
  })
})

test('formatMeasurement converts radians to degrees', () => {
  assert.deepEqual(formatMeasurement(Math.PI / 2, 'rad'), {
    valueText: '90.0',
    unitLabel: 'deg'
  })
})

test('formatMeasurement preserves unsupported units', () => {
  assert.deepEqual(formatMeasurement('steady', 'custom'), {
    valueText: 'steady',
    unitLabel: 'custom'
  })
})

test('formatMeasurement handles missing units safely', () => {
  assert.deepEqual(formatMeasurement(undefined, undefined), {
    valueText: 'n/a',
    unitLabel: ''
  })
})

test('extractNotifications keeps valid notifications and skips malformed entries', () => {
  const delta: SignalKDelta = {
    updates: [
      {
        timestamp: '2026-04-05T10:00:00.000Z',
        values: [
          {
            path: 'notifications.navigation.anchor',
            value: {
              state: 'alert',
              message: 'Anchor drag alarm'
            }
          },
          {
            path: 'notifications.navigation.invalid',
            value: {
              message: 'Missing state'
            }
          },
          {
            path: 'navigation.speedOverGround',
            value: {
              state: 'alert',
              message: 'Wrong path'
            }
          }
        ]
      }
    ]
  }

  assert.deepEqual(extractNotifications(delta), [
    {
      notificationPath: 'notifications.navigation.anchor',
      dataPath: 'navigation.anchor',
      state: 'alert',
      message: 'Anchor drag alarm',
      timestamp: '2026-04-05T10:00:00.000Z'
    }
  ])
})
