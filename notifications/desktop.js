const notifier = require('node-notifier');
const logger = require('../utils/logger');

function sendDesktopNotification(movieName) {
  try {
    logger.info(`Triggering desktop notification for ${movieName}...`);
    notifier.notify({
      title: '🎉 BookMyShow Tickets Open!',
      message: `Movie: ${movieName}\nBookMyShow booking is now available. Open the app to book immediately.`,
      sound: true,
      wait: true
    }, (err, response, metadata) => {
      if (err) {
        logger.error('Failed to trigger desktop notification', err);
      } else {
        logger.success('Desktop notification displayed successfully.');
      }
    });
  } catch (err) {
    logger.error('Error in desktop notification module', err);
  }
}

module.exports = sendDesktopNotification;
