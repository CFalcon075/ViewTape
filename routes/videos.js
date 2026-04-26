const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbRun, dbGet, dbAll } = require('../db/init');
const router = express.Router();

const VIDEO_UPLOAD_MAX_BYTES = 30 * 1024 * 1024 * 1024;

const CATEGORIES = [
  'Autos & Vehicles', 'Comedy', 'Education', 'Entertainment',
  'Film & Animation', 'Gaming', 'Howto & Style', 'Music',
  'News & Politics', 'Nonprofits & Activism', 'People & Blogs',
  'Pets & Animals', 'Science & Technology', 'Sports', 'Travel & Events'
];

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      cb(null, path.join(__dirname, '..', 'uploads', 'videos'));
    } else if (file.fieldname === 'thumbnail') {
      cb(null, path.join(__dirname, '..', 'uploads', 'thumbnails'));
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const allowed = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      return cb(new Error('Invalid video format.'));
    }
    if (file.fieldname === 'thumbnail') {
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) return cb(null, true);
      return cb(new Error('Invalid image format.'));
    }
    cb(null, false);
  }
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve) => {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x240'
        })
        .on('end', () => resolve(true))
        .on('error', (err) => {
          console.warn('[ViewTape] ffmpeg thumbnail generation failed:', err.message);
          resolve(false);
        });
    } catch (err) {
      console.warn('[ViewTape] ffmpeg not available:', err.message);
      resolve(false);
    }
  });
}

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err || !metadata) return resolve(0);
        resolve(metadata.format.duration || 0);
      });
    } catch {
      resolve(0);
    }
  });
}

