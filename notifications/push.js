const axios = require('axios');
const logger = require('../utils/logger');

async function sendPushNotification(movieName, customMessage = null, clickUrl = null, options = {}) {
  const config = require('../utils/helpers').getConfig();
  const topic = config.ntfy.topic;

  if (!topic) {
    logger.warn('ntfy topic is not configured. Skipping push notification.');
    return;
  }

  const isAlert = options.isAlert !== false;

  try {
    logger.info(`Sending ntfy push notification to topic: ${topic}...`);
    const headers = {
      'Title': options.title || (isAlert ? 'BookMyShow Early Ticket Alert' : 'BMS Monitor Status Update'),
      'Priority': options.priority || (isAlert ? 'urgent' : 'default'),
      'Tags': options.tags || (isAlert ? 'tada,movie,ticket' : 'hourglass,mag')
    };

    if (isAlert) {
      headers['Actions'] = `view, 🎟️ Book Now, ${clickUrl || 'https://in.bookmyshow.com'}; http, 🛑 Stop Alerts, https://ntfy.sh/${topic}, method=POST, body=stop`;
    } else if (clickUrl) {
      headers['Actions'] = `view, 🎟️ View Showtimes, ${clickUrl}`;
    }

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
