const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const logger = require('./utils/logger');
const { getConfig, sleep } = require('./utils/helpers');
const launchBrowser = require('./browser/launch');
const openBookingPage = require('./browser/openBookingPage');
const { checkCinemaPresence, parseTargets } = require('./browser/checkCinema');
const { checkShowtimesBeforeCutoff } = require('./browser/checkShowtimes');
const { dispatchAllNotifications } = require('./notifications/manager');
const { dismissDesktopNotifications } = require('./notifications/desktop');
const { startNtfyListener, stopNtfyListener } = require('./notifications/ntfyListener');
const { startMockServer, stopMockServer } = require('./utils/mockServer');
const { resetScreenshotCounter, captureMilestone } = require('./utils/visual');

let browserInstance = null;
let alreadyNotified = false;
let inContinuousAlertLoop = false;
global.stopRequested = false;

function isStopCommand(raw) {
  if (!raw) return false;
  const str = String(raw).trim().toLowerCase();
  return (
    str === 'stop' ||
    str === 's' ||
    str === 'q' ||
    str === 'quit' ||
    str === 'exit' ||
    str === '12345' ||
    str.includes('stop')
  );
}

function requestStop(source = 'user command') {
  if (global.stopRequested) return;
  global.stopRequested = true;
  dismissDesktopNotifications();
  logger.success(`🛑 Stop requested (${source})! Halting continuous alerts immediately...`);
}

// Command line argument parser
const isDryRunArg = process.argv.includes('--dry-run');

/**
 * Halts execution until the user presses Enter or a timeout is reached
 */
function waitForEnter(timeoutMs) {
  return new Promise((resolve) => {
    const handle = setTimeout(() => {
      logger.info('Timeout reached. Automatically proceeding to shutdown...');
      process.stdin.pause();
      resolve();
    }, timeoutMs);

    logger.action(`\n👉 PRESS [ENTER] IN THIS CONSOLE OR WAIT ${timeoutMs / 1000} SECONDS TO CLOSE THE BROWSER...`);

    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => {
      clearTimeout(handle);
      process.stdin.pause();
      resolve();
    });
  });
}

