"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEND_DELAY_MS = exports.NOTIFICATION_SUBSCRIPTION = exports.NOTIFICATION_PREFIX = exports.FALLBACK_DISPLAY_VALUE = exports.DEFAULT_SLACK_TITLE = exports.DEFAULT_SLACK_CHANNEL = exports.DEFAULT_ALERT_LEVELS = exports.ALERT_LEVELS = void 0;
exports.ALERT_LEVELS = [
    'normal',
    'alert',
    'warn',
    'alarm',
    'emergency'
];
exports.DEFAULT_ALERT_LEVELS = [
    'alert',
    'warn',
    'alarm',
    'emergency'
];
exports.DEFAULT_SLACK_CHANNEL = '#alert';
exports.DEFAULT_SLACK_TITLE = 'Signal K notifications to Slack';
exports.FALLBACK_DISPLAY_VALUE = 'n/a';
exports.NOTIFICATION_PREFIX = 'notifications.';
exports.NOTIFICATION_SUBSCRIPTION = {
    context: 'vessels.self',
    subscribe: [
        {
            path: 'notifications.*',
            policy: 'instant'
        }
    ]
};
exports.SEND_DELAY_MS = 1000;
