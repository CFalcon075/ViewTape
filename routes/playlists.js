const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db/init');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Ensure user has a QuickList (auto-create if missing)
function getOrCreateQuicklist(userId) {
  let ql = dbGet('SELECT * FROM playlists WHERE user_id = ? AND is_quicklist = 1', [userId]);
  if (!ql) {
    dbRun('INSERT INTO playlists (user_id, name, is_quicklist) VALUES (?, ?, 1)', [userId, 'QuickList']);
    ql = dbGet('SELECT * FROM playlists WHERE user_id = ? AND is_quicklist = 1', [userId]);
  }
  return ql;
}

// My playlists page
router.get('/playlists', requireLogin, (req, res) => {
  const userId = req.session.user.id;
  const playlists = dbAll(`
    SELECT playlists.*,
      (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = playlists.id) as video_count
    FROM playlists
    WHERE user_id = ?
    ORDER BY is_quicklist DESC, created_at DESC
  `, [userId]);

  res.render('playlists', {
    title: 'My Playlists - ViewTape',
    playlists
  });
});

// Create new playlist
router.post('/playlists/create', requireLogin, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.redirect('/playlists');

  dbRun('INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)', [
    req.session.user.id,
    name.trim(),
    (description || '').trim()
  ]);
  res.redirect('/playlists');
});

// View a playlist
router.get('/playlist/:id', (req, res) => {
  const playlistId = parseInt(req.params.id);
  const playlist = dbGet(`
    SELECT playlists.*, users.username
    FROM playlists JOIN users ON playlists.user_id = users.id
    WHERE playlists.id = ?
  `, [playlistId]);

  if (!playlist) {
    return res.status(404).render('404', { title: 'Playlist Not Found' });
  }

  const videos = dbAll(`
    SELECT videos.*, users.username, users.avatar, playlist_items.position, playlist_items.id as item_id
    FROM playlist_items
    JOIN videos ON playlist_items.video_id = videos.id
    JOIN users ON videos.user_id = users.id
    WHERE playlist_items.playlist_id = ?
    ORDER BY playlist_items.position ASC, playlist_items.added_at ASC
  `, [playlistId]);

  const isOwner = req.session.user && req.session.user.id === playlist.user_id;

  res.render('playlist', {
    title: playlist.name + ' - ViewTape',
    playlist,
    videos,
    isOwner
  });
});

