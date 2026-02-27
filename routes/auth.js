const express = require('express');
const bcrypt = require('bcryptjs');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { dbRun, dbGet } = require('../db/init');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('signup', { title: 'Sign Up - ViewTape', error: null });
});

router.post('/signup', async (req, res) => {
  const { username, password, confirm_password } = req.body;
  if (!username || !password) {
    return res.render('signup', { title: 'Sign Up - ViewTape', error: 'Username and password are required.' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.render('signup', { title: 'Sign Up - ViewTape', error: 'Username must be 3-20 characters.' });
  }
  if (password.length < 4) {
    return res.render('signup', { title: 'Sign Up - ViewTape', error: 'Password must be at least 4 characters.' });
  }
  if (password !== confirm_password) {
    return res.render('signup', { title: 'Sign Up - ViewTape', error: 'Passwords do not match.' });
  }

  try {
    const existing = dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.render('signup', { title: 'Sign Up - ViewTape', error: 'Username already taken.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const avatars = ['pfp1.png', 'pfp2.png'];
    const avatar = avatars[Math.floor(Math.random() * avatars.length)];
    const result = dbRun('INSERT INTO users (username, password_hash, avatar) VALUES (?, ?, ?)', [username, hash, avatar]);
    req.session.user = { id: result.lastInsertRowid, username, avatar };
    res.redirect('/');
  } catch (err) {
    console.error('[ViewTape] Signup error:', err);
    res.render('signup', { title: 'Sign Up - ViewTape', error: 'Something went wrong. Try again.' });
  }
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Log In - ViewTape', error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { title: 'Log In - ViewTape', error: 'Username and password are required.' });
  }

  try {
    const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.render('login', { title: 'Log In - ViewTape', error: 'Invalid username or password.' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login', { title: 'Log In - ViewTape', error: 'Invalid username or password.' });
    }

    // Check if user has 2FA enabled
    if (user.totp_secret) {
      // Store pending login in session - don't fully log in yet
      req.session.pending2FA = { id: user.id, username: user.username, avatar: user.avatar };
      return res.redirect('/login/2fa');
    }

    req.session.user = { id: user.id, username: user.username, avatar: user.avatar };
    // Update last sign in
    try { dbRun('UPDATE users SET last_sign_in = CURRENT_TIMESTAMP WHERE id = ?', [user.id]); } catch (e) {}
    res.redirect('/');
  } catch (err) {
    console.error('[ViewTape] Login error:', err);
    res.render('login', { title: 'Log In - ViewTape', error: 'Something went wrong. Try again.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ========================================
// 2FA LOGIN VERIFICATION
// ========================================
router.get('/login/2fa', (req, res) => {
  if (!req.session.pending2FA) return res.redirect('/login');
  res.render('login_2fa', { title: '2FA Verification - ViewTape', error: null, username: req.session.pending2FA.username });
});

router.post('/login/2fa', (req, res) => {
  if (!req.session.pending2FA) return res.redirect('/login');

  const { totp_code } = req.body;
  const pending = req.session.pending2FA;

  if (!totp_code || !totp_code.trim()) {
    return res.render('login_2fa', { title: '2FA Verification - ViewTape', error: 'Please enter your 2FA code.', username: pending.username });
  }

  const user = dbGet('SELECT totp_secret FROM users WHERE id = ?', [pending.id]);
  if (!user || !user.totp_secret) {
    delete req.session.pending2FA;
    return res.redirect('/login');
  }

  try {
    const totp = new TOTP({
      issuer: 'ViewTape',
      label: pending.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(user.totp_secret)
    });

    const delta = totp.validate({ token: totp_code.trim(), window: 1 });
    if (delta === null) {
      return res.render('login_2fa', { title: '2FA Verification - ViewTape', error: 'Invalid 2FA code. Please try again.', username: pending.username });
    }
  } catch (e) {
    return res.render('login_2fa', { title: '2FA Verification - ViewTape', error: 'Error verifying code. Try again.', username: pending.username });
  }

  // 2FA verified - complete login
  req.session.user = { id: pending.id, username: pending.username, avatar: pending.avatar };
  delete req.session.pending2FA;
  try { dbRun('UPDATE users SET last_sign_in = CURRENT_TIMESTAMP WHERE id = ?', [pending.id]); } catch (e) {}
  res.redirect('/');
});

// ========================================
// ACCOUNT 2FA SETUP
// ========================================
router.get('/account/2fa/setup', requireLogin, async (req, res) => {
  const user = dbGet('SELECT totp_secret FROM users WHERE id = ?', [req.session.user.id]);

  // Generate a new secret for setup
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let newSecret = '';
  for (let i = 0; i < 32; i++) newSecret += chars[Math.floor(Math.random() * chars.length)];

  // Store temporarily in session until verified
  req.session.pending2FASetup = newSecret;

  const totp = new TOTP({
    issuer: 'ViewTape',
    label: req.session.user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(newSecret)
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(totp.toString(), { width: 250, margin: 2 });
  } catch (e) { /* QR generation failed */ }

  res.render('account_2fa_setup', {
    title: '2FA Setup - ViewTape',
    secret: newSecret,
    qrDataUrl,
    error: null,
    success: null,
    alreadyEnabled: !!(user && user.totp_secret)
  });
});

router.post('/account/2fa/setup', requireLogin, (req, res) => {
  const { totp_code } = req.body;
  const newSecret = req.session.pending2FASetup;

  if (!newSecret) return res.redirect('/account/2fa/setup');

  if (!totp_code || !totp_code.trim()) {
    return res.redirect('/account/2fa/setup');
  }

  try {
    const totp = new TOTP({
      issuer: 'ViewTape',
      label: req.session.user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(newSecret)
    });

    const delta = totp.validate({ token: totp_code.trim(), window: 1 });
    if (delta === null) {
      return res.redirect('/account/2fa/setup');
    }
  } catch (e) {
    return res.redirect('/account/2fa/setup');
  }

  // Code is valid — save the secret to the user's account
  dbRun('UPDATE users SET totp_secret = ? WHERE id = ?', [newSecret, req.session.user.id]);
  delete req.session.pending2FASetup;
  res.redirect('/channel/' + req.session.user.username + '/settings?twofa=enabled');
});

// ========================================
// ACCOUNT 2FA DISABLE
// ========================================
router.post('/account/2fa/disable', requireLogin, (req, res) => {
  const { totp_code } = req.body;
  const user = dbGet('SELECT totp_secret FROM users WHERE id = ?', [req.session.user.id]);

  if (!user || !user.totp_secret) {
    return res.redirect('/channel/' + req.session.user.username + '/settings');
  }

  if (!totp_code || !totp_code.trim()) {
    return res.redirect('/channel/' + req.session.user.username + '/settings?twofa=invalid');
  }

  try {
    const totp = new TOTP({
      issuer: 'ViewTape',
      label: req.session.user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(user.totp_secret)
    });

    const delta = totp.validate({ token: totp_code.trim(), window: 1 });
    if (delta === null) {
      return res.redirect('/channel/' + req.session.user.username + '/settings?twofa=invalid');
    }
  } catch (e) {
    return res.redirect('/channel/' + req.session.user.username + '/settings?twofa=invalid');
  }

  // Valid code — remove 2FA
  dbRun("UPDATE users SET totp_secret = '' WHERE id = ?", [req.session.user.id]);
  res.redirect('/channel/' + req.session.user.username + '/settings?twofa=disabled');
});

module.exports = router;
