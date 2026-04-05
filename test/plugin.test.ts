import assert from 'node:assert/strict'
import test from 'node:test'

import { createPlugin } from '../src/plugin'
import type {
  PluginDependencies,
  PluginOptions,
  SignalKApp,
  SignalKDelta,
  SignalKPathData,
  SignalKSubscription,
  SlackMessage,
  SlackNotifier,
  Unsubscribe
} from '../src/types'

const TEST_OPTIONS: PluginOptions = {
  webhook: 'https://hooks.slack.test/services/example',
  slackTitle: 'Signal K alert',
  slackChannel: '#alert',
  alertLevels: ['alert', 'warn', 'alarm', 'emergency']
}

function waitForAsyncWork(delayMs = 25): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function createDelta(
  path: string,
  state: string,
  message: string,
  timestamp = '2026-04-05T10:00:00.000Z'
): SignalKDelta {
  return {
    updates: [
      {
        timestamp,
        values: [
          {
            path,
            value: {
              state,
              message
            }
          }
        ]
      }
    ]
  }
}

function createNotifier(
  sendImplementation?: (message: SlackMessage) => Promise<void>
): { notifier: SlackNotifier; sentMessages: SlackMessage[] } {
  const sentMessages: SlackMessage[] = []

  return {
    sentMessages,
    notifier: {
      async send(message: SlackMessage): Promise<void> {
        if (sendImplementation !== undefined) {
          await sendImplementation(message)
          return
        }

        sentMessages.push(message)
      }
    }
  }
}

function createDependencies(
  notifier: SlackNotifier,
  scheduledDelayMs = 0
): PluginDependencies {
  return {
    createSlackNotifier: () => notifier,
    schedule: (callback) => setTimeout(callback, scheduledDelayMs),
    cancelSchedule: (handle) => clearTimeout(handle),
    emitAsync: (callback) => callback()
  }
}

function createAppHarness(
  pathDataByPath: Record<string, SignalKPathData> = {},
  failingPaths: Record<string, string> = {}
): {
  app: SignalKApp
  deliver(delta: SignalKDelta): void
  debugLogs: string[]
  errorLogs: string[]
  statuses: string[]
  emittedEvents: Array<{
    eventName: 'connectionwrite'
    payload: { providerId: string }
  }>
  unsubscribeCount(): number
  subscription(): SignalKSubscription | undefined
} {
  const debugLogs: string[] = []
  const errorLogs: string[] = []
  const statuses: string[] = []
  const emittedEvents: Array<{
    eventName: 'connectionwrite'
    payload: { providerId: string }
  }> = []
  let deltaHandler: ((delta: SignalKDelta) => void) | undefined
  let unsubscribeCounter = 0
  let activeSubscription: SignalKSubscription | undefined

  const app: SignalKApp = {
    debug(message) {
      debugLogs.push(message)
    },
    error(message) {
      errorLogs.push(message)
    },
    setPluginStatus(message) {
      statuses.push(message)
    },
    subscriptionmanager: {
      subscribe(
        subscription: SignalKSubscription,
        unsubscribes: Unsubscribe[],
        onError,
        onDelta
      ) {
        activeSubscription = subscription
        deltaHandler = onDelta
        unsubscribes.push(() => {
          unsubscribeCounter += 1
        })
        void onError
      }
    },
    getSelfPath(path: string): SignalKPathData {
      const failure = failingPaths[path]
      if (failure !== undefined) {
        throw new Error(failure)
      }

      const data = pathDataByPath[path]
      if (data === undefined) {
        throw new Error(`Missing path data for ${path}`)
      }

      return data
    },
    emit(eventName, payload) {
      emittedEvents.push({ eventName, payload })
    }
  }

  return {
    app,
    deliver(delta) {
      assert.ok(deltaHandler, 'subscription handler should be registered')
      deltaHandler(delta)
    },
    debugLogs,
    errorLogs,
    statuses,
    emittedEvents,
    unsubscribeCount() {
      return unsubscribeCounter
    },
    subscription() {
      return activeSubscription
    }
  }
}

