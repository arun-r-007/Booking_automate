const logger = require('../utils/logger');
const sendDesktopNotification = require('./desktop');
const sendTelegramNotification = require('./telegram');
const sendPushNotification = require('./push');
const triggerPhoneCall = require('./phoneCall');
const sendSMSNotification = require('./sms');
const sendWhatsAppNotification = require('./whatsapp');

async function dispatchAllNotifications(movieName, config, customMessage = null, clickUrl = null, options = {}) {
  if (global.stopRequested) return;

  const isContinuous = options.isContinuous || false;
  logger.info(`Dispatching availability alerts for "${movieName}"...`);
  const activeChannels = [];
  const promises = [];

  // Desktop notification is only sent on initial alert to prevent queuing up dozens of Windows Action Center toasts
  if (config.notifications.desktop && !isContinuous && !global.stopRequested) {
    activeChannels.push('Desktop');
    try {
      sendDesktopNotification(movieName);
    } catch (err) {
      logger.error('Desktop notification failed to execute', err);
    }
  }

  if (config.notifications.telegram) {
    activeChannels.push('Telegram');
    promises.push(sendTelegramNotification(movieName));
  }

  if (config.notifications.ntfy) {
    activeChannels.push('Push (ntfy.sh)');
    promises.push(sendPushNotification(movieName, customMessage, clickUrl));
  }

  if (config.notifications.twilioVoice) {
    activeChannels.push('Twilio Phone Call');
    promises.push(triggerPhoneCall(movieName));
  }

  if (config.notifications.twilioSMS) {
    activeChannels.push('Twilio SMS');
    promises.push(sendSMSNotification(movieName));
  }

  if (config.notifications.twilioWhatsApp) {
    activeChannels.push('Twilio WhatsApp');
    promises.push(sendWhatsAppNotification(movieName, customMessage));
  }

  logger.info(`Active alert channels triggered: ${activeChannels.join(', ') || 'None'}`);

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
  logger.success('All notification dispatches completed.');
}

module.exports = { dispatchAllNotifications };
