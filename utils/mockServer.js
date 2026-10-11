const http = require('http');
const logger = require('./logger');
const { dismissDesktopNotifications } = require('../notifications/desktop');

let server = null;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function startMockServer(isDryRun = true) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    if (server) {
      return resolve(`http://localhost:${PORT}`);
    }

    server = http.createServer((req, res) => {
      // 1. Twilio Incoming WhatsApp Webhook Endpoint
      if (req.url === '/api/whatsapp/webhook' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          const params = new URLSearchParams(body);
          const messageText = params.get('Body') ? params.get('Body').trim() : '';
          const fromNumber = params.get('From') || '';

          logger.info(`[Webhook] Incoming message received: "${messageText}" from ${fromNumber}`);

          const lowerText = messageText.toLowerCase();
          if (messageText === '12345' || lowerText.includes('stop')) {
            logger.success(`🔑 Stop command ("${messageText}") received via webhook! Terminating alert loop...`);
            global.stopRequested = true;
            dismissDesktopNotifications();
          }

          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end('<Response></Response>');
        });
        return;
      }

      // 2. Quick Browser Stop Endpoint: http://localhost:3000/stop
      if (req.url === '/stop' || req.url === '/api/stop') {
        logger.success('🛑 Stop command received via web browser (http://localhost:3000/stop)! Halting alerts immediately...');
        global.stopRequested = true;
        dismissDesktopNotifications();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><title>Alerts Silenced</title></head>
            <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;">
              <h1 style="color:#22c55e;font-size:32px;">✅ ALERTS SILENCED!</h1>
              <p style="font-size:18px;color:#94a3b8;">Continuous notifications have been stopped.</p>
              <p style="font-size:16px;color:#cbd5e1;">Your BookMyShow browser window is kept open so you can select seats and book.</p>
            </body>
          </html>
        `);
        return;
      }

      // 2. Mock Cinema Page ("/cinemas/..." - the "new link" showing movie showtimes)
      if ((req.url.startsWith('/cinemas') || req.url.startsWith('/cinema')) && isDryRun) {
        const elapsed = Date.now() - startTime;
        // After 5 seconds, open the early morning show (< 10:00 AM)
        const hasEarlyShow = elapsed >= 5000;

        const earlyShowPill = hasEarlyShow
          ? `
          <div class="sc-1skzbbo-0 edgqss">
            <div color="#4ABD5D" role="button" tabindex="0" aria-label="Book 07:00 AM" class="sc-yr56qh-0 eiIBOq">
              <div class="sc-yr56qh-3 dgnxgf"><span class="sc-yr56qh-1 bBjfpy">07:00 AM</span></div>
              <span class="sc-yr56qh-2 jtyQjI">DOLBY ATMOS</span>
            </div>
          </div>`
          : '';

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html lang="en-IN">
          <head>
            <meta charset="UTF-8">
            <title>Karpagam Theatres 4K Dolby Atmos: Coimbatore | Movie Showtimes & Ticket Booking Near You in Coimbatore - BookMyShow</title>
            <style>
              body { font-family: Roboto, Arial, sans-serif; background-color: #f2f2f2; margin: 0; padding: 20px; }
              .header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .header h1 { margin: 0 0 8px 0; font-size: 24px; color: #333; }
              .header p { margin: 0; color: #666; font-size: 14px; }
              .movie-container { background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .movie-title { font-size: 20px; font-weight: bold; color: #222; margin-bottom: 4px; }
              .movie-lang { color: #888; font-size: 13px; margin-bottom: 20px; }
              .sc-19dkgz1-0 { display: flex; flex-wrap: wrap; gap: 12px; }
              .sc-1skzbbo-0 { display: inline-block; }
              .sc-yr56qh-0 {
                border: 1px solid #999;
                border-radius: 6px;
                padding: 10px 18px;
                cursor: pointer;
                text-align: center;
                background-color: #fff;
                min-width: 90px;
                transition: transform 0.2s, box-shadow 0.2s;
              }
              .sc-yr56qh-0:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
              .sc-yr56qh-1 { font-size: 15px; font-weight: bold; color: #333; display: block; }
              .sc-yr56qh-2 { font-size: 10px; color: #4ABD5D; font-weight: bold; display: block; margin-top: 4px; }
              .status-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; margin-bottom: 15px; background: ${hasEarlyShow ? '#e6f9ed' : '#fff3e0'}; color: ${hasEarlyShow ? '#1b5e20' : '#e65100'}; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Karpagam Theatres 4K Dolby Atmos: Coimbatore</h1>
              <p>No-161, 100 Feet Road, Gandhi Puram, Opposite Bharath Electronics, Coimbatore, Tamil Nadu 641012, India</p>
            </div>
            <div class="movie-container">
              <div class="movie-title">Jailer 2</div>
              <div class="movie-lang">Tamil, 2D</div>
              <div class="status-badge">${hasEarlyShow ? '✓ EARLY MORNING SHOW AVAILABLE (07:00 AM)' : 'Regular Shows Only (No show before 10:00 AM yet)'}</div>
              
              <!-- Exact showtime container matching user HTML snippet -->
              <div class="sc-19dkgz1-0 kfvelw">
                ${earlyShowPill}
                <div class="sc-1skzbbo-0 edgqss">
                  <div color="#E8A900" role="button" tabindex="0" aria-label="Book 12:30 PM" class="sc-yr56qh-0 eiIBOq">
                    <div class="sc-yr56qh-3 dgnxgf"><span class="sc-yr56qh-1 bBjfpy">12:30 PM</span></div>
                    <span class="sc-yr56qh-2 jtyQjI">DOLBY ATMOS</span>
                  </div>
                </div>
                <div class="sc-1skzbbo-0 edgqss">
                  <div color="#E8A900" role="button" tabindex="-1" aria-label="Book 04:00 PM" class="sc-yr56qh-0 eiIBOq">
                    <div class="sc-yr56qh-3 dgnxgf"><span class="sc-yr56qh-1 bBjfpy">04:00 PM</span></div>
                    <span class="sc-yr56qh-2 jtyQjI">DOLBY ATMOS</span>
                  </div>
                </div>
                <div class="sc-1skzbbo-0 edgqss">
                  <div color="#E8A900" role="button" tabindex="-1" aria-label="Book 07:30 PM" class="sc-yr56qh-0 eiIBOq">
                    <div class="sc-yr56qh-3 dgnxgf"><span class="sc-yr56qh-1 bBjfpy">07:30 PM</span></div>
                    <span class="sc-yr56qh-2 jtyQjI">DOLBY ATMOS</span>
                  </div>
                </div>
                <div class="sc-1skzbbo-0 edgqss">
                  <div color="#E8A900" role="button" tabindex="-1" aria-label="Book 11:00 PM" class="sc-yr56qh-0 eiIBOq">
                    <div class="sc-yr56qh-3 dgnxgf"><span class="sc-yr56qh-1 bBjfpy">11:00 PM</span></div>
                    <span class="sc-yr56qh-2 jtyQjI">DOLBY ATMOS</span>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // 3. Mock BookMyShow Movie Page ("/" - lists cinemas for Jailer 2)
      if (req.url === '/' && isDryRun) {
        const mockVenues = [
          ['Cosmo Cinemas PEELAMEDU AC 4K RGB Lase:Coimbatore', 'http://localhost:3000/other'],
          ['KG Cinemas: Coimbatore', 'http://localhost:3000/other'],
          ['Broadway Cinemas: Coimbatore', 'http://localhost:3000/other'],
          ['Karpagam Theatres 4K Dolby Atmos: Coimbatore', `http://localhost:${PORT}/cinemas/coimbatore/karpagam-theatres-4k-dolby-atmos-coimbatore/buytickets/KARP/20261015`],
          ['PVR: Brookefields Mall, Coimbatore', 'http://localhost:3000/other']
        ];

        const venueRows = mockVenues
          .map(
            ([name, url]) => `
            <div class="venue-row" style="padding: 12px; margin-bottom: 8px; background: #fff; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
              <a alt="${name}" href="${url}" style="text-decoration: none; color: #222; font-weight: bold; font-size: 16px;">
                ${name}
              </a>
            </div>`
          )
          .join('');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Jailer 2 - Movie Showtimes Coimbatore | BookMyShow</title>
            <style>
              body { font-family: Roboto, Arial, sans-serif; background: #f2f2f2; margin: 0; padding: 20px; }
              .container { max-width: 800px; margin: 0 auto; }
              h1 { color: #333; font-size: 22px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Jailer 2 (Tamil) - Theatres in Coimbatore</h1>
              <main id="main-content">
                <div class="ReactVirtualized__Grid ReactVirtualized__List">
                  ${venueRows}
                </div>
              </main>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // 3. Live Production Status Dashboard (when accessed in browser on Render / cloud)
      if ((req.url === '/' || req.url === '/dashboard') && !isDryRun) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderProductionDashboard());
        return;
      }

      // Default fallback
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(PORT, () => {
      logger.success(`Local Web Server started on http://localhost:${PORT}`);
      resolve(`http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      logger.error('Failed to start Server', err);
      reject(err);
    });
  });
}

function stopMockServer() {
  if (server) {
    server.close();
    server = null;
    logger.info('Local Web Server stopped.');
  }
}

function renderProductionDashboard() {
  const movieName = process.env.MOVIE_NAME || 'Jailer 2';
  const movieCity = process.env.MOVIE_CITY || 'Coimbatore';
  const targetCinema = process.env.TARGET_CINEMA || 'Karpagam';
  const cutoff = process.env.TARGET_TIME_BEFORE || '11:00 AM';
  const bookingUrl = process.env.BOOKING_URL || 'https://in.bookmyshow.com';
  const alertInterval = process.env.ALERT_INTERVAL_SECONDS || '2';
  const heartbeatMinutes = process.env.HEARTBEAT_INTERVAL_MINUTES || '10';
  const stopStatus = global.stopRequested ? '🔴 Alerts Silenced' : '🟢 Active & Monitoring';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BMS Ticket Monitor | Live Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(23, 32, 54, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --green: #10b981;
      --red: #ef4444;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at top, #1e1b4b 0%, #0b0f19 50%, #05070e 100%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
    }
    .container {
      width: 100%;
      max-width: 860px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    p.subtitle {
      color: var(--text-muted);
      font-size: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(99, 102, 241, 0.4);
    }
    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
      margin-bottom: 8px;
      font-weight: 600;
    }
    .card-value {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .card-value small {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .highlight-green { color: #34d399; }
    .highlight-indigo { color: #818cf8; }
    .actions-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      text-align: center;
    }
    .actions-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
    }
    .btn-danger:hover {
      background: #b91c1c;
      transform: scale(1.02);
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover {
      background: #4338ca;
      transform: scale(1.02);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }
    .info-footer {
      font-size: 13px;
      color: var(--text-muted);
      text-align: center;
      line-height: 1.6;
    }
    .info-footer a {
      color: #818cf8;
      text-decoration: none;
    }
    code {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge-live">
        <span class="pulse-dot"></span>
        Production Monitoring Active
      </div>
      <h1>BookMyShow Ticket Monitor</h1>
      <p class="subtitle">Cloud automation watching BookMyShow for early showtimes 24/7</p>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">🎬 Target Movie</div>
        <div class="card-value">${movieName} <small>(${movieCity})</small></div>
      </div>
      <div class="card">
        <div class="card-title">🏛️ Target Cinema</div>
        <div class="card-value highlight-indigo">${targetCinema}</div>
      </div>
      <div class="card">
        <div class="card-title">⏰ Showtime Filter</div>
        <div class="card-value highlight-green">&lt; ${cutoff}</div>
      </div>
      <div class="card">
        <div class="card-title">🔔 Alert Interval</div>
        <div class="card-value">Every ${alertInterval}s <small>(heartbeat: ${heartbeatMinutes}m)</small></div>
      </div>
      <div class="card">
        <div class="card-title">📲 Push Notifications</div>
        <div class="card-value highlight-green">ntfy.sh enabled</div>
      </div>
      <div class="card">
        <div class="card-title">🛑 Alert State</div>
        <div class="card-value">${stopStatus}</div>
      </div>
    </div>

    <div class="actions-card">
      <div class="actions-title">Interactive Cloud Controls</div>
      <div class="btn-group">
        <a href="/stop" class="btn btn-danger">🛑 Silence Continuous Alerts</a>
        <a href="${bookingUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">🎟️ Open BookMyShow</a>
        <a href="https://ntfy.sh/bms-movie-monitor-alerts" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">📲 Open ntfy Mobile Alerts</a>
      </div>
    </div>

    <div class="info-footer">
      <p>Running continuously on Render Cloud with Headless Playwright Chromium.</p>
      <p>Webhook endpoint active at <code>/api/whatsapp/webhook</code> | Control endpoint at <code>/stop</code></p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { startMockServer, stopMockServer, renderProductionDashboard };
