const axios = require('axios');
const logger = require('../utils/logger');

async function sendPushNotification(movieName, customMessage = null, clickUrl = null) {
  const config = require('../utils/helpers').getConfig();
  const topic = config.ntfy.topic;

  if (!topic) {
    logger.warn('ntfy topic is not configured. Skipping push notification.');
    return;
  }

  try {
    logger.info(`Sending ntfy push notification to topic: ${topic}...`);
    const headers = {
      'Title': 'BookMyShow Early Ticket Alert',
      'Priority': 'urgent',
      'Tags': 'tada,movie,ticket'
    };

    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    const bodyText =
      customMessage ||
      `🎉 Tickets Open for ${movieName}! BookMyShow booking is now live. Open the app to book now.`;

    await axios.post(`https://ntfy.sh/${topic}`, bodyText, { headers });
    logger.success('✓ Push notification sent successfully via ntfy.sh.');
  } catch (err) {
    if (err.response && err.response.status === 429) {
      logger.warn('Push notification rate-limited by ntfy.sh (HTTP 429). Will retry on next alert cycle.');
    } else {
      logger.error('Failed to send push notification via ntfy.sh', err.message || err);
    }
  }
}

module.exports = sendPushNotification;