async function createUploadedVideo(userId, body, files) {
  const videoFile = files.video[0];
  let thumbnailFilename = '';

  if (files.thumbnail && files.thumbnail.length > 0) {
    thumbnailFilename = files.thumbnail[0].filename;
  } else {
    const thumbPath = path.join(__dirname, '..', 'uploads', 'thumbnails', videoFile.filename.replace(path.extname(videoFile.filename), '.png'));
    const generated = await generateThumbnail(
      path.join(__dirname, '..', 'uploads', 'videos', videoFile.filename),
      thumbPath
    );
    if (generated) {
      thumbnailFilename = path.basename(thumbPath);
    }
  }

  const duration = await getVideoDuration(path.join(__dirname, '..', 'uploads', 'videos', videoFile.filename));
  const result = dbRun(`
    INSERT INTO videos (user_id, title, description, category, tags, filename, thumbnail, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    body.title.trim(),
    (body.description || '').trim(),
    body.category || 'Entertainment',
    (body.tags || '').trim(),
    videoFile.filename,
    thumbnailFilename,
    duration
  ]);

  return dbGet('SELECT * FROM videos WHERE id = ?', [result.lastInsertRowid]);
}

function notifySubscribers(user, video) {
  try {
    const subscribers = dbAll(
      'SELECT subscriber_id FROM subscriptions WHERE channel_id = ?',
      [user.id]
    );
    for (const sub of subscribers) {
      dbRun(
        "INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'new_video', ?, ?)",
        [sub.subscriber_id, user.username + ' uploaded: ' + video.title, '/watch?v=' + video.id]
      );
    }
  } catch (e) { /* notifications table may not exist yet */ }
}

function getVideoWithUser(videoId) {
  return dbGet(`
    SELECT videos.*, users.username, users.avatar
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.id = ?
  `, [videoId]);
}

function getVideoResponseFormData(userId, targetVideoId) {
  const targetVideo = getVideoWithUser(targetVideoId);
  if (!targetVideo) return null;

  const userVideos = dbAll(`
    SELECT videos.*
    FROM videos
    WHERE user_id = ? AND id != ?
    ORDER BY created_at DESC
  `, [userId, targetVideoId]);

  return { targetVideo, userVideos };
}

function renderVideoResponsePage(res, userId, targetVideoId, error) {
  const data = getVideoResponseFormData(userId, targetVideoId);
  if (!data) {
    return res.status(404).render('404', { title: 'Video Not Found' });
  }
  return res.render('video_response', {
    title: 'Post a Video Response - ViewTape',
    categories: CATEGORIES,
    error: error || null,
    targetVideo: data.targetVideo,
    userVideos: data.userVideos
  });
}

function createVideoResponse(parentVideoId, responseVideoId, userId) {
  if (parentVideoId === responseVideoId) {
    throw new Error('A video cannot respond to itself.');
  }

  const duplicate = dbGet(
    'SELECT id FROM video_responses WHERE parent_video_id = ? AND response_video_id = ?',
    [parentVideoId, responseVideoId]
  );
  if (duplicate) {
    throw new Error('That video is already posted as a response.');
  }

  dbRun(`
    INSERT INTO video_responses (parent_video_id, response_video_id, user_id)
    VALUES (?, ?, ?)
  `, [parentVideoId, responseVideoId, userId]);
}

// Homepage
router.get('/', (req, res) => {
  const recentVideos = dbAll(`
    SELECT videos.*, users.username, users.avatar,
      (SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as avg_rating,
      (SELECT COUNT(*) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as rating_count
    FROM videos JOIN users ON videos.user_id = users.id
    ORDER BY videos.created_at DESC LIMIT 20
  `);
  const popularVideos = dbAll(`
    SELECT videos.*, users.username, users.avatar,
      (SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as avg_rating
    FROM videos JOIN users ON videos.user_id = users.id
    ORDER BY videos.views DESC LIMIT 10
  `);
  res.render('index', { title: 'ViewTape - Share Ep0k Stuff!', recentVideos, popularVideos, categories: CATEGORIES });
});

// Upload page
router.get('/upload', requireLogin, (req, res) => {
  res.render('upload', { title: 'Upload Video - ViewTape', categories: CATEGORIES, error: null });
});

router.post('/upload', requireLogin, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  if (!req.files || !req.files.video || req.files.video.length === 0) {
    return res.render('upload', { title: 'Upload Video - ViewTape', categories: CATEGORIES, error: 'Please select a video file.' });
  }
  const { title } = req.body;
  if (!title || title.trim().length === 0) {
    return res.render('upload', { title: 'Upload Video - ViewTape', categories: CATEGORIES, error: 'Title is required.' });
  }

  try {
    const video = await createUploadedVideo(req.session.user.id, req.body, req.files);
    notifySubscribers(req.session.user, video);
    res.redirect('/watch?v=' + video.id);
  } catch (err) {
    console.error('[ViewTape] Upload error:', err);
    res.render('upload', { title: 'Upload Video - ViewTape', categories: CATEGORIES, error: 'Upload failed. Try again.' });
  }
});

// Video response page
router.get('/video-response', requireLogin, (req, res) => {
  const targetVideoId = parseInt(req.query.v);
  if (!targetVideoId) return res.redirect('/');
  return renderVideoResponsePage(res, req.session.user.id, targetVideoId, null);
});

router.post('/video-response/choose', requireLogin, (req, res) => {
  const parentVideoId = parseInt(req.body.parent_video_id);
  const responseVideoId = parseInt(req.body.response_video_id);
  if (!parentVideoId || !responseVideoId) {
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, 'Please choose one of your videos.');
  }

  const targetVideo = getVideoWithUser(parentVideoId);
  const responseVideo = dbGet('SELECT * FROM videos WHERE id = ? AND user_id = ?', [responseVideoId, req.session.user.id]);
  if (!targetVideo) return res.status(404).render('404', { title: 'Video Not Found' });
  if (!responseVideo) {
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, 'That response video could not be found on your channel.');
  }

  try {
    createVideoResponse(parentVideoId, responseVideoId, req.session.user.id);
    res.redirect('/watch?v=' + parentVideoId + '#video-responses');
  } catch (err) {
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, err.message);
  }
});

router.post('/video-response/upload', requireLogin, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  const parentVideoId = parseInt(req.body.parent_video_id);
  if (!parentVideoId) return res.redirect('/');
  if (!req.files || !req.files.video || req.files.video.length === 0) {
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, 'Please select a video file.');
  }

  const { title } = req.body;
  if (!title || title.trim().length === 0) {
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, 'Title is required.');
  }

  const targetVideo = getVideoWithUser(parentVideoId);
  if (!targetVideo) return res.status(404).render('404', { title: 'Video Not Found' });

  try {
    const video = await createUploadedVideo(req.session.user.id, req.body, req.files);
    createVideoResponse(parentVideoId, video.id, req.session.user.id);
    notifySubscribers(req.session.user, video);
    res.redirect('/watch?v=' + parentVideoId + '#video-responses');
  } catch (err) {
    console.error('[ViewTape] Video response upload error:', err);
    return renderVideoResponsePage(res, req.session.user.id, parentVideoId, 'Video response upload failed. Try again.');
  }
});

// Embeddable player
router.get('/embed/:id', (req, res) => {
  const videoId = parseInt(req.params.id);
  if (!videoId) return res.status(404).send('Video not found');

  const video = getVideoWithUser(videoId);
  if (!video) return res.status(404).send('Video not found');

  res.render('embed', {
    title: video.title + ' - ViewTape Embed',
    video
  });
});

// Watch page
router.get('/watch', (req, res) => {
  const videoId = parseInt(req.query.v);
  if (!videoId) return res.redirect('/');

  const video = dbGet(`
    SELECT videos.*, users.username, users.avatar
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.id = ?
  `, [videoId]);

  if (!video) {
    return res.status(404).render('404', { title: 'Video Not Found' });
  }

  // Increment views only once per session per video
  if (!req.session.viewedVideos) req.session.viewedVideos = {};
  const alreadyViewed = !!req.session.viewedVideos[videoId];
  if (!alreadyViewed) {
    dbRun('UPDATE videos SET views = views + 1 WHERE id = ?', [videoId]);
    req.session.viewedVideos[videoId] = true;
    // Increment videos_watched for logged-in user
    if (req.session.user) {
      try { dbRun('UPDATE users SET videos_watched = videos_watched + 1 WHERE id = ?', [req.session.user.id]); } catch (e) {}
    }
  }

  const comments = dbAll(`
    SELECT comments.*, users.username, users.avatar
    FROM comments JOIN users ON comments.user_id = users.id
    WHERE comments.video_id = ?
    ORDER BY comments.created_at DESC
  `, [videoId]);

  const ratingStats = dbGet(`
    SELECT
      COALESCE(AVG(CASE WHEN stars > 0 THEN stars END), 0) as avg_rating,
      COUNT(CASE WHEN stars > 0 THEN 1 END) as rating_count,
      COUNT(CASE WHEN thumb = 'up' THEN 1 END) as thumbs_up,
      COUNT(CASE WHEN thumb = 'down' THEN 1 END) as thumbs_down
    FROM ratings WHERE video_id = ?
  `, [videoId]);

  let userRating = null;
  if (req.session.user) {
    userRating = dbGet('SELECT * FROM ratings WHERE video_id = ? AND user_id = ?', [videoId, req.session.user.id]);
  }

  const relatedVideos = dbAll(`
    SELECT videos.*, users.username, users.avatar
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.id != ? AND videos.category = ?
    ORDER BY videos.views DESC LIMIT 10
  `, [videoId, video.category]);

  let moreRelated = [];
  if (relatedVideos.length < 5) {
    const excludeIds = relatedVideos.map(v => v.id).concat([videoId]);
    moreRelated = dbAll(`
      SELECT videos.*, users.username, users.avatar
      FROM videos JOIN users ON videos.user_id = users.id
      WHERE videos.id NOT IN (${excludeIds.join(',')})
      ORDER BY RANDOM() LIMIT ?
    `, [10 - relatedVideos.length]);
  }

  const videoResponses = dbAll(`
    SELECT video_responses.created_at as response_created_at, videos.*, users.username, users.avatar
    FROM video_responses
    JOIN videos ON video_responses.response_video_id = videos.id
    JOIN users ON videos.user_id = users.id
    WHERE video_responses.parent_video_id = ?
    ORDER BY video_responses.created_at DESC
  `, [videoId]);

  const moreFromChannel = dbAll(`
    SELECT videos.*, users.username, users.avatar
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.id != ? AND videos.user_id = ?
    ORDER BY videos.created_at DESC LIMIT 30
  `, [videoId, video.user_id]);

  // Subscription data for watch page
  let isSubscribed = false;
  let subscriberCount = 0;
  try {
    const subCountResult = dbGet('SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = ?', [video.user_id]);
    subscriberCount = subCountResult ? subCountResult.count : 0;
    if (req.session.user) {
      const subCheck = dbGet('SELECT id FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?',
        [req.session.user.id, video.user_id]);
      isSubscribed = !!subCheck;
    }
  } catch (e) { /* subscriptions table may not exist yet */ }

  // User playlists for "Add to Playlist" on watch page
  let userPlaylists = [];
  if (req.session.user) {
    try {
      userPlaylists = dbAll('SELECT id, name, is_quicklist FROM playlists WHERE user_id = ? ORDER BY is_quicklist DESC, created_at DESC', [req.session.user.id]);
    } catch (e) { /* table may not exist yet */ }
  }

  const origin = req.protocol + '://' + req.get('host');
  const shareUrl = origin + '/watch?v=' + videoId;
  const embedUrl = origin + '/embed/' + videoId;
  const embedCode = '<iframe width="425" height="344" src="' + embedUrl + '" frameborder="0" allowfullscreen></iframe>';

  res.render('watch', {
    title: video.title + ' - ViewTape',
    video: { ...video, views: alreadyViewed ? video.views : video.views + 1 },
    comments,
    ratingStats: ratingStats || { avg_rating: 0, rating_count: 0, thumbs_up: 0, thumbs_down: 0 },
    userRating,
    relatedVideos: [...relatedVideos, ...moreRelated],
    videoResponses,
    moreFromChannel,
    isSubscribed,
    subscriberCount,
    userPlaylists,
    shareUrl,
    embedCode
  });
});

// Search
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.redirect('/');

  const pattern = '%' + q + '%';
  const videos = dbAll(`
    SELECT videos.*, users.username, users.avatar,
      (SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as avg_rating
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.title LIKE ? OR videos.description LIKE ? OR videos.tags LIKE ?
    ORDER BY videos.views DESC LIMIT 50
  `, [pattern, pattern, pattern]);

  const channels = dbAll(`
    SELECT users.id, users.username, users.avatar, users.bio,
      (SELECT COUNT(*) FROM videos WHERE videos.user_id = users.id) as video_count,
      (SELECT COUNT(*) FROM subscriptions WHERE subscriptions.channel_id = users.id) as subscriber_count
    FROM users
    WHERE users.username LIKE ?
    ORDER BY subscriber_count DESC LIMIT 20
  `, [pattern]);

  res.render('search', { title: 'Search: ' + q + ' - ViewTape', query: q, videos, channels, categories: CATEGORIES });
});

// Categories
router.get('/categories', (req, res) => {
  res.render('categories', { title: 'Categories - ViewTape', categories: CATEGORIES });
});

router.get('/category/:name', (req, res) => {
  const category = req.params.name;
  const videos = dbAll(`
    SELECT videos.*, users.username, users.avatar,
      (SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as avg_rating
    FROM videos JOIN users ON videos.user_id = users.id
    WHERE videos.category = ?
    ORDER BY videos.created_at DESC LIMIT 50
  `, [category]);
  res.render('category', { title: category + ' - ViewTape', category, videos });
});

// Channel page
router.get('/channel/:username', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const user = dbGet('SELECT * FROM users WHERE username = ?', [req.params.username]);
  if (!user) {
    return res.status(404).render('404', { title: 'Channel Not Found' });
  }
  const videos = dbAll(`
    SELECT videos.*,
      (SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE ratings.video_id = videos.id AND stars > 0) as avg_rating
    FROM videos WHERE user_id = ? ORDER BY created_at DESC
  `, [user.id]);
  // Subscription data for channel page
  let isSubscribed = false;
  let subscriberCount = 0;
  try {
    const subCountResult = dbGet('SELECT COUNT(*) as count FROM subscriptions WHERE channel_id = ?', [user.id]);
    subscriberCount = subCountResult ? subCountResult.count : 0;
    if (req.session.user) {
      const subCheck = dbGet('SELECT id FROM subscriptions WHERE subscriber_id = ? AND channel_id = ?',
        [req.session.user.id, user.id]);
      isSubscribed = !!subCheck;
    }
  } catch (e) { /* subscriptions table may not exist yet */ }

  // Channel views = sum of all video views
  let channelViews = 0;
  try {
    const cv = dbGet('SELECT COALESCE(SUM(views), 0) as total FROM videos WHERE user_id = ?', [user.id]);
    channelViews = cv ? cv.total : 0;
  } catch (e) {}

  // Recent activity
  let recentActivity = [];
  try {
    recentActivity = dbAll(`
      SELECT * FROM activity WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 20
    `, [user.id]);
  } catch (e) {}

  // User playlists (public)
  let userPlaylists = [];
  try {
    userPlaylists = dbAll(`
      SELECT playlists.*,
        (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = playlists.id) as video_count
      FROM playlists WHERE user_id = ? AND is_quicklist = 0
      ORDER BY created_at DESC
    `, [user.id]);
  } catch (e) {}

  res.render('channel', {
    title: user.username + ' - ViewTape',
    channelUser: user,
    videos,
    isSubscribed,
    subscriberCount,
    channelViews,
    recentActivity,
    userPlaylists
  });
});

// Delete video
router.post('/delete-video', requireLogin, (req, res) => {
  const { video_id } = req.body;
  const video = dbGet('SELECT * FROM videos WHERE id = ? AND user_id = ?', [parseInt(video_id), req.session.user.id]);
  if (!video) {
    return res.redirect('/');
  }
  // Delete files
  const videoPath = path.join(__dirname, '..', 'uploads', 'videos', video.filename);
  const thumbPath = path.join(__dirname, '..', 'uploads', 'thumbnails', video.thumbnail);
  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  if (video.thumbnail && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

  dbRun('DELETE FROM comments WHERE video_id = ?', [parseInt(video_id)]);
  dbRun('DELETE FROM ratings WHERE video_id = ?', [parseInt(video_id)]);
  dbRun('DELETE FROM videos WHERE id = ?', [parseInt(video_id)]);
  res.redirect('/channel/' + req.session.user.username);
});

router.CATEGORIES = CATEGORIES;
router.VIDEO_UPLOAD_MAX_BYTES = VIDEO_UPLOAD_MAX_BYTES;

module.exports = router;
