const SlackNotify = require('slack-notify')

module.exports = function createPlugin(app) {
  const plugin = {}
  plugin.id = 'signalk-slack-notify'
  plugin.name = 'Signal K notifications to Slack'
  plugin.description =
    'Send notifications from Signal K to Slack using Webhook API'
  var unsubscribes = []

  // eslint-disable-next-line no-unused-vars
  const setStatus = app.setPluginStatus || app.setProviderStatus

  plugin.start = function (options) {
    app.debug('Signal K notifications to Slack started')
    const slack = SlackNotify(options.webhook)
    const notificationsSubscription = {
      context: 'vessels.self',
      subscribe: [
        {
          path: 'notifications.*',
          policy: 'instant'
        }
      ]
    }

    function kelvinToCelsius(kelvin) {
      if (kelvin < 0) {
        throw new Error('Temperature in Kelvin cannot be negative')
      }
      return (kelvin - 273.15).toFixed(1) // Conversion formula
    }

    function msToKnots(metersPerSecond) {
      if (metersPerSecond < 0) {
        throw new Error('Speed in meters per second cannot be negative')
      }
      return (metersPerSecond * 1.94384449).toFixed(1) // Conversion factor
    }

    function radToDeg(radians) {
      return ((radians * 180) / Math.PI).toFixed(1) // Conversion formula
    }

    app.subscriptionmanager.subscribe(
      notificationsSubscription,
      unsubscribes,
      (subscriptionError) => {
        app.error('Error:' + subscriptionError)
      },
      (delta) => {
        delta.updates.forEach((u) => {
          const notificationState = u.values[0].value.state          
          const selectedLevels = options.alertLevels || []
          if (selectedLevels.length > 0 && !selectedLevels.includes(notificationState)) {
            app.debug(`Skipping notification with state: ${notificationState}`)
            return
          }
          const slackPath = u.values[0].path.replace(/^notifications\./, '')
          let slackValue
          let slackUnits
          let slackData

          setTimeout(function () {
            try {
              slackData = app.getSelfPath(slackPath)
              slackValue = slackData.value || null
              slackUnits = slackData.meta.units || null
            } catch (error) {
              slackValue = 'NaN'
              slackUnits = ''
              app.debug(error)
            }
            if (slackUnits == 'K') {
              slackValue = kelvinToCelsius(slackValue)
              slackUnits = ' °C'
            }
            if (slackUnits == 'm/s') {
              slackValue = msToKnots(slackValue)
              slackUnits = ' kn'
            }
            if (slackUnits == 'rad') {
              slackValue = radToDeg(slackValue)
              slackUnits = ' deg'
            }
            slack.send({
              channel: options.slackChannel,
              text: options.slackTitle,
              fields: {
                'Signal K path': u.values[0].path,
                State: notificationState,
                Message: u.values[0].value.message,
                Value: slackValue + slackUnits,
                Timestamp: u.values[0].value.timestamp
              }
            })
            setImmediate(() =>
              app.emit('connectionwrite', { providerId: plugin.id })
            )
            app.debug(JSON.stringify(u, null, 2))
          }, 1000)
        })
      }
    )
  }

  plugin.stop = function stop() {
    unsubscribes.forEach((f) => f())
    unsubscribes = []
  }

  plugin.schema = {
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
        default: '#alert'
      },
      alertLevels: {
        type: 'array',
        title: 'Alert levels to send',
        description: 'Select which alert levels should trigger Slack notifications (leave empty to send all)',
        items: {
          type: 'string',
          enum: ['normal', 'alert', 'warn', 'alarm', 'emergency']
        },
        default: ['alert', 'warn', 'alarm', 'emergency']
      }
    }
  }

  return plugin
}
