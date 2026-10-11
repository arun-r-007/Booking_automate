const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');
const { highlightElement } = require('../utils/visual');

/**
 * Splits the configured cinema text into individual targets.
 * Semicolon separated so cinema names containing commas stay intact.
 */
function parseTargets(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(';');
  return list.map((t) => String(t).trim()).filter((t) => t.length > 0);
}

/**
 * Runs inside the page. Reads cinema names and their links from the showtimes list.
 */
const EXTRACT_VENUES = () => {
  const main = document.querySelector('#main-content') || document.body;
  const scope = main.querySelector('.ReactVirtualized__Grid') || main;

  const venues = [];
  const add = (name, href) => {
    const text = (name || '').replace(/\s+/g, ' ').trim();
    if (text && !venues.some((v) => v.name === text)) {
      venues.push({ name: text, href: href || '' });
    }
  };

  // Find all cinema anchors inside the showtimes container
  const anchors = scope.querySelectorAll('a[href*="/cinema"], a[alt], [class*="venue"] a');
  anchors.forEach((anchor) => {
    const name =
      anchor.getAttribute('alt') ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      anchor.innerText;
    const href = anchor.href || anchor.getAttribute('href') || '';
    if (name && (href.includes('/cinema') || anchor.hasAttribute('alt'))) {
      add(name, href);
    }
  });

  if (venues.length === 0 && scope.innerText) {
    add(scope.innerText, '');
  }

  return { venues };
};

/**
 * Scrolls through the showtimes list and accumulates every venue name and link.
 */
async function collectCinemaVenues(page) {
  const collected = [];
  const add = (list) => {
    list.forEach((item) => {
      if (!collected.some((v) => v.name === item.name)) {
        collected.push(item);
      }
    });
  };

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);

  let previousY = -1;
  for (let i = 0; i < 25; i++) {
    const { venues } = await page.evaluate(EXTRACT_VENUES);
    add(venues);

    const y = await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      return window.scrollY;
    });
    await sleep(400);

    if (y === previousY) break;
    previousY = y;
  }

  const { venues } = await page.evaluate(EXTRACT_VENUES);
  add(venues);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);

  return collected;
}

/**
 * Backward compatibility: collects just the venue names.
 */
async function collectCinemaNames(page) {
  const list = await collectCinemaVenues(page);
  return list.map((v) => v.name);
}

/**
 * Reports whether any configured cinema is listed, and returns its target link.
 */
async function checkCinemaPresence(page, config) {
  const targets = parseTargets(config.booking.cinemaText);

  if (targets.length === 0) {
    return {
      found: false,
      matched: [],
      cinemaUrl: null,
      venues: [],
      reason: 'No cinema text configured. Set TARGET_CINEMA in .env'
    };
  }

  try {
    const venues = await collectCinemaVenues(page);
    const venueNames = venues.map((v) => v.name);

    if (venues.length === 0) {
      return {
        found: false,
        matched: [],
        cinemaUrl: null,
        venues: [],
        reason: 'No cinemas rendered in the showtimes list yet'
      };
    }

    logger.info(`Cinemas currently listed (${venues.length}): ${venueNames.join(' | ')}`);

    const matched = [];
    let matchedUrl = null;

    targets.forEach((target) => {
      const hit = venues.find((v) => v.name.toLowerCase().includes(target.toLowerCase()));
      if (hit) {
        if (!matched.includes(hit.name)) matched.push(hit.name);
        if (!matchedUrl && hit.href) {
          try {
            matchedUrl = new URL(hit.href, page.url()).toString();
          } catch (e) {
            matchedUrl = hit.href;
          }
        }
      }
    });

    if (matched.length === 0) {
      return {
        found: false,
        matched: [],
        cinemaUrl: null,
        venues: venueNames,
        reason: `Cinema not listed yet (looking for: ${targets.join(' | ')})`
      };
    }

    // Bring matching row into view and highlight it
    try {
      const hit = page.locator('#main-content, body').getByText(matched[0], { exact: false }).first();
      if ((await hit.count()) > 0) {
        await hit.scrollIntoViewIfNeeded({ timeout: 4000 });
        await highlightElement(hit);
        await page.waitForTimeout(config.simulation?.highlightDuration || 700);
      }
    } catch (highlightErr) {
      // Visual only
    }

    return {
      found: true,
      matched,
      targetCinema: matched[0],
      cinemaUrl: matchedUrl,
      venues: venueNames,
      reason: `Cinema found in showtimes list: ${matched.join(' | ')}`
    };
  } catch (err) {
    logger.error('Error occurred while scanning the showtimes list', err);
    return {
      found: false,
      matched: [],
      cinemaUrl: null,
      venues: [],
      reason: `Error during scan: ${err.message}`
    };
  }
}

module.exports = {
  checkCinemaPresence,
  collectCinemaVenues,
  collectCinemaNames,
  parseTargets
};
