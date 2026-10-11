# BookMyShow Ticket Availability Monitor

An automated notification system that continuously monitors a specific BookMyShow **buytickets** page. The monitor opens the configured URL directly and scans the rendered page text for a target cinema name. As soon as that cinema appears in the listing, the system immediately notifies you through multiple channels: local Desktop alerts, Telegram messages, Twilio Voice calls, Twilio SMS alerts, WhatsApp, and ntfy.sh Mobile Push notifications.

**Flow:** launch Chromium → open `BOOKING_URL` directly → read the venue list inside `<main id="main-content">` → match against `TARGET_CINEMA` → notify when found → reload and repeat until it is.

The scan is deliberately **scoped to the showtimes list** (`#main-content .ReactVirtualized__Grid`), not the whole document, so unrelated text elsewhere on the page can never trigger a false alert. Venue names are read from the `alt` attribute of each row's `/cinemas/...` anchor. Because that list is virtualized (off-screen rows are removed from the DOM), the scan scrolls through it and accumulates names across the pass rather than taking a single snapshot.

---

## Technical Architecture

```
                      User

                        │
                        ▼
              Configuration File (.env / config.json)
                        │
                        ▼
               Browser Automation (Playwright)
                        │
                        ▼
        BookMyShow buytickets page (or Mock Server)
                        │
                        ▼
             Cinema Text Detector State Engine
                        │
                        ▼
               Notification Dispatcher
      ├── Desktop Notification (node-notifier)
      ├── Telegram Bot Messaging (Telegram Bot API)
      ├── Mobile Push Notification (ntfy.sh)
      ├── Twilio Voice Call (Phone Call)
      ├── Twilio SMS
      └── Twilio WhatsApp (Twilio Messaging API)
```

---

## Folder Structure

```text
ticket-monitor/
├── config/
│   ├── config.json          # Main configuration (movie settings, interval, active channels)
│   └── selectors.json       # CSS & text element selectors (city selection, movie search, book button)
│
├── browser/
│   ├── launch.js            # Launches Chromium with anti-detection args & custom User Agent
│   ├── openBookingPage.js   # Opens BOOKING_URL directly and waits for the showtimes list
│   ├── checkCinema.js       # Collects venue names from #main-content and matches TARGET_CINEMA
│   ├── searchMovie.js       # (legacy) homepage navigation, city selection, and movie search
│   └── monitor.js           # (legacy) booking button visibility / enabled-state checks
│
├── notifications/
│   ├── manager.js           # Main dispatcher coordinating active alert channels
│   ├── desktop.js           # Desktop notification using node-notifier
│   ├── telegram.js          # Telegram bot notification
│   ├── push.js              # Push notifications on mobile using ntfy.sh (no-auth/free)
│   ├── phoneCall.js         # Twilio REST API voice call (TwiML text-to-speech)
│   ├── sms.js               # Twilio REST API SMS text message
│   └── whatsapp.js          # Twilio REST API WhatsApp message
│
├── utils/
│   ├── logger.js            # Unified logger printing to console & appending to logs/app.log
│   ├── retry.js             # General retry handler for network/flaky operations
│   ├── helpers.js           # sleep/wait, config loader, selector loader helpers
│   └── mockServer.js        # Built-in HTTP mock server for dry-run simulation
│
├── logs/                    # Event logs directory (and screenshot storage)
├── .env                     # Private api secrets (Twilio and Telegram credentials)
├── index.js                 # Application entrypoint
└── package.json             # NPM package scripts and dependencies
```

---

## Setup Instructions

### 1. Prerequisites
- Node.js (v16+) installed.
- Git (optional).

### 2. Installation
Install the project dependencies and download the browser binaries:
```bash
# Install dependencies
npm install

# Install Playwright browser binaries
npx playwright install Chromium
```

### 3. Configuration

