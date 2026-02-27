const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/init');
const router = express.Router();

function logActivity(userId, actionType, targetId, targetTitle, targetThumb, targetUser) {
  try {
    dbRun('INSERT INTO activity (user_id, action_type, target_id, target_title, target_thumb, target_user) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, actionType, targetId || 0, targetTitle || '', targetThumb || '', targetUser || '']);
  } catch (e) { /* activity table may not exist yet */ }
}

router.post('/rate', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { video_id, stars, thumb } = req.body;
  if (!video_id) return res.redirect('/');

  const vid = parseInt(video_id);

  // Prevent video authors from rating their own videos
  const video = dbGet('SELECT user_id FROM videos WHERE id = ?', [vid]);
  if (video && video.user_id === req.session.user.id) {
    return res.redirect('/watch?v=' + video_id);
  }

  const existing = dbGet('SELECT * FROM ratings WHERE video_id = ? AND user_id = ?', [vid, req.session.user.id]);

  // Get video info for activity logging
  const videoInfo = dbGet('SELECT title, thumbnail FROM videos WHERE id = ?', [vid]);
  const uploaderInfo = dbGet('SELECT username FROM users WHERE id = ?', [video.user_id]);

  if (existing) {
    if (stars) {
      dbRun('UPDATE ratings SET stars = ? WHERE id = ?', [parseInt(stars), existing.id]);
      logActivity(req.session.user.id, 'rated', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploaderInfo ? uploaderInfo.username : '');
    }
    if (thumb) {
      const newThumb = existing.thumb === thumb ? null : thumb;
      dbRun('UPDATE ratings SET thumb = ? WHERE id = ?', [newThumb, existing.id]);
      if (newThumb === 'up') {
        logActivity(req.session.user.id, 'liked', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploaderInfo ? uploaderInfo.username : '');
      }
    }
  } else {
    dbRun('INSERT INTO ratings (video_id, user_id, stars, thumb) VALUES (?, ?, ?, ?)', [
      vid,
      req.session.user.id,
      stars ? parseInt(stars) : 0,
      thumb || null
    ]);
    if (thumb === 'up') {
      logActivity(req.session.user.id, 'liked', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploaderInfo ? uploaderInfo.username : '');
    }
    if (stars) {
      logActivity(req.session.user.id, 'rated', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploaderInfo ? uploaderInfo.username : '');
    }
  }
  res.redirect('/watch?v=' + video_id);
});

module.exports = router;
