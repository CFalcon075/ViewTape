const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbRun, dbGet } = require('../db/init');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Multer for avatar and banner uploads
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') {
      cb(null, path.join(__dirname, '..', 'uploads', 'avatars'));
    } else if (file.fieldname === 'banner') {
      cb(null, path.join(__dirname, '..', 'uploads', 'banners'));
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    return cb(new Error('Invalid image format. Use JPG, PNG, GIF, or WebP.'));
  }
});

// Channel settings page
router.get('/channel/:username/settings', requireLogin, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.session.user.username !== req.params.username) {
    return res.redirect('/channel/' + req.params.username);
  }
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (!user) return res.redirect('/');
  res.render('channel_settings', {
    title: 'Channel Settings - ViewTape',
    channelUser: user,
    error: null,
    success: null
  });
});

// Save channel settings
router.post('/channel/:username/settings', requireLogin, (req, res) => {
  profileUpload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ])(req, res, function(err) {
    if (err) {
      console.error('[ViewTape] Multer error:', err.message);
      const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
      return res.render('channel_settings', {
        title: 'Channel Settings - ViewTape',
        channelUser: user || req.session.user,
        error: 'Upload error: ' + err.message,
        success: null
      });
    }
    handleSettingsSave(req, res);
  });
});

function handleSettingsSave(req, res) {
  if (req.session.user.username !== req.params.username) {
    return res.redirect('/channel/' + req.params.username);
  }

  const { bio, snow_enabled, display_name, age, website, country, interests, channel_theme,
    custom_page_bg, custom_header_bg, custom_box_bg, custom_text_color, custom_link_color, custom_border_color, custom_header_text } = req.body;
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (!user) return res.redirect('/');

  // Handle avatar upload
  let newAvatar = user.avatar;
  if (req.files && req.files.avatar && req.files.avatar.length > 0) {
    // Delete old custom avatar if it's not a default
    if (user.avatar && user.avatar !== 'pfp1.png' && user.avatar !== 'pfp2.png') {
      const oldPath = path.join(__dirname, '..', 'uploads', 'avatars', user.avatar);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    newAvatar = req.files.avatar[0].filename;
  }

  // Handle banner upload
  let newBanner = user.banner || '';
  if (req.files && req.files.banner && req.files.banner.length > 0) {
    // Delete old banner
    if (user.banner) {
      const oldPath = path.join(__dirname, '..', 'uploads', 'banners', user.banner);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    newBanner = req.files.banner[0].filename;
  }

  const snowVal = snow_enabled === 'on' ? 1 : 0;
  const bioText = (bio || '').trim().substring(0, 500);
  const validThemes = ['grey', 'blue', 'red', 'sunlight', 'forest', '8bit', 'princess', 'fire', 'stealth', 'custom'];
  const themeVal = validThemes.includes(channel_theme) ? channel_theme : 'grey';

  // Build custom colors JSON if custom theme selected
  let customColorsJson = user.custom_colors || '';
  if (themeVal === 'custom') {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    const sanitize = (v) => hexRe.test((v || '').trim()) ? v.trim() : '#ffffff';
    customColorsJson = JSON.stringify({
      page_bg: sanitize(custom_page_bg),
      header_bg: sanitize(custom_header_bg),
      box_bg: sanitize(custom_box_bg),
      text_color: sanitize(custom_text_color),
      link_color: sanitize(custom_link_color),
      border_color: sanitize(custom_border_color),
      header_text: sanitize(custom_header_text)
    });
  }

  dbRun(`UPDATE users SET avatar = ?, banner = ?, bio = ?, snow_enabled = ?,
    display_name = ?, age = ?, website = ?, country = ?, interests = ?, channel_theme = ?, custom_colors = ?
    WHERE id = ?`, [
    newAvatar, newBanner, bioText, snowVal,
    (display_name || '').trim().substring(0, 50),
    (age || '').trim().substring(0, 10),
    (website || '').trim().substring(0, 200),
    (country || '').trim().substring(0, 50),
    (interests || '').trim().substring(0, 300),
    themeVal,
    customColorsJson,
    req.session.user.id
  ]);

  // Update session
  req.session.user.avatar = newAvatar;

  const updatedUser = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  res.render('channel_settings', {
    title: 'Channel Settings - ViewTape',
    channelUser: updatedUser,
    error: null,
    success: 'Channel settings saved!'
  });
}

// Save theme via AJAX (separate from main settings form)
router.post('/channel/:username/save-theme', requireLogin, express.json(), (req, res) => {
  if (req.session.user.username !== req.params.username) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { theme, customColors } = req.body;
  const validThemes = ['grey', 'blue', 'red', 'sunlight', 'forest', '8bit', 'princess', 'fire', 'stealth', 'custom'];
  const themeVal = validThemes.includes(theme) ? theme : 'grey';

  let customColorsJson = '';
  if (themeVal === 'custom' && customColors) {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    const sanitize = (v) => hexRe.test((v || '').trim()) ? v.trim() : '#ffffff';
    customColorsJson = JSON.stringify({
      page_bg: sanitize(customColors.page_bg),
      header_bg: sanitize(customColors.header_bg),
      box_bg: sanitize(customColors.box_bg),
      text_color: sanitize(customColors.text_color),
      link_color: sanitize(customColors.link_color),
      border_color: sanitize(customColors.border_color),
      header_text: sanitize(customColors.header_text)
    });
  }

  dbRun('UPDATE users SET channel_theme = ?, custom_colors = ? WHERE id = ?',
    [themeVal, customColorsJson || (dbGet('SELECT custom_colors FROM users WHERE id = ?', [req.session.user.id]) || {}).custom_colors || '', req.session.user.id]);

  res.json({ success: true, theme: themeVal });
});

// Remove banner
router.post('/channel/:username/remove-banner', requireLogin, (req, res) => {
  if (req.session.user.username !== req.params.username) {
    return res.redirect('/channel/' + req.params.username);
  }
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (user && user.banner) {
    const oldPath = path.join(__dirname, '..', 'uploads', 'banners', user.banner);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  dbRun("UPDATE users SET banner = '' WHERE id = ?", [req.session.user.id]);
  res.redirect('/channel/' + req.params.username + '/settings');
});

// Reset avatar to default
router.post('/channel/:username/reset-avatar', requireLogin, (req, res) => {
  if (req.session.user.username !== req.params.username) {
    return res.redirect('/channel/' + req.params.username);
  }
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (user && user.avatar && user.avatar !== 'pfp1.png' && user.avatar !== 'pfp2.png') {
    const oldPath = path.join(__dirname, '..', 'uploads', 'avatars', user.avatar);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  dbRun("UPDATE users SET avatar = 'pfp1.png' WHERE id = ?", [req.session.user.id]);
  req.session.user.avatar = 'pfp1.png';
  res.redirect('/channel/' + req.params.username + '/settings');
});

module.exports = router;
