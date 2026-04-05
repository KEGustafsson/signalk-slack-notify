import SlackNotifyFactory from 'slack-notify'

import {
  ALERT_LEVELS,
  DEFAULT_ALERT_LEVELS,
  DEFAULT_SLACK_CHANNEL,
  DEFAULT_SLACK_TITLE,
  NOTIFICATION_SUBSCRIPTION,
  SEND_DELAY_MS,
  type AlertLevel,
  type FormattedMeasurement,
  type NormalizedPluginOptions,
  type ParsedNotification,
  type PluginDependencies,
  type PluginOptions,
  type PluginSchema,
  type SignalKApp,
  type SignalKPathData,
  type SignalKPlugin
} from './types'
import {
  buildSlackMessage,
  extractNotifications,
  formatError,
  formatMeasurement,
  stringifyValue
} from './helpers'

const PLUGIN_ID = 'signalk-slack-notify'
const PLUGIN_NAME = 'Signal K notifications to Slack'
const PLUGIN_DESCRIPTION =
  'Send notifications from Signal K to Slack using Webhook API'

const pluginSchema = {
  type: 'object',
  required: ['webhook'],
  properties: {
    webhook: {
      type: 'string',
      title: 'Slack Webhook URL'
    },
    slackTitle: {
      type: 'string',
      title: 'Slack message title'
    },
    slackChannel: {
      type: 'string',
      title: 'Slack channel',
      default: DEFAULT_SLACK_CHANNEL
    },
    alertLevels: {
      type: 'array',
      title: 'Slack notification levels',
      description:
        'Choose which notification states are forwarded to Slack. Leave this empty to forward every state.',
      uniqueItems: true,
      items: {
        type: 'string',
        enum: ALERT_LEVELS
      },
      default: DEFAULT_ALERT_LEVELS
    }
  }
} as const satisfies PluginSchema

const defaultDependencies: PluginDependencies = {
  createSlackNotifier: (webhookUrl) => SlackNotifyFactory(webhookUrl),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule: (handle) => clearTimeout(handle),
  emitAsync: (callback) => setImmediate(callback)
}

function safeGetSelfPath(
  app: SignalKApp,
  path: string
): SignalKPathData | undefined {
  try {
    return app.getSelfPath(path)
  } catch (error) {
    app.debug(`Unable to read Signal K path "${path}": ${formatError(error)}`)
    return undefined
  }
}

function isSelectedLevel(
  selectedLevels: readonly AlertLevel[],
  notificationState: string
): boolean {
  return selectedLevels.some((level) => level === notificationState)
}

function normalizeOptions(options: PluginOptions): NormalizedPluginOptions {
  return {
    ...options,
    slackChannel: options.slackChannel ?? DEFAULT_SLACK_CHANNEL,
    slackTitle: options.slackTitle ?? DEFAULT_SLACK_TITLE
  }
}

function fallbackMeasurement(
  rawValue: unknown,
  rawUnits: unknown
): FormattedMeasurement {
  return {
    valueText: stringifyValue(rawValue),
    unitLabel: typeof rawUnits === 'string' ? rawUnits : ''
  }
}

export function createPlugin(
  app: SignalKApp,
  dependencies: PluginDependencies = defaultDependencies
): SignalKPlugin {
  let unsubscribes: Array<() => void> = []
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  let isStopped = true
  const setStatus = app.setPluginStatus ?? app.setProviderStatus

  function clearPendingTimers(): void {
    for (const timer of pendingTimers) {
      dependencies.cancelSchedule(timer)
    }

    pendingTimers.clear()
  }

  function resetRuntime(): void {
    isStopped = true
    clearPendingTimers()

    for (const unsubscribe of unsubscribes) {
      unsubscribe()
    }

    unsubscribes = []
  }

  async function sendNotification(
    slack: ReturnType<PluginDependencies['createSlackNotifier']>,
    options: NormalizedPluginOptions,
    notification: ParsedNotification
  ): Promise<void> {
    if (isStopped) {
      return
    }

    const slackData = safeGetSelfPath(app, notification.dataPath)
    const rawValue = slackData?.value
    const rawUnits = slackData?.meta?.units

    let measurement: FormattedMeasurement
    try {
      measurement = formatMeasurement(rawValue, rawUnits)
    } catch (error) {
      app.debug(
        `Unable to format value for "${notification.dataPath}": ${formatError(error)}`
      )
      measurement = fallbackMeasurement(rawValue, rawUnits)
    }

    try {
      await slack.send(
        buildSlackMessage(
          options,
          DEFAULT_SLACK_TITLE,
          notification,
          measurement
        )
      )

      dependencies.emitAsync(() => {
        app.emit('connectionwrite', { providerId: PLUGIN_ID })
      })
    } catch (error) {
      const errorMessage = `Failed to send Slack notification: ${formatError(error)}`
      app.error(errorMessage)
      setStatus?.(errorMessage)
    }
  }

  function stop(): void {
    resetRuntime()
    setStatus?.('Stopped')
  }

  function start(options: PluginOptions): void {
    resetRuntime()
    isStopped = false

    const normalizedOptions = normalizeOptions(options)
    const slack = dependencies.createSlackNotifier(normalizedOptions.webhook)
    const selectedLevels = normalizedOptions.alertLevels ?? []

    app.debug(`${PLUGIN_NAME} started`)
    setStatus?.('Running')

    app.subscriptionmanager.subscribe(
      NOTIFICATION_SUBSCRIPTION,
      unsubscribes,
      (subscriptionError) => {
        const errorMessage = `Subscription error: ${formatError(subscriptionError)}`
        app.error(errorMessage)
        setStatus?.(errorMessage)
      },
      (delta) => {
        const notifications = extractNotifications(delta)

        if (notifications.length === 0) {
          app.debug('No valid notifications found in delta payload.')
          return
        }

        for (const notification of notifications) {
          if (
            selectedLevels.length > 0 &&
            !isSelectedLevel(selectedLevels, notification.state)
          ) {
            app.debug(`Skipping notification with state: ${notification.state}`)
            continue
          }

          const timer = dependencies.schedule(() => {
            pendingTimers.delete(timer)
            void sendNotification(slack, normalizedOptions, notification)
          }, SEND_DELAY_MS)

          pendingTimers.add(timer)
        }
      }
    )
  }

  return {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    start,
    stop,
    schema: pluginSchema
  }
}
