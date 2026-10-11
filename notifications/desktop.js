const notifier = require('node-notifier');
const logger = require('../utils/logger');

let lastDesktopTime = 0;

function sendDesktopNotification(movieName) {
  try {
    const now = Date.now();
    // Prevent flooding Windows Toast engine if called rapidly
    if (now - lastDesktopTime < 2000) {
      return;
    }
    lastDesktopTime = now;

    logger.info(`Triggering desktop notification for ${movieName}...`);
    notifier.notify({
      title: '🎉 BookMyShow Tickets Open!',
      message: `Movie: ${movieName}\nBookMyShow booking is now available. Open the app to book immediately.`,
      sound: true,
      wait: false
    }, (err) => {
      if (err) {
        logger.error('Failed to trigger desktop notification', err.message || err);
      } else {
        logger.success('Desktop notification displayed successfully.');
      }
    });
  } catch (err) {
    logger.error('Error in desktop notification module', err);
  }
}

module.exports = sendDesktopNotification;
