const logger = require('../utils/logger');
const { highlightElement } = require('../utils/visual');

/**
 * Parses a time string like "12:30 PM", "04:00 AM", "7:30 AM", "10:00 AM"
 * Returns minutes from midnight (0 - 1439), or null if unparseable.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const cleaned = String(timeStr).replace(/\u00a0/g, ' ').trim();
  const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'AM') {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return hour * 60 + minute;
}

/**
 * Checks if a given showtime is before the cutoff time.
 * E.g., timeStr = "07:00 AM", cutoffStr = "10:00 AM" -> true
 * timeStr = "12:30 PM", cutoffStr = "10:00 AM" -> false
 */
function isTimeBeforeCutoff(timeStr, cutoffStr = '10:00 AM') {
  const timeMinutes = parseTimeToMinutes(timeStr);
  const cutoffMinutes = parseTimeToMinutes(cutoffStr);

  if (timeMinutes === null || cutoffMinutes === null) {
    return false;
  }

  return timeMinutes < cutoffMinutes;
}

/**
 * Extracts showtime elements and their text from the page.
 * Looks for BookMyShow time pills:
 * - div[role="button"][aria-label*="Book "]
 * - [aria-label*="Book "]
 * - class*="sc-yr56qh" / class*="sc-1skzbbo"
 * - buttons/spans containing time regex
 */
async function extractShowtimesFromPage(page) {
  return await page.evaluate(() => {
    const results = [];
    const seenTimes = new Set();

    // 1. Check all elements with aria-label containing "Book "
    const ariaButtons = document.querySelectorAll('[aria-label*="Book "], [aria-label*="book "]');
    ariaButtons.forEach((btn) => {
      const label = btn.getAttribute('aria-label') || '';
      const match = label.match(/Book\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
      if (match) {
        const time = match[1].trim();
        if (!seenTimes.has(time)) {
          seenTimes.add(time);
          // Try to get format text (e.g. DOLBY ATMOS)
          const subtitle = btn.querySelector('.sc-yr56qh-2, [class*="sc-yr56qh-2"], span:last-child');
          const format = subtitle ? subtitle.innerText.trim() : '';
          results.push({
            time,
            format,
            rawText: label,
            selector: `[aria-label="${label}"]`
          });
        }
      }
    });

    // 2. Check elements with standard time classes or regex if aria-label was not found
    if (results.length === 0) {
      const candidates = document.querySelectorAll('[role="button"], a, div[class*="sc-yr56qh-0"], div[class*="sc-1skzbbo"]');
      candidates.forEach((el) => {
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
        if (timeMatch) {
          const time = timeMatch[1].trim();
          if (!seenTimes.has(time)) {
            seenTimes.add(time);
            results.push({
              time,
              format: text.replace(time, '').trim(),
              rawText: text,
              selector: `text="${time}"`
            });
          }
        }
      });
    }

    return results;
  });
}

/**
 * Checks for movie showtimes scheduled before the configured cutoff time (default: 10:00 AM).
 */
async function checkShowtimesBeforeCutoff(page, config) {
  const cutoffTime = config.booking?.targetTimeBefore || process.env.TARGET_TIME_BEFORE || '10:00 AM';

  try {
    const allShowtimes = await extractShowtimesFromPage(page);

    if (allShowtimes.length === 0) {
      return {
        found: false,
        allShowtimes: [],
        matchingShowtimes: [],
        cutoffTime,
        reason: 'No showtimes rendered on this page yet.'
      };
    }

    const timeList = allShowtimes.map((s) => s.time);
    logger.info(`Detected showtimes on page (${timeList.length}): ${timeList.join(' | ')}`);

    // Filter showtimes strictly before cutoff time (e.g. < 10:00 AM)
    const matchingShowtimes = allShowtimes.filter((s) => isTimeBeforeCutoff(s.time, cutoffTime));

    if (matchingShowtimes.length === 0) {
      return {
        found: false,
        allShowtimes,
        matchingShowtimes: [],
        cutoffTime,
        reason: `Showtimes are open (${timeList.join(' | ')}), but NONE are before ${cutoffTime} yet.`
      };
    }

    // Highlighting matching early showtime pill
    try {
      const targetTime = matchingShowtimes[0].time;
      const hit = page.locator(`[aria-label*="Book ${targetTime}"], [aria-label*="${targetTime}"]`).first();
      if ((await hit.count()) > 0) {
        await hit.scrollIntoViewIfNeeded({ timeout: 3000 });
        await highlightElement(hit);
        await page.waitForTimeout(config.simulation?.highlightDuration || 700);
      }
    } catch (highlightErr) {
      // Visual only
    }

    const matchedTimes = matchingShowtimes.map((s) => s.time);
    return {
      found: true,
      allShowtimes,
      matchingShowtimes,
      cutoffTime,
      reason: `Found showtime(s) before ${cutoffTime}: ${matchedTimes.join(', ')}`
    };
  } catch (err) {
    logger.error('Error scanning page showtimes', err);
    return {
      found: false,
      allShowtimes: [],
      matchingShowtimes: [],
      cutoffTime,
      reason: `Error during showtimes scan: ${err.message}`
    };
  }
}

module.exports = {
  checkShowtimesBeforeCutoff,
  extractShowtimesFromPage,
  isTimeBeforeCutoff,
  parseTimeToMinutes
};
