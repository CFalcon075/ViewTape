const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/init');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Subscribe / Unsubscribe toggle
router.post('/subscribe', requireLogin, (req, res) => {
  const channelId = parseInt(req.body.channel_id);
  const subscriberId = req.session.user.id;
  const returnTo = req.body.return_to || '/';

  if (!channelId || channelId === subscriberId) {
    return res.redirect(returnTo);
  }

  // Check if already subscribed
  const existing = dbGet(
    'SELECT id FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?',
    [subscriberId, channelId]
  );

  if (existing) {
    // Unsubscribe
    dbRun('DELETE FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?',
      [subscriberId, channelId]);
  } else {
    // Subscribe
    dbRun('INSERT INTO subscriptions (subscriber_id, channel_id) VALUES (?, ?)',
      [subscriberId, channelId]);
    // Log activity
    try {
      const channelUser = dbGet('SELECT username, avatar FROM users WHERE id = ?', [channelId]);
      if (channelUser) {
        dbRun('INSERT INTO activity (user_id, action_type, target_id, target_title, target_user) VALUES (?, ?, ?, ?, ?)',
          [subscriberId, 'subscribed', channelId, channelUser.username, channelUser.username]);
      }
    } catch (e) {}
  }

  res.redirect(returnTo);
});

// Subscriptions feed page
router.get('/subscriptions', requireLogin, (req, res) => {
  const userId = req.session.user.id;

  const channels = dbAll(`
    SELECT users.id, users.username, users.avatar,
      (SELECT COUNT(*) FROM subscriptions WHERE channel_id = users.id) as subscriber_count
    FROM subscriptions
    JOIN users ON subscriptions.channel_id = users.id
    WHERE subscriptions.subscriber_id = ?
    ORDER BY subscriptions.created_at DESC
  `, [userId]);

  res.render('subscriptions', {
    title: 'My Subscriptions - ViewTape',
    channels
  });
});

// Notifications page
router.get('/notifications', requireLogin, (req, res) => {
  const userId = req.session.user.id;

  const notifications = dbAll(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `, [userId]);

  // Mark all as read
  dbRun('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]);

  res.render('notifications', {
    title: 'Notifications - ViewTape',
    notifications
  });
});

// Mark single notification as read
router.post('/notifications/read', requireLogin, (req, res) => {
  const notifId = parseInt(req.body.notification_id);
  if (notifId) {
    dbRun('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notifId, req.session.user.id]);
  }
  const link = req.body.link || '/notifications';
  res.redirect(link);
});

module.exports = router;
