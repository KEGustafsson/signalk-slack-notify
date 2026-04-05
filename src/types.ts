export const ALERT_LEVELS = [
  'normal',
  'alert',
  'warn',
  'alarm',
  'emergency'
] as const

export const DEFAULT_ALERT_LEVELS = [
  'alert',
  'warn',
  'alarm',
  'emergency'
] as const

export const DEFAULT_SLACK_CHANNEL = '#alert'
export const DEFAULT_SLACK_TITLE = 'Signal K notifications to Slack'
export const FALLBACK_DISPLAY_VALUE = 'n/a'
export const NOTIFICATION_PREFIX = 'notifications.'
export const NOTIFICATION_SUBSCRIPTION = {
  context: 'vessels.self',
  subscribe: [
    {
      path: 'notifications.*',
      policy: 'instant'
    }
  ]
} as const
export const SEND_DELAY_MS = 1000

export type AlertLevel = (typeof ALERT_LEVELS)[number]
export type Unsubscribe = () => void
export type StatusSetter = (message: string) => void
export type ScheduledHandle = ReturnType<typeof setTimeout>

export interface PluginOptions {
  webhook: string
  slackTitle?: string
  slackChannel?: string
  alertLevels?: readonly AlertLevel[]
}

export interface NormalizedPluginOptions extends PluginOptions {
  slackTitle: string
  slackChannel: string
}

export interface SignalKDelta {
  updates?: unknown
}

export interface SignalKPathData {
  value?: unknown
  meta?: {
    units?: unknown
  } | null
  timestamp?: unknown
}

export interface SignalKSubscription {
  context: 'vessels.self'
  subscribe: readonly [
    {
      path: 'notifications.*'
      policy: 'instant'
    }
  ]
}

export interface SubscriptionManager {
  subscribe(
    subscription: SignalKSubscription,
    unsubscribes: Unsubscribe[],
    onError: (error: unknown) => void,
    onDelta: (delta: SignalKDelta) => void
  ): void
}

export interface SignalKApp {
  debug(message: string): void
  error(message: string): void
  setPluginStatus?: StatusSetter
  setProviderStatus?: StatusSetter
  subscriptionmanager: SubscriptionManager
  getSelfPath(path: string): SignalKPathData
  emit(eventName: 'connectionwrite', payload: { providerId: string }): void
}

export interface SlackFields {
  [key: string]: string
  'Signal K path': string
  State: string
  Message: string
  Value: string
  Timestamp: string
}

export interface SlackMessage {
  channel: string
  text: string
  fields: SlackFields
}

export interface SlackNotifier {
  send(message: SlackMessage): Promise<void>
}

export interface FormattedMeasurement {
  valueText: string
  unitLabel: string
}

export interface ParsedNotification {
  notificationPath: string
  dataPath: string
  state: string
  message: string
  timestamp: string
}

export interface PluginDependencies {
  createSlackNotifier(webhookUrl: string): SlackNotifier
  schedule(callback: () => void, delayMs: number): ScheduledHandle
  cancelSchedule(handle: ScheduledHandle): void
  emitAsync(callback: () => void): void
}

export interface PluginSchema {
  type: 'object'
  required: readonly ['webhook']
  properties: {
    webhook: {
      type: 'string'
      title: string
    }
    slackTitle: {
      type: 'string'
      title: string
    }
    slackChannel: {
      type: 'string'
      title: string
      default: string
    }
    alertLevels: {
      type: 'array'
      title: string
      description: string
      uniqueItems?: true
      items: {
        type: 'string'
        enum: readonly AlertLevel[]
      }
      default: readonly AlertLevel[]
    }
  }
}

export interface SignalKPlugin {
  id: string
  name: string
  description: string
  start(options: PluginOptions): void
  stop(): void
  schema: PluginSchema
}