// Add video to playlist (AJAX-friendly + form fallback)
router.post('/playlist/add', requireLogin, (req, res) => {
  const { video_id, playlist_id, return_to } = req.body;
  const vid = parseInt(video_id);
  const pid = parseInt(playlist_id);
  const wantsJson = req.headers['accept'] && req.headers['accept'].includes('application/json');
  if (!vid || !pid) {
    if (wantsJson) return res.json({ success: false, error: 'Missing video or playlist ID' });
    return res.redirect(return_to || '/');
  }

  // Verify playlist belongs to user
  const playlist = dbGet('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [pid, req.session.user.id]);
  if (!playlist) {
    if (wantsJson) return res.json({ success: false, error: 'Playlist not found' });
    return res.redirect(return_to || '/');
  }

  // Check if already in playlist
  const existing = dbGet('SELECT id FROM playlist_items WHERE playlist_id = ? AND video_id = ?', [pid, vid]);
  if (existing) {
    if (wantsJson) return res.json({ success: false, duplicate: true, message: 'Already in this playlist' });
    return res.redirect(return_to || '/watch?v=' + vid);
  }

  // Get next position
  const maxPos = dbGet('SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_items WHERE playlist_id = ?', [pid]);
  const nextPos = maxPos ? maxPos.max_pos + 1 : 1;

  try {
    dbRun('INSERT INTO playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)', [pid, vid, nextPos]);
    // Log activity
    const videoInfo = dbGet('SELECT title, thumbnail, user_id FROM videos WHERE id = ?', [vid]);
    const uploader = videoInfo ? dbGet('SELECT username FROM users WHERE id = ?', [videoInfo.user_id]) : null;
    dbRun('INSERT INTO activity (user_id, action_type, target_id, target_title, target_thumb, target_user) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, 'favorited', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploader ? uploader.username : '']);
  } catch (e) {
    if (wantsJson) return res.json({ success: false, duplicate: true, message: 'Already in this playlist' });
  }

  if (wantsJson) return res.json({ success: true, message: 'Added to ' + playlist.name });
  res.redirect(return_to || '/watch?v=' + vid);
});

// Add to QuickList shortcut
router.post('/quicklist/add', requireLogin, (req, res) => {
  const { video_id, return_to } = req.body;
  const vid = parseInt(video_id);
  const wantsJson = req.headers['accept'] && req.headers['accept'].includes('application/json');
  if (!vid) {
    if (wantsJson) return res.json({ success: false, error: 'Missing video ID' });
    return res.redirect(return_to || '/');
  }

  const ql = getOrCreateQuicklist(req.session.user.id);

  // Check if already in quicklist
  const existing = dbGet('SELECT id FROM playlist_items WHERE playlist_id = ? AND video_id = ?', [ql.id, vid]);
  if (existing) {
    if (wantsJson) return res.json({ success: false, duplicate: true, message: 'Already in QuickList' });
    return res.redirect(return_to || '/watch?v=' + vid);
  }

  const maxPos = dbGet('SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_items WHERE playlist_id = ?', [ql.id]);
  const nextPos = maxPos ? maxPos.max_pos + 1 : 1;

  try {
    dbRun('INSERT INTO playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)', [ql.id, vid, nextPos]);
    // Log activity
    const videoInfo = dbGet('SELECT title, thumbnail, user_id FROM videos WHERE id = ?', [vid]);
    const uploader = videoInfo ? dbGet('SELECT username FROM users WHERE id = ?', [videoInfo.user_id]) : null;
    dbRun('INSERT INTO activity (user_id, action_type, target_id, target_title, target_thumb, target_user) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.user.id, 'favorited', vid, videoInfo ? videoInfo.title : '', videoInfo ? videoInfo.thumbnail : '', uploader ? uploader.username : '']);
  } catch (e) {
    if (wantsJson) return res.json({ success: false, duplicate: true, message: 'Already in QuickList' });
  }

  if (wantsJson) return res.json({ success: true, message: 'Added to QuickList!' });
  res.redirect(return_to || '/watch?v=' + vid);
});

// Remove video from playlist
router.post('/playlist/remove', requireLogin, (req, res) => {
  const { item_id, playlist_id, return_to } = req.body;
  const iid = parseInt(item_id);
  const pid = parseInt(playlist_id);

  // Verify ownership
  const playlist = dbGet('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [pid, req.session.user.id]);
  if (playlist) {
    dbRun('DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?', [iid, pid]);
  }
  res.redirect(return_to || '/playlist/' + pid);
});

// Delete playlist
router.post('/playlists/delete', requireLogin, (req, res) => {
  const pid = parseInt(req.body.playlist_id);
  const playlist = dbGet('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [pid, req.session.user.id]);
  if (playlist) {
    dbRun('DELETE FROM playlist_items WHERE playlist_id = ?', [pid]);
    dbRun('DELETE FROM playlists WHERE id = ?', [pid]);
  }
  res.redirect('/playlists');
});

// Channels listing page
router.get('/channels', (req, res) => {
  const channels = dbAll(`
    SELECT users.id, users.username, users.avatar, users.bio, users.created_at,
      (SELECT COUNT(*) FROM videos WHERE videos.user_id = users.id) as video_count,
      (SELECT COUNT(*) FROM subscriptions WHERE subscriptions.channel_id = users.id) as subscriber_count
    FROM users
    WHERE (SELECT COUNT(*) FROM videos WHERE videos.user_id = users.id) > 0
    ORDER BY subscriber_count DESC, video_count DESC
  `);
  res.render('channels', {
    title: 'Channels - ViewTape',
    channels
  });
});

module.exports = router;
