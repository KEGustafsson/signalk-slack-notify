"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kelvinToCelsius = kelvinToCelsius;
exports.metersPerSecondToKnots = metersPerSecondToKnots;
exports.radiansToDegrees = radiansToDegrees;
exports.formatError = formatError;
exports.stringifyValue = stringifyValue;
exports.normalizeUnitLabel = normalizeUnitLabel;
exports.formatMeasurement = formatMeasurement;
exports.combineValueAndUnit = combineValueAndUnit;
exports.extractNotifications = extractNotifications;
exports.buildSlackMessage = buildSlackMessage;
const types_1 = require("./types");
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function asNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0
        ? value
        : undefined;
}
function formatNumber(value) {
    return value.toFixed(1);
}
function kelvinToCelsius(kelvin) {
    if (kelvin < 0) {
        throw new Error('Temperature in Kelvin cannot be negative');
    }
    return kelvin - 273.15;
}
function metersPerSecondToKnots(metersPerSecond) {
    if (metersPerSecond < 0) {
        throw new Error('Speed in meters per second cannot be negative');
    }
    return metersPerSecond * 1.94384449;
}
function radiansToDegrees(radians) {
    return (radians * 180) / Math.PI;
}
function formatError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        const serialized = JSON.stringify(error);
        return serialized ?? String(error);
    }
    catch {
        return String(error);
    }
}
function stringifyValue(value) {
    switch (typeof value) {
        case 'number':
            return Number.isFinite(value) ? value.toString() : types_1.FALLBACK_DISPLAY_VALUE;
        case 'string':
            return value;
        case 'boolean':
            return value ? 'true' : 'false';
        case 'bigint':
            return value.toString();
        case 'undefined':
            return types_1.FALLBACK_DISPLAY_VALUE;
        case 'object':
            if (value === null) {
                return types_1.FALLBACK_DISPLAY_VALUE;
            }
            try {
                return JSON.stringify(value) ?? types_1.FALLBACK_DISPLAY_VALUE;
            }
            catch {
                return types_1.FALLBACK_DISPLAY_VALUE;
            }
        default:
            return types_1.FALLBACK_DISPLAY_VALUE;
    }
}
function normalizeUnitLabel(unit) {
    if (unit === 'C') {
        return '°C';
    }
    return typeof unit === 'string' ? unit : '';
}
function formatMeasurement(value, unit) {
    const unitLabel = typeof unit === 'string' ? unit : '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        switch (unitLabel) {
            case 'K':
                return {
                    valueText: formatNumber(kelvinToCelsius(value)),
                    unitLabel: '°C'
                };
            case 'm/s':
                return {
                    valueText: formatNumber(metersPerSecondToKnots(value)),
                    unitLabel: 'kn'
                };
            case 'rad':
                return {
                    valueText: formatNumber(radiansToDegrees(value)),
                    unitLabel: 'deg'
                };
            case 'C':
                return {
                    valueText: stringifyValue(value),
                    unitLabel: '°C'
                };
            default:
                return {
                    valueText: stringifyValue(value),
                    unitLabel
                };
        }
    }
    return {
        valueText: stringifyValue(value),
        unitLabel: normalizeUnitLabel(unit)
    };
}
function combineValueAndUnit(measurement) {
    return measurement.unitLabel.length > 0
        ? `${measurement.valueText} ${measurement.unitLabel}`
        : measurement.valueText;
}
function extractNotifications(delta) {
    if (!Array.isArray(delta.updates)) {
        return [];
    }
    const notifications = [];
    for (const update of delta.updates) {
        if (!isRecord(update) || !Array.isArray(update.values)) {
            continue;
        }
        const timestamp = asNonEmptyString(update.timestamp) ?? types_1.FALLBACK_DISPLAY_VALUE;
        for (const valueEntry of update.values) {
            if (!isRecord(valueEntry)) {
                continue;
            }
            const notificationPath = asNonEmptyString(valueEntry.path);
            if (notificationPath === undefined ||
                !notificationPath.startsWith(types_1.NOTIFICATION_PREFIX)) {
                continue;
            }
            const payload = valueEntry.value;
            if (!isRecord(payload)) {
                continue;
            }
            const state = asNonEmptyString(payload.state);
            const message = asNonEmptyString(payload.message) ?? types_1.FALLBACK_DISPLAY_VALUE;
            if (state === undefined) {
                continue;
            }
            const dataPath = notificationPath.slice(types_1.NOTIFICATION_PREFIX.length);
            if (dataPath.length === 0) {
                continue;
            }
            notifications.push({
                notificationPath,
                dataPath,
                state,
                message,
                timestamp
            });
        }
    }
    return notifications;
}
function buildSlackMessage(options, defaultTitle, notification, measurement) {
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
    };
}