test('plugin sends Slack messages for selected alert levels', async () => {
  const { notifier, sentMessages } = createNotifier()
  const { app, deliver, emittedEvents, subscription } = createAppHarness({
    'navigation.anchor': {
      value: 273.15,
      meta: {
        units: 'K'
      }
    }
  })

  const plugin = createPlugin(app, createDependencies(notifier))
  plugin.start(TEST_OPTIONS)

  assert.deepEqual(subscription(), {
    context: 'vessels.self',
    subscribe: [
      {
        path: 'notifications.*',
        policy: 'instant'
      }
    ]
  })

  deliver(
    createDelta('notifications.navigation.anchor', 'alert', 'Anchor drag alarm')
  )

  await waitForAsyncWork()

  assert.equal(sentMessages.length, 1)
  assert.deepEqual(sentMessages[0], {
    channel: '#alert',
    text: 'Signal K alert',
    fields: {
      'Signal K path': 'notifications.navigation.anchor',
      State: 'alert',
      Message: 'Anchor drag alarm',
      Value: '0.0 °C',
      Timestamp: '2026-04-05T10:00:00.000Z'
    }
  })
  assert.deepEqual(emittedEvents, [
    {
      eventName: 'connectionwrite',
      payload: { providerId: 'signalk-slack-notify' }
    }
  ])
})

test('plugin skips non-selected alert levels', async () => {
  const { notifier, sentMessages } = createNotifier()
  const { app, deliver, debugLogs } = createAppHarness({
    'navigation.anchor': {
      value: 273.15,
      meta: {
        units: 'K'
      }
    }
  })

  const plugin = createPlugin(app, createDependencies(notifier))
  plugin.start({
    ...TEST_OPTIONS,
    alertLevels: ['alarm']
  })

  deliver(
    createDelta('notifications.navigation.anchor', 'alert', 'Anchor drag alarm')
  )

  await waitForAsyncWork()

  assert.equal(sentMessages.length, 0)
  assert.ok(
    debugLogs.some((message) =>
      message.includes('Skipping notification with state: alert')
    )
  )
})

test('plugin handles malformed deltas without sending', async () => {
  const { notifier, sentMessages } = createNotifier()
  const { app, deliver, debugLogs } = createAppHarness()
  const plugin = createPlugin(app, createDependencies(notifier))

  plugin.start(TEST_OPTIONS)
  deliver({
    updates: [
      {
        values: [
          {
            path: 'notifications.navigation.anchor',
            value: {
              message: 'Missing state'
            }
          }
        ]
      }
    ]
  })

  await waitForAsyncWork()

  assert.equal(sentMessages.length, 0)
  assert.ok(
    debugLogs.some((message) =>
      message.includes('No valid notifications found in delta payload.')
    )
  )
})

test('plugin handles missing Signal K path data safely', async () => {
  const { notifier, sentMessages } = createNotifier()
  const { app, deliver, debugLogs } = createAppHarness()
  const plugin = createPlugin(app, createDependencies(notifier))

  plugin.start(TEST_OPTIONS)
  deliver(
    createDelta('notifications.navigation.anchor', 'alert', 'Anchor drag alarm')
  )

  await waitForAsyncWork()

  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0]?.fields.Value, 'n/a')
  assert.ok(
    debugLogs.some((message) =>
      message.includes('Unable to read Signal K path "navigation.anchor"')
    )
  )
})

test('plugin catches and logs Slack send failures', async () => {
  const { notifier } = createNotifier(async () => {
    throw new Error('webhook failed')
  })
  const { app, deliver, errorLogs, emittedEvents, statuses } = createAppHarness(
    {
      'navigation.anchor': {
        value: 0,
        meta: {
          units: 'C'
        }
      }
    }
  )
  const plugin = createPlugin(app, createDependencies(notifier))

  plugin.start(TEST_OPTIONS)
  deliver(
    createDelta('notifications.navigation.anchor', 'alert', 'Anchor drag alarm')
  )

  await waitForAsyncWork()

  assert.equal(emittedEvents.length, 0)
  assert.ok(
    errorLogs.some((message) =>
      message.includes('Failed to send Slack notification: webhook failed')
    )
  )
  assert.ok(
    statuses.some((message) =>
      message.includes('Failed to send Slack notification: webhook failed')
    )
  )
})

test('plugin stop clears pending timers and unsubscribes', async () => {
  const { notifier, sentMessages } = createNotifier()
  const harness = createAppHarness({
    'navigation.anchor': {
      value: 0,
      meta: {
        units: 'C'
      }
    }
  })
  const plugin = createPlugin(harness.app, createDependencies(notifier, 20))

  plugin.start(TEST_OPTIONS)
  harness.deliver(
    createDelta('notifications.navigation.anchor', 'alert', 'Anchor drag alarm')
  )
  plugin.stop()

  await waitForAsyncWork(50)

  assert.equal(sentMessages.length, 0)
  assert.equal(harness.unsubscribeCount(), 1)
  assert.equal(harness.statuses[harness.statuses.length - 1], 'Stopped')
})
