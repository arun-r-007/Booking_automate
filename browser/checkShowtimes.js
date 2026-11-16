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
async function extractShowtimesFromPage(page, cinemaTargets = []) {
  return await page.evaluate((targets) => {
    const results = [];
    const seenTimes = new Set();
    const TIME_RE = /\d{1,2}:\d{2}\s*(?:AM|PM)/i;

    // Optionally scope to a single cinema row (needed on movie pages listing many cinemas)
    let scope = document;
    if (targets && targets.length > 0) {
      scope = null;
      const lowered = targets.map((t) => t.toLowerCase());
      const nodes = Array.from(document.querySelectorAll('#main-content a, #main-content span, #main-content div, a, span'));
      const nameEl = nodes.find((el) => {
        const txt = (el.innerText || '').trim().toLowerCase();
        return txt.length > 0 && txt.length < 120 && lowered.some((t) => txt.includes(t)) && !TIME_RE.test(txt);
      });
      if (nameEl) {
        let node = nameEl;
        while (node && node !== document.body) {
          if (TIME_RE.test(node.innerText || '')) { scope = node; break; }
          node = node.parentElement;
        }
      }
      if (!scope) return results; // cinema not on page -> no showtimes for it
    }

    // 1. Check all elements with aria-label containing "Book "
    const ariaButtons = scope.querySelectorAll('[aria-label*="Book "], [aria-label*="book "]');
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
      const candidates = scope.querySelectorAll('[role="button"], a, div[class*="sc-yr56qh-0"], div[class*="sc-1skzbbo"]');
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
  }, cinemaTargets);
}

/**
 * Checks for movie showtimes scheduled before the configured cutoff time (default: 10:00 AM).
 */
function parseTargetTimes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter((t) => parseTimeToMinutes(t) !== null);
}

/** Extracts the yyyymmdd date segment from a BookMyShow buytickets URL. */
function extractUrlDate(url) {
  const m = String(url || '').match(/\/(20\d{6})(?=[/?#]|$)/);
  return m ? m[1] : null;
}

/** Human readable description of the active showtime filter. */
function describeFilter(config) {
  const exact = parseTargetTimes(config.booking?.targetTimes);
  if (exact.length > 0) return `exactly at ${exact.join(' / ')}`;
  return `before ${config.booking?.targetTimeBefore || '10:00 AM'}`;
}

async function checkShowtimesBeforeCutoff(page, config) {
  const cutoffTime = config.booking?.targetTimeBefore || process.env.TARGET_TIME_BEFORE || '10:00 AM';
  const exactTimes = parseTargetTimes(config.booking?.targetTimes);
  const exactMinutes = exactTimes.map(parseTimeToMinutes);
  const filterText = describeFilter(config);

  try {
    // BookMyShow silently redirects a not-yet-open date to the nearest open date.
    const wantedDate = extractUrlDate(config.booking?.url);
    if (wantedDate) {
      const currentDate = extractUrlDate(page.url());
      if (currentDate && currentDate !== wantedDate) {
        return {
          found: false,
          allShowtimes: [],
          matchingShowtimes: [],
          cutoffTime,
          reason: `Date ${wantedDate} not open yet (BookMyShow redirected to ${currentDate}).`
        };
      }
    }

    const allShowtimes = await extractShowtimesFromPage(page, config.booking?.scopeCinemaTargets || []);

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
    const matchingShowtimes = exactMinutes.length > 0
      ? allShowtimes.filter((s) => exactMinutes.includes(parseTimeToMinutes(s.time)))
      : allShowtimes.filter((s) => isTimeBeforeCutoff(s.time, cutoffTime));

    if (matchingShowtimes.length === 0) {
      return {
        found: false,
        allShowtimes,
        matchingShowtimes: [],
        cutoffTime,
        reason: `Showtimes are open (${timeList.join(' | ')}), but NONE ${filterText} yet.`
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
      reason: `Found showtime(s) ${filterText}: ${matchedTimes.join(', ')}`
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
  parseTimeToMinutes,
  parseTargetTimes,
  extractUrlDate,
  describeFilter
};
