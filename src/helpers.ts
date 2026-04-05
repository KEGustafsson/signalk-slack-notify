import {
  FALLBACK_DISPLAY_VALUE,
  NOTIFICATION_PREFIX,
  type FormattedMeasurement,
  type NormalizedPluginOptions,
  type ParsedNotification,
  type SignalKDelta,
  type SlackMessage
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function formatNumber(value: number): string {
  return value.toFixed(1)
}

export function kelvinToCelsius(kelvin: number): number {
  if (kelvin < 0) {
    throw new Error('Temperature in Kelvin cannot be negative')
  }

  return kelvin - 273.15
}

export function metersPerSecondToKnots(metersPerSecond: number): number {
  if (metersPerSecond < 0) {
    throw new Error('Speed in meters per second cannot be negative')
  }

  return metersPerSecond * 1.94384449
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    const serialized = JSON.stringify(error)
    return serialized ?? String(error)
  } catch {
    return String(error)
  }
}

export function stringifyValue(value: unknown): string {
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? value.toString() : FALLBACK_DISPLAY_VALUE
    case 'string':
      return value
    case 'boolean':
      return value ? 'true' : 'false'
    case 'bigint':
      return value.toString()
    case 'undefined':
      return FALLBACK_DISPLAY_VALUE
    case 'object':
      if (value === null) {
        return FALLBACK_DISPLAY_VALUE
      }

      try {
        return JSON.stringify(value) ?? FALLBACK_DISPLAY_VALUE
      } catch {
        return FALLBACK_DISPLAY_VALUE
      }
    default:
      return FALLBACK_DISPLAY_VALUE
  }
}

export function normalizeUnitLabel(unit: unknown): string {
  if (unit === 'C') {
    return '°C'
  }

  return typeof unit === 'string' ? unit : ''
}

export function formatMeasurement(
  value: unknown,
  unit: unknown
): FormattedMeasurement {
  const unitLabel = typeof unit === 'string' ? unit : ''

  if (typeof value === 'number' && Number.isFinite(value)) {
    switch (unitLabel) {
      case 'K':
        return {
          valueText: formatNumber(kelvinToCelsius(value)),
          unitLabel: '°C'
        }
      case 'm/s':
        return {
          valueText: formatNumber(metersPerSecondToKnots(value)),
          unitLabel: 'kn'
        }
      case 'rad':
        return {
          valueText: formatNumber(radiansToDegrees(value)),
          unitLabel: 'deg'
        }
      case 'C':
        return {
          valueText: stringifyValue(value),
          unitLabel: '°C'
        }
      default:
        return {
          valueText: stringifyValue(value),
          unitLabel
        }
    }
  }

  return {
    valueText: stringifyValue(value),
    unitLabel: normalizeUnitLabel(unit)
  }
}

export function combineValueAndUnit(measurement: FormattedMeasurement): string {
  return measurement.unitLabel.length > 0
    ? `${measurement.valueText} ${measurement.unitLabel}`
    : measurement.valueText
}

export function extractNotifications(
  delta: SignalKDelta
): ParsedNotification[] {
  if (!Array.isArray(delta.updates)) {
    return []
  }

  const notifications: ParsedNotification[] = []

  for (const update of delta.updates) {
    if (!isRecord(update) || !Array.isArray(update.values)) {
      continue
    }

    const timestamp =
      asNonEmptyString(update.timestamp) ?? FALLBACK_DISPLAY_VALUE

    for (const valueEntry of update.values) {
      if (!isRecord(valueEntry)) {
        continue
      }

      const notificationPath = asNonEmptyString(valueEntry.path)
      if (
        notificationPath === undefined ||
        !notificationPath.startsWith(NOTIFICATION_PREFIX)
      ) {
        continue
      }

      const payload = valueEntry.value
      if (!isRecord(payload)) {
        continue
      }

      const state = asNonEmptyString(payload.state)
      const message =
        asNonEmptyString(payload.message) ?? FALLBACK_DISPLAY_VALUE

      if (state === undefined) {
        continue
      }

      const dataPath = notificationPath.slice(NOTIFICATION_PREFIX.length)
      if (dataPath.length === 0) {
        continue
      }

      notifications.push({
        notificationPath,
        dataPath,
        state,
        message,
        timestamp
      })
    }
  }

  return notifications
}

export function buildSlackMessage(
  options: NormalizedPluginOptions,
  defaultTitle: string,
  notification: ParsedNotification,
  measurement: FormattedMeasurement
): SlackMessage {
  return {
    channel: options.slackChannel,
    text: options.slackTitle ?? defaultTitle,
    fields: {
      'Signal K path': notification.notificationPath,
      State: notification.state,
      Message: notification.message,
      Value: combineValueAndUnit(measurement),
      Timestamp: notification.timestamp
    }
  }
}