async function main() {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    logger.error('Failed to load configuration files', err);
    process.exit(1);
  }

  // Override configuration with central environment variables if defined
  if (process.env.MOVIE_NAME) {
    config.movie.name = process.env.MOVIE_NAME;
  }
  if (process.env.MOVIE_CITY) {
    config.movie.city = process.env.MOVIE_CITY;
  }

  config.booking = config.booking || {};
  if (process.env.BOOKING_URL) {
    config.booking.url = process.env.BOOKING_URL.trim();
  }
  if (process.env.TARGET_CINEMA) {
    config.booking.cinemaText = process.env.TARGET_CINEMA.trim();
  }
  config.booking.targetTimeBefore =
    process.env.TARGET_TIME_BEFORE || config.booking.targetTimeBefore || '10:00 AM';

  // Override dryRun with command line arg if present
  if (isDryRunArg) {
    config.monitoring.dryRun = true;
  }

  logger.info('Starting BookMyShow Cinema & Early Showtime Monitor...');
  logger.info(`Mode: ${config.monitoring.dryRun ? 'DRY-RUN (Mock Simulation)' : 'PRODUCTION (BookMyShow Site)'}`);

  // Always start the local server on port 3000 to listen for the WhatsApp webhook
  try {
    const isDryRun = config.monitoring.dryRun;
    const serverUrl = await startMockServer(isDryRun);
    if (isDryRun) {
      config.booking.url = serverUrl;
      config.movie.name = 'Jailer 2';
      if (!config.booking.cinemaText) {
        config.booking.cinemaText = 'Karpagam';
      }
      logger.info(`Dry-run target URL: ${config.booking.url}`);
    } else {
      logger.info(`[Webhook] Webhook endpoint active at: http://localhost:3000/api/whatsapp/webhook`);
    }
  } catch (err) {
    logger.error('Failed to start local web server', err);
    process.exit(1);
  }

  // Start background ntfy topic listener to allow typing "stop" inside the mobile app
  if (config.notifications.ntfy && config.ntfy && config.ntfy.topic) {
    startNtfyListener(config.ntfy.topic, (receivedCmd) => {
      requestStop(`ntfy app command: "${receivedCmd}"`);
    });
  }

  // Validate the inputs before burning a browser launch
  if (!config.booking.url || config.booking.url.trim() === '') {
    logger.error('No booking URL configured. Set BOOKING_URL in .env and restart.');
    stopMockServer();
    process.exit(1);
  }

  const cinemaTargets = parseTargets(config.booking.cinemaText);
  if (cinemaTargets.length === 0) {
    logger.error('No cinema text configured. Set TARGET_CINEMA in .env and restart.');
    stopMockServer();
    process.exit(1);
  }

  const cutoffTime = config.booking.targetTimeBefore;
  logger.info(`Target page: ${config.booking.url}`);
  logger.info(`Watching for cinema text: ${cinemaTargets.join(' | ')}`);
  logger.info(`Filter condition: Showtime scheduled strictly BEFORE ${cutoffTime}`);

  // Graceful cleanup handler
  const cleanup = async (keepBrowserOpenDuration = 0) => {
    dismissDesktopNotifications();
    if (keepBrowserOpenDuration > 0 && browserInstance) {
      logger.info(`Keeping browser open for inspection...`);
      await waitForEnter(keepBrowserOpenDuration);
    }

    logger.info('Cleaning up resources and shutting down...');
    if (browserInstance) {
      try {
        await browserInstance.close();
        logger.success('✓ Browser closed.');
      } catch (err) {}
    }
    stopMockServer();
    stopNtfyListener();
    logger.success('✓ Cleanup complete. Monitor stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    if (inContinuousAlertLoop && !global.stopRequested) {
      requestStop('Ctrl+C shortcut');
    } else {
      cleanup(0);
    }
  });
  process.on('SIGTERM', () => cleanup(0));

  const monitorIntervalMs = config.simulation.monitorInterval || config.monitoring.intervalSeconds * 1000;
  let lastHeartbeatTime = Date.now();
  let initialStatusSent = false;

  while (true) {
    let browser = null;
    let page = null;

    try {
      resetScreenshotCounter();

      // --- STATE: Launching Browser ---
      logger.info('[Step 1/6] Launching Chromium...');
      const launchResult = await launchBrowser(config);
      browser = launchResult.browser;
      browserInstance = browser;
      page = launchResult.page;

      logger.success('✓ Browser started.');
      await captureMilestone(page, 'browser_started');

      // --- STATE: Direct navigation to the configured booking URL ---
      await openBookingPage(page, config);

      let activeCinemaName = cinemaTargets[0];
      let navigatedToCinemaPage = false;

      // Check if initial URL is already a cinema buytickets page
      const currentUrl = page.url();
      if (currentUrl.includes('/cinemas/') || currentUrl.includes('/cinema')) {
        navigatedToCinemaPage = true;
        logger.info(`[Step 2/6] Directly opened cinema page: ${currentUrl}`);
      }

      // --- STATE: Monitoring Loop ---
      while (true) {
        if (page.isClosed()) {
          throw new Error('Browser page was closed unexpectedly.');
        }

        // ==========================================
        // STAGE 1: Discover Cinema & Navigate to Link
        // ==========================================
        if (!navigatedToCinemaPage) {
          logger.action(`Scanning movie page for cinema "${cinemaTargets.join(' | ')}"...`);
          const cinemaResult = await checkCinemaPresence(page, config);

          if (!cinemaResult.found) {
            logger.warn(`Status: ${cinemaResult.reason}`);

            // Send initial status notification on first check
            if (!initialStatusSent) {
              initialStatusSent = true;
              lastHeartbeatTime = Date.now();
              if (config.notifications.twilioWhatsApp) {
                logger.info('Sending initial status verification to WhatsApp...');
                const sendWhatsAppNotification = require('./notifications/whatsapp');
                const heartbeatMsg = `🔍 *BMS Monitor Started:* Monitoring *${config.movie.name}* in *${config.movie.city}*. *${cinemaTargets.join(' / ')}* is not listed yet.`;
                sendWhatsAppNotification(config.movie.name, heartbeatMsg).catch((err) => {
                  logger.error('Failed to send initial WhatsApp alert:', err.message);
                });
              }
            } else {
              // Heartbeat status notification every 10 minutes
              const now = Date.now();
              if (now - lastHeartbeatTime >= 600000) {
                lastHeartbeatTime = now;
                if (config.notifications.twilioWhatsApp) {
                  logger.info('Sending status verification heartbeat to WhatsApp...');
                  const sendWhatsAppNotification = require('./notifications/whatsapp');
                  const heartbeatMsg = `🔍 *BMS Monitor:* *${cinemaTargets.join(' / ')}* is not listed yet for *${config.movie.name}* in *${config.movie.city}*. Monitoring active every ${monitorIntervalMs / 1000}s.`;
                  sendWhatsAppNotification(config.movie.name, heartbeatMsg).catch((err) => {
                    logger.error('Failed to send heartbeat WhatsApp alert:', err.message);
                  });
                }
              }
            }

            logger.info(`Retrying cinema check in ${monitorIntervalMs / 1000} seconds...`);
            await sleep(monitorIntervalMs);
            logger.action('Reloading movie page to check for newly added cinemas...');
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(config.simulation.pageLoadDelay || 2000);
            await openBookingPage.waitForShowtimesList(page);
            continue;
          }

          // Cinema found on movie page!
          activeCinemaName = cinemaResult.targetCinema || cinemaResult.matched[0] || cinemaTargets[0];
          logger.success(`🎉 TARGET CINEMA FOUND: ${activeCinemaName}`);
          await captureMilestone(page, 'cinema_found');

          // If a dedicated cinema page URL exists, navigate to the "new link"
          if (cinemaResult.cinemaUrl) {
            logger.action(`Navigating to the cinema's new link: ${cinemaResult.cinemaUrl}`);
            await page.goto(cinemaResult.cinemaUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(config.simulation.pageLoadDelay || 2000);
            await openBookingPage.waitForShowtimesList(page);
            await captureMilestone(page, 'cinema_new_link_loaded');
          }

          navigatedToCinemaPage = true;
        }

        // ========================================================
        // STAGE 2: Scan Movie Showtimes Scheduled Before Cutoff Time
        // ========================================================
        logger.action(`Checking for movie showtimes before ${cutoffTime} at ${activeCinemaName}...`);
        const showtimesResult = await checkShowtimesBeforeCutoff(page, config);

        if (showtimesResult.found) {
          const matchedTimes = showtimesResult.matchingShowtimes.map((s) => s.time).join(', ');
          logger.success(`🎉 SHOWTIME FOUND BEFORE ${cutoffTime}! Times: ${matchedTimes}`);
          await captureMilestone(page, 'showtime_found');

          const alertLabel = `${config.movie.name} @ ${activeCinemaName} (${matchedTimes})`;
          const customAlertMsg = `🎉 *EARLY SHOW AVAILABLE!* Tickets for *${config.movie.name}* at *${activeCinemaName}* are open for *${matchedTimes}* (< ${cutoffTime})! Book now: ${page.url()}`;

          if (!alreadyNotified) {
            alreadyNotified = true;

            // Trigger notifications
            logger.info('Triggering initial alerts across all configured channels...');
            await dispatchAllNotifications(alertLabel, config, customAlertMsg, page.url(), { isContinuous: false });

            // Continuous rapid alert loop across all active notification channels (ntfy, desktop, whatsapp, etc.)
            inContinuousAlertLoop = true;
            global.stopRequested = false;

            logger.action('\n================================================================================');
            logger.action('🚨🚨🚨 TICKETS ARE LIVE! CONTINUOUS RAPID ALERTS ACTIVE 🚨🚨🚨');
            logger.action('👉 TO STOP ALERTS (ANY OF THESE):');
            logger.action('   1. Type "stop" (or "STOP", "s", "q") + [ENTER] in this console');
            logger.action('   2. OR inside the mobile ntfy app: type "stop" + Send, or tap [🛑 Stop Alerts]');
            logger.action('   3. OR press [Ctrl+C] in this console');
            logger.action('   4. OR open http://localhost:3000/stop in your browser');
            logger.action('================================================================================\n');

            // Setup robust case-insensitive readline listener + raw stdin listener
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
              terminal: false
            });

            const onConsoleInput = (input) => {
              if (isStopCommand(input)) {
                requestStop(`console input: "${String(input).trim()}"`);
              }
            };

            rl.on('line', onConsoleInput);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', onConsoleInput);

            let alertCount = 0;
            const gapMs = parseInt(process.env.ALERT_GAP_MS, 10) || 300;

            while (!global.stopRequested) {
              alertCount++;
              logger.info(`[Continuous Alert #${alertCount}] Broadcasting alerts (type "stop" or "STOP" to silence)...`);
              await dispatchAllNotifications(alertLabel, config, customAlertMsg, page.url(), { isContinuous: true });

              if (global.stopRequested) break;

              // Fast micro-check loop every 50ms so stop command is acted upon instantaneously (no 3s delay)
              for (let elapsed = 0; elapsed < gapMs && !global.stopRequested; elapsed += 50) {
                await sleep(Math.min(50, gapMs - elapsed));
              }

              if (alertCount % 10 === 0) {
                logger.action(`🔔 Sent ${alertCount} continuous alerts. Type "stop" + [ENTER] or visit http://localhost:3000/stop to silence.`);
              }
            }

            try {
              rl.close();
              process.stdin.removeListener('data', onConsoleInput);
            } catch (e) {}

            inContinuousAlertLoop = false;
            logger.success('✅ Continuous alert loop silenced. Booking page remains open for seat selection!');
          } else {
            logger.info('Showtime already reported. Duplicate alerts suppressed.');
          }

          // Keep browser open so user can book tickets
          await cleanup(config.simulation.keepBrowserOpenAfterSuccess || 1800000);
          return;
        } else {
          logger.warn(`Status: ${showtimesResult.reason}`);

          // Initial status notification on first check
          if (!initialStatusSent) {
            initialStatusSent = true;
            lastHeartbeatTime = Date.now();
            if (config.notifications.twilioWhatsApp) {
              const allTimesStr = showtimesResult.allShowtimes.map((s) => s.time).join(', ') || 'None';
              logger.info('Sending initial status verification to WhatsApp...');
              const sendWhatsAppNotification = require('./notifications/whatsapp');
              const heartbeatMsg = `🔍 *BMS Monitor Connected:* *${activeCinemaName}* is open (${allTimesStr}), waiting for showtimes before *${cutoffTime}* for *${config.movie.name}*.`;
              sendWhatsAppNotification(config.movie.name, heartbeatMsg).catch((err) => {
                logger.error('Failed to send initial WhatsApp alert:', err.message);
              });
            }
            if (config.notifications.ntfy) {
              const sendPushNotification = require('./notifications/push');
              sendPushNotification(config.movie.name, `🔍 BMS Monitor Connected: Watching ${activeCinemaName} for showtimes before ${cutoffTime}!`, page.url());
            }
          } else {
            // Heartbeat status notification every 10 minutes
            const now = Date.now();
            if (now - lastHeartbeatTime >= 600000) {
              lastHeartbeatTime = now;
              if (config.notifications.twilioWhatsApp) {
                const allTimesStr = showtimesResult.allShowtimes.map((s) => s.time).join(', ') || 'None';
                logger.info('Sending status verification heartbeat to WhatsApp...');
                const sendWhatsAppNotification = require('./notifications/whatsapp');
                const heartbeatMsg = `🔍 *BMS Monitor:* *${activeCinemaName}* has shows (${allTimesStr}), but no show before *${cutoffTime}* yet for *${config.movie.name}*. Checking every ${monitorIntervalMs / 1000}s.`;
                sendWhatsAppNotification(config.movie.name, heartbeatMsg).catch((err) => {
                  logger.error('Failed to send heartbeat WhatsApp alert:', err.message);
                });
              }
            }
          }

          logger.info(`Retrying showtimes check in ${monitorIntervalMs / 1000} seconds...`);
        }

        // Wait for interval
        await sleep(monitorIntervalMs);

        // Reload cinema page to catch new showtimes the instant they are added
        logger.action('Reloading cinema showtimes page...');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(config.simulation.pageLoadDelay || 2000);
        await openBookingPage.waitForShowtimesList(page);
      }
    } catch (err) {
      logger.error('Error encountered in monitoring loop. Attempting recovery and browser restart in 10 seconds...', err);

      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {}
        browserInstance = null;
      }

      await sleep(10000);
    }
  }
}

main();
