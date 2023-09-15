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

    app.subscriptionmanager.subscribe(
      notificationsSubscription,
      unsubscribes,
      (subscriptionError) => {
        app.error('Error:' + subscriptionError)
      },
      (delta) => {
        delta.updates.forEach((u) => {
          slack.send({
            channel: options.slackChannel,
            text: options.slackTitle,
            fields: {
              'Signal K path': u.values[0].path,
              State: u.values[0].value.state,
              Message: u.values[0].value.message,
              Timestamp: u.values[0].value.timestamp
            }
          })
          setImmediate(() =>
            app.emit('connectionwrite', { providerId: plugin.id })
          )
          app.debug(JSON.stringify(u, null, 2));
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
      }
    }
  }

  return plugin
}