#### `.env` File
Create a `.env` file in the root directory (based on the template) containing the target page and your private API credentials:
```env
MOVIE_NAME=Spider-Man: Brand New Day
MOVIE_CITY=Coimbatore

# The buytickets page that is opened directly and scanned every cycle
BOOKING_URL=https://in.bookmyshow.com/movies/coimbatore/spider-man-brand-new-day/buytickets/ET00502600/20260807?etCodes=ET00502600&language=english&refEventCode=ET00502600

# Cinema text to look for on that page (case-insensitive substring match)
# Separate multiple cinemas with ';' - any single match fires the alert
TARGET_CINEMA=PVR: Prozone Mall; INOX: Brookefields

# Twilio Voice & SMS credentials
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# Telegram Bot API Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

`BOOKING_URL` and `TARGET_CINEMA` override the `booking.url` / `booking.cinemaText` keys in `config/config.json`. Both are required — the monitor exits immediately with an error if either is empty.

> [!TIP]
> Use a semicolon (not a comma) between cinema names, since BookMyShow venue names frequently contain commas (`INOX: Prozone Mall, Coimbatore`). A short fragment such as `Broadway` is enough — matching is substring-based against the full venue name.

> [!IMPORTANT]
> The date and any filters are baked into `BOOKING_URL`. `.../20260807?...&language=english` watches **only** Aug 7 **and** only English shows — a cinema screening the movie in another language or on another date will not be matched. Drop the `language`/format query parameters if you want every show for that date.

#### `config/config.json`
Configure settings, monitoring intervals, and toggle notifications:
```json
{
  "movie": {
    "name": "Interstellar",
    "city": "Mumbai",
    "language": "English",
    "format": "IMAX 2D",
    "directUrl": ""
  },
  "booking": {
    "url": "",          // 👈 overridden by BOOKING_URL in .env
    "cinemaText": ""    // 👈 overridden by TARGET_CINEMA in .env
  },
  "monitoring": {
    "intervalSeconds": 5,
    "headless": false,
    "screenshotOnSuccess": true,
    "dryRun": false
  },
  "notifications": {
    "desktop": true,
    "telegram": false,
    "ntfy": false,
    "twilioVoice": false,
    "twilioSMS": false,
    "twilioWhatsApp": false
  },
  "twilio": {
    "accountSid": "your_twilio_account_sid",
    "fromNumber": "+1234567890",
    "toNumber": "+919876543210, +919999999999", // 👈 Supports comma-separated list or JSON array: ["+919876543210", "+919999999999"]
    "whatsappFromNumber": "whatsapp:+14155238886"
  },
  "telegram": {
    "chatId": "your_personal_telegram_chat_id"
  },
  "ntfy": {
    "topic": "your-unique-ntfy-topic"
  }
}
```

> [!NOTE]
> **Mobile Push Notifications with ntfy.sh**:
> Download the **ntfy** app on your phone (available for iOS and Android). Subscribe to the topic configured in `"ntfy.topic"` (e.g. `bms-movie-monitor-alerts`). You will immediately receive high-priority alerts with sound without registering or paying for any account!

---

## Running the Application

### 1. Offline Simulation (Dry-Run / Safe Testing)
Run the application against a mock BookMyShow server. The mock server starts locally on port 3000 and serves a page that mirrors the real markup (`#main-content` → virtualized grid → `/cinemas/` anchors). Its venue list is empty for the first 10 seconds, then renders five venues including `Broadway Cinemas: Coimbatore`. It also plants a decoy cinema name *outside* `#main-content` to prove the scan stays scoped. This verifies browser launching, polling, page reloading, the cinema scan, screenshot capture, and notification dispatching:
```bash
npm run dev
```

> [!WARNING]
> Dry-run only mocks the **web page** — the notification channels are still live. With `twilioWhatsApp: true` a dry run sends real WhatsApp messages to every number in `twilio.toNumber`, repeatedly, until you reply `12345`. Set the notification toggles to `false` in `config/config.json` before testing.

### 2. Production (Live Monitoring)
To monitor the live BookMyShow website:
1. Double-check your `config/config.json` to ensure `"dryRun": false` is configured (or run without the `--dry-run` flag).
2. Set `BOOKING_URL` to the buytickets page you want watched, and `TARGET_CINEMA` to the cinema name that should trigger the alert.
3. Run:
```bash
npm start
```

---

## Logging & Event Recovery
All events, status checks, and errors are saved with timestamps in `logs/app.log`.

If the script encounters a browser crash, internet drop, or page timeout, it will automatically:
1. Log the error.
2. Wait 10 seconds (backoff period).
3. Close the browser.
4. Launch a clean browser instance.
5. Re-authenticate / re-navigate and resume monitoring.
