const express = require('express');
const { dbRun } = require('../db/init');
const router = express.Router();

router.post('/comment', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { video_id, text } = req.body;
  if (!video_id || !text || text.trim().length === 0) {
    return res.redirect('/watch?v=' + (video_id || ''));
  }
  dbRun('INSERT INTO comments (video_id, user_id, text) VALUES (?, ?, ?)', [parseInt(video_id), req.session.user.id, text.trim()]);
  res.redirect('/watch?v=' + video_id);
});

router.post('/delete-comment', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { comment_id, video_id } = req.body;
  dbRun('DELETE FROM comments WHERE id = ? AND user_id = ?', [parseInt(comment_id), req.session.user.id]);
  res.redirect('/watch?v=' + video_id);
});

module.exports = router;
