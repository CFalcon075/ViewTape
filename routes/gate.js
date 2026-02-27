const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { TOTP, Secret } = require('otpauth');
const crypto = require('crypto');
const os = require('os');
const http = require('http');

// Get the machine's LAN IP address
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Fetch public IP from external service (cached)
let _publicIP = null;
function getPublicIP() {
  if (_publicIP) return Promise.resolve(_publicIP);
  return new Promise((resolve) => {
    const req = http.get('http://api.ipify.org', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { _publicIP = data.trim(); resolve(_publicIP); });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Fetch public IP at startup
getPublicIP().then(ip => {
  if (ip) console.log('[ViewTape] Public IP detected: ' + ip);
});

const SERVER_PASSWORD = process.env.SERVER_PASSWORD || '';
const SERVER_2FA_SECRET = process.env.SERVER_2FA_SECRET || '';

// Build a TOTP instance if 2FA is enabled
let totp = null;
if (SERVER_2FA_SECRET) {
  try {
    totp = new TOTP({
      issuer: 'ViewTape',
      label: 'ServerAccess',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(SERVER_2FA_SECRET)
    });
  } catch (e) {
    console.error('[ViewTape] Invalid 2FA secret, disabling 2FA:', e.message);
  }
}

// Generate a one-time access token for QR-code-based login
let accessToken = '';
if (SERVER_PASSWORD) {
  accessToken = crypto.randomBytes(32).toString('hex');
  console.log('[ViewTape] Access token for QR login: ' + accessToken);
}

function isGateEnabled() {
  return !!SERVER_PASSWORD;
}

function is2FAEnabled() {
  return !!totp;
}

// Show the gate page
router.get('/gate', (req, res) => {
  if (!isGateEnabled()) return res.redirect('/');
  if (req.session.serverAuthenticated) return res.redirect('/');

  res.render('gate', {
    title: 'Server Access - ViewTape',
    needs2FA: is2FAEnabled(),
    error: null
  });
});

// Authenticate
router.post('/gate', (req, res) => {
  if (!isGateEnabled()) return res.redirect('/');

  const { password, totp_code, access_token } = req.body;

  // Access token bypass (from QR code scan)
  if (access_token && access_token === accessToken) {
    req.session.serverAuthenticated = true;
    return res.redirect('/');
  }

  // Check password
  if (password !== SERVER_PASSWORD) {
    return res.render('gate', {
      title: 'Server Access - ViewTape',
      needs2FA: is2FAEnabled(),
      error: 'Incorrect password.'
    });
  }

  // Check 2FA if enabled
  if (is2FAEnabled()) {
    if (!totp_code) {
      return res.render('gate', {
        title: 'Server Access - ViewTape',
        needs2FA: true,
        error: 'Please enter your 2FA code.'
      });
    }
    const delta = totp.validate({ token: totp_code.trim(), window: 1 });
    if (delta === null) {
      return res.render('gate', {
        title: 'Server Access - ViewTape',
        needs2FA: true,
        error: 'Invalid 2FA code. Please try again.'
      });
    }
  }

  req.session.serverAuthenticated = true;
  res.redirect('/');
});

// QR code: scan to access server (contains URL with access token)
router.get('/gate/access-qr', async (req, res) => {
  if (!isGateEnabled()) return res.status(404).send('Not available');

  const lanIP = getLanIP();
  const port = (req.headers.host || '').split(':')[1] || process.env.PORT || '3000';
  const publicIP = await getPublicIP();

  const lanUrl = `http://${lanIP}:${port}/gate/token/${accessToken}`;
  const publicUrl = publicIP ? `http://${publicIP}:${port}/gate/token/${accessToken}` : null;

  try {
    const lanQR = await QRCode.toDataURL(lanUrl, { width: 250, margin: 2 });
    const publicQR = publicUrl ? await QRCode.toDataURL(publicUrl, { width: 250, margin: 2 }) : null;

    // Also generate a share link (just the public URL without the token — they'll need the password)
    const shareUrl = publicIP ? `http://${publicIP}:${port}` : null;
    const lanShareUrl = `http://${lanIP}:${port}`;

    res.send(`
      <!DOCTYPE html>
      <html><head><title>Access QR - ViewTape</title>
      <link rel="stylesheet" href="/public/css/style.css">
      <style>
        body { background:#f5f5f5; font-family:Arial,Helvetica,sans-serif; margin:0; padding:20px 0 40px; }
        .qr-page { max-width:700px; margin:0 auto; padding:0 16px; }
        .qr-page h2 { text-align:center; font-size:20px; margin-bottom:4px; }
        .qr-page .subtitle { text-align:center; color:#666; font-size:13px; margin-bottom:24px; }
        .qr-cards { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; }
        .qr-card {
          background:#fff; border:1px solid #ccc; border-radius:8px; padding:20px;
          text-align:center; flex:1; min-width:260px; max-width:320px;
        }
        .qr-card h3 { font-size:15px; margin:0 0 4px 0; }
        .qr-card .qr-desc { font-size:12px; color:#666; margin-bottom:12px; }
        .qr-card img { border:2px solid #ddd; border-radius:6px; }
        .qr-card .qr-url { font-size:11px; color:#555; margin-top:10px; word-break:break-all; }
        .qr-card .qr-url code { background:#eee; padding:2px 6px; border-radius:3px; }
        .qr-card.lan { border-top:3px solid #03c; }
        .qr-card.public { border-top:3px solid #090; }
        .share-section {
          background:#fff; border:1px solid #ccc; border-radius:8px; padding:16px 20px;
          margin-top:20px; text-align:center;
        }
        .share-section h3 { font-size:14px; margin:0 0 8px 0; }
        .share-link {
          display:inline-block; background:#eee; border:1px solid #ccc; border-radius:4px;
          padding:6px 12px; font-family:monospace; font-size:13px; user-select:all; cursor:text;
          word-break:break-all;
        }
        .share-note { font-size:11px; color:#888; margin-top:8px; }
        .copy-btn {
          display:inline-block; margin-left:8px; padding:4px 12px; font-size:12px;
          background:linear-gradient(to bottom,#6cb033,#4a8a1c); color:#fff;
          border:1px solid #3a7a10; border-radius:3px; cursor:pointer; vertical-align:middle;
        }
        .copy-btn:hover { background:linear-gradient(to bottom,#7cc043,#5a9a2c); }
        .back-link { text-align:center; margin-top:20px; font-size:13px; }
        .back-link a { color:#03c; }
        .no-public {
          background:#fff8e0; border:1px solid #e8d060; border-radius:6px;
          padding:12px 16px; margin-top:20px; font-size:12px; color:#665500;
        }
        .no-public strong { color:#996600; }
      </style>
      </head><body>
      <div class="qr-page">
        <h2>ViewTape Access QR Codes</h2>
        <p class="subtitle">Scan a QR code to access the server without typing the password.</p>

        <div class="qr-cards">
          <div class="qr-card lan">
            <h3>LAN / Same Wi-Fi</h3>
            <p class="qr-desc">For devices on your home network</p>
            <img src="${lanQR}" alt="LAN Access QR">
            <p class="qr-url"><code>http://${lanIP}:${port}</code></p>
          </div>
          ${publicQR ? `
          <div class="qr-card public">
            <h3>Internet / Friends</h3>
            <p class="qr-desc">For anyone outside your network (requires port forwarding)</p>
            <img src="${publicQR}" alt="Internet Access QR">
            <p class="qr-url"><code>http://${publicIP}:${port}</code></p>
          </div>
          ` : ''}
        </div>

        ${publicIP ? `
        <div class="share-section">
          <h3>Share With Friends</h3>
          <p style="font-size:12px;color:#555;margin-bottom:8px;">Give your friends this link and the server password:</p>
          <span class="share-link" id="shareLink">${shareUrl}</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('shareLink').textContent);this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500);">Copy</button>
          <p class="share-note">They'll need the server password to log in. Make sure port <strong>${port}</strong> is forwarded on your router.</p>
        </div>
        ` : `
        <div class="no-public">
          <strong>Could not detect your public IP.</strong> To let friends connect from the internet:
          <ol style="margin:6px 0 0 0;padding-left:20px;">
            <li>Forward port <strong>${port}</strong> on your router to this PC</li>
            <li>Find your public IP at <a href="https://whatismyip.com" target="_blank">whatismyip.com</a></li>
            <li>Share <code>http://YOUR_PUBLIC_IP:${port}</code> with friends along with the password</li>
          </ol>
        </div>
        `}

        <p style="text-align:center;color:#999;font-size:11px;margin-top:16px;">QR codes are valid until the server restarts.</p>
        <p class="back-link"><a href="/gate">Back to login</a></p>
      </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Error generating QR code');
  }
});

// Token-based access (from QR code scan)
router.get('/gate/token/:token', (req, res) => {
  if (!isGateEnabled()) return res.redirect('/');
  if (req.params.token === accessToken) {
    req.session.serverAuthenticated = true;
    return res.redirect('/');
  }
  res.redirect('/gate');
});

// QR code for 2FA setup (shows the TOTP provisioning URI)
router.get('/gate/2fa-setup-qr', async (req, res) => {
  if (!is2FAEnabled()) return res.status(404).send('2FA not enabled');

  const uri = totp.toString();
  try {
    const qrDataUrl = await QRCode.toDataURL(uri, { width: 300, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html><head><title>2FA Setup - ViewTape</title>
      <link rel="stylesheet" href="/public/css/style.css">
      </head><body style="background:#f5f5f5;text-align:center;padding-top:40px;">
        <h2 style="font-family:Arial,sans-serif;">2FA Setup - ViewTape</h2>
        <p style="font-family:Arial,sans-serif;color:#666;">Scan this QR code with your authenticator app<br>(Google Authenticator, Authy, etc.)</p>
        <img src="${qrDataUrl}" alt="2FA Setup QR Code" style="border:2px solid #ccc;border-radius:8px;">
        <p style="font-family:Arial,sans-serif;color:#999;font-size:12px;margin-top:10px;">Manual entry key: <code style="background:#eee;padding:2px 6px;border-radius:3px;">${SERVER_2FA_SECRET}</code></p>
        <p><a href="/gate" style="color:#03c;">Back to login</a></p>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Error generating QR code');
  }
});

module.exports = router;
module.exports.isGateEnabled = isGateEnabled;
module.exports.accessToken = accessToken;
