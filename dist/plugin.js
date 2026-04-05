"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlugin = createPlugin;
const slack_notify_1 = __importDefault(require("slack-notify"));
const types_1 = require("./types");
const helpers_1 = require("./helpers");
const PLUGIN_ID = 'signalk-slack-notify';
const PLUGIN_NAME = 'Signal K notifications to Slack';
const PLUGIN_DESCRIPTION = 'Send notifications from Signal K to Slack using Webhook API';
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
            default: types_1.DEFAULT_SLACK_CHANNEL
        },
        alertLevels: {
            type: 'array',
            title: 'Slack notification levels',
            description: 'Choose which notification states are forwarded to Slack. Leave this empty to forward every state.',
            uniqueItems: true,
            items: {
                type: 'string',
                enum: types_1.ALERT_LEVELS
            },
            default: types_1.DEFAULT_ALERT_LEVELS
        }
    }
};
const defaultDependencies = {
    createSlackNotifier: (webhookUrl) => (0, slack_notify_1.default)(webhookUrl),
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancelSchedule: (handle) => clearTimeout(handle),
    emitAsync: (callback) => setImmediate(callback)
};
function safeGetSelfPath(app, path) {
    try {
        return app.getSelfPath(path);
    }
    catch (error) {
        app.debug(`Unable to read Signal K path "${path}": ${(0, helpers_1.formatError)(error)}`);
        return undefined;
    }
}
function isSelectedLevel(selectedLevels, notificationState) {
    return selectedLevels.some((level) => level === notificationState);
}
function normalizeOptions(options) {
    return {
        ...options,
        slackChannel: options.slackChannel ?? types_1.DEFAULT_SLACK_CHANNEL,
        slackTitle: options.slackTitle ?? types_1.DEFAULT_SLACK_TITLE
    };
}
function fallbackMeasurement(rawValue, rawUnits) {
    return {
        valueText: (0, helpers_1.stringifyValue)(rawValue),
        unitLabel: typeof rawUnits === 'string' ? rawUnits : ''
    };
}
function createPlugin(app, dependencies = defaultDependencies) {
    let unsubscribes = [];
    const pendingTimers = new Set();
    let isStopped = true;
    const setStatus = app.setPluginStatus ?? app.setProviderStatus;
    function clearPendingTimers() {
        for (const timer of pendingTimers) {
            dependencies.cancelSchedule(timer);
        }
        pendingTimers.clear();
    }
    function resetRuntime() {
        isStopped = true;
        clearPendingTimers();
        for (const unsubscribe of unsubscribes) {
            unsubscribe();
        }
        unsubscribes = [];
    }
    async function sendNotification(slack, options, notification) {
        if (isStopped) {
            return;
        }
        const slackData = safeGetSelfPath(app, notification.dataPath);
        const rawValue = slackData?.value;
        const rawUnits = slackData?.meta?.units;
        let measurement;
        try {
            measurement = (0, helpers_1.formatMeasurement)(rawValue, rawUnits);
        }
        catch (error) {
            app.debug(`Unable to format value for "${notification.dataPath}": ${(0, helpers_1.formatError)(error)}`);
            measurement = fallbackMeasurement(rawValue, rawUnits);
        }
        try {
            await slack.send((0, helpers_1.buildSlackMessage)(options, types_1.DEFAULT_SLACK_TITLE, notification, measurement));
            dependencies.emitAsync(() => {
                app.emit('connectionwrite', { providerId: PLUGIN_ID });
            });
        }
        catch (error) {
            const errorMessage = `Failed to send Slack notification: ${(0, helpers_1.formatError)(error)}`;
            app.error(errorMessage);
            setStatus?.(errorMessage);
        }
    }
    function stop() {
        resetRuntime();
        setStatus?.('Stopped');
    }
    function start(options) {
        resetRuntime();
        isStopped = false;
        const normalizedOptions = normalizeOptions(options);
        const slack = dependencies.createSlackNotifier(normalizedOptions.webhook);
        const selectedLevels = normalizedOptions.alertLevels ?? [];
        app.debug(`${PLUGIN_NAME} started`);
        setStatus?.('Running');
        app.subscriptionmanager.subscribe(types_1.NOTIFICATION_SUBSCRIPTION, unsubscribes, (subscriptionError) => {
            const errorMessage = `Subscription error: ${(0, helpers_1.formatError)(subscriptionError)}`;
            app.error(errorMessage);
            setStatus?.(errorMessage);
        }, (delta) => {
            const notifications = (0, helpers_1.extractNotifications)(delta);
            if (notifications.length === 0) {
                app.debug('No valid notifications found in delta payload.');
                return;
            }
            for (const notification of notifications) {
                if (selectedLevels.length > 0 &&
                    !isSelectedLevel(selectedLevels, notification.state)) {
                    app.debug(`Skipping notification with state: ${notification.state}`);
                    continue;
                }
                const timer = dependencies.schedule(() => {
                    pendingTimers.delete(timer);
                    void sendNotification(slack, normalizedOptions, notification);
                }, types_1.SEND_DELAY_MS);
                pendingTimers.add(timer);
            }
        });
    }
    return {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        description: PLUGIN_DESCRIPTION,
        start,
        stop,
        schema: pluginSchema
    };
}
