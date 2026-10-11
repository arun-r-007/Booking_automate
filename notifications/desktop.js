const notifier = require('node-notifier');
const logger = require('../utils/logger');

let hasNotifiedDesktop = false;

function sendDesktopNotification(movieName) {
  // If user already stopped alerts or desktop toast was already shown, don't spam Windows
  if (global.stopRequested || hasNotifiedDesktop) {
    return;
  }
  hasNotifiedDesktop = true;

  try {
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

function dismissDesktopNotifications() {
  hasNotifiedDesktop = false;
  if (process.platform === 'win32') {
    try {
      const { exec } = require('child_process');
      exec('taskkill /F /IM snoretoast.exe /T 2>nul', () => {});
      exec('taskkill /F /IM snoretoast-x64.exe /T 2>nul', () => {});
      exec('taskkill /F /IM snoretoast-x86.exe /T 2>nul', () => {});
    } catch (e) {}
  }
}

function resetDesktopNotification() {
  hasNotifiedDesktop = false;
}

module.exports = sendDesktopNotification;
module.exports.sendDesktopNotification = sendDesktopNotification;
module.exports.dismissDesktopNotifications = dismissDesktopNotifications;
module.exports.resetDesktopNotification = resetDesktopNotification;
