const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initializeDb, dbGet } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'viewtape-secret-change-me';

// Ensure upload directories exist
const uploadDirs = [
  path.join(__dirname, 'uploads', 'videos'),
  path.join(__dirname, 'uploads', 'thumbnails'),
  path.join(__dirname, 'uploads', 'avatars'),
  path.join(__dirname, 'uploads', 'banners')
];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Make user + notification count available to all templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.unreadNotifications = 0;
  if (req.session.user) {
    try {
      const result = dbGet(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
        [req.session.user.id]
      );
      res.locals.unreadNotifications = result ? result.count : 0;
    } catch (e) { /* table may not exist yet */ }
  }
  next();
});

// Static files (always accessible, even behind the gate)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/icons', express.static(path.join(__dirname, 'Icons')));

// Server gate (password + 2FA protection)
const gateRoutes = require('./routes/gate');
app.use('/', gateRoutes);

// Server gate middleware - block all other routes if not authenticated
if (gateRoutes.isGateEnabled()) {
  app.use((req, res, next) => {
    // Allow gate routes and static assets through
    if (req.path.startsWith('/gate')) return next();
    if (req.session.serverAuthenticated) return next();
    return res.redirect('/gate');
  });
  console.log('[ViewTape] Server password protection ENABLED');
}

// Routes
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const commentRoutes = require('./routes/comments');
const ratingRoutes = require('./routes/ratings');
const channelRoutes = require('./routes/channel');
const subscriptionRoutes = require('./routes/subscriptions');
const playlistRoutes = require('./routes/playlists');

app.use('/', authRoutes);
app.use('/', channelRoutes);
app.use('/', subscriptionRoutes);
app.use('/', playlistRoutes);
app.use('/', videoRoutes);
app.use('/', commentRoutes);
app.use('/', ratingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// General error handler (multer errors, etc.)
app.use((err, req, res, next) => {
  console.error('[ViewTape] Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).render('upload', {
      title: 'Upload Video - ViewTape',
      categories: require('./routes/videos').CATEGORIES || [],
      error: 'File too large. Maximum size is 5GB.'
    });
  }
  res.status(500).send('Something went wrong. Please try again.');
});

// Initialize database (async) then start server
(async () => {
  await initializeDb();
  app.listen(PORT, HOST, () => {
    console.log(`[ViewTape] Server running at http://localhost:${PORT}`);
    if (HOST === '0.0.0.0') {
      // Show actual LAN IP for easy sharing
      const os = require('os');
      const http = require('http');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const iface of nets[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`[ViewTape] LAN access: http://${iface.address}:${PORT}`);
          }
        }
      }
      // Detect public IP for internet sharing
      const ipReq = http.get('http://api.ipify.org', { timeout: 5000 }, (ipRes) => {
        let ipData = '';
        ipRes.on('data', (c) => { ipData += c; });
        ipRes.on('end', () => {
          const pubIP = ipData.trim();
          if (pubIP) {
            console.log(`[ViewTape] Public IP: http://${pubIP}:${PORT}`);
            console.log(`[ViewTape] Share this with friends (port ${PORT} must be forwarded on your router)`);
          }
        });
      });
      ipReq.on('error', () => {});
      ipReq.on('timeout', () => { ipReq.destroy(); });
    } else {
      console.log(`[ViewTape] Bound to ${HOST} only (no external access)`);
    }
    if (process.env.SERVER_PASSWORD) {
      console.log('[ViewTape] Password protection: ON');
      if (process.env.SERVER_2FA_SECRET) console.log('[ViewTape] 2FA: ON');
    }
    console.log('[ViewTape] Press Ctrl+C to stop.');
  });
})();
