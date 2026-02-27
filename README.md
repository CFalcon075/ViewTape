# ViewTape - Share Ep0k Stuff!

A self-hosted, 2007-era YouTube-style video sharing website built with Node.js and SQLite.

## Features

- **2007 YouTube aesthetic** - Web 2.0 design with tabs, gradients, and classic styling
- **User accounts** - Sign up, log in, customizable profiles
- **Channel customization** - Custom profile picture, banner image, bio, and falling snow animation
- **Video upload** - Upload videos with titles, descriptions, categories, and tags
- **Custom HTML5 player** - 2007-style video player with play/pause, timeline, volume, fullscreen
- **Comments** - Post and delete comments on videos
- **Ratings** - 5-star ratings AND thumbs up/down
- **Search** - Search videos by title, description, or tags
- **Categories** - Browse videos by category
- **Channel pages** - View any user's uploaded videos
- **Auto-thumbnails** - Automatic thumbnail generation via ffmpeg (optional)

---

## Quick Start

### Windows
Double-click `start.bat` — it will install everything, start the server, and open your browser automatically.

Or run in a terminal:
```
start.bat
```

### Linux / Mac
```bash
chmod +x start.sh
./start.sh
```

### Manual
```bash
npm install
node server.js
```

Your browser will open to **http://localhost:3000** automatically. If it doesn't, just open that URL yourself.

---

## Step 1: Install Node.js

Node.js is what runs the server. You need it.

### Windows

1. Go to https://nodejs.org/
2. Click the big green **"Download"** button (pick the LTS version)
3. Run the installer — just click **Next, Next, Next, Install**
4. When it's done, open a Command Prompt and type `node --version` — you should see a version number. That means it worked!

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install nodejs npm
```

### Mac

```bash
brew install node
```

Or download from https://nodejs.org/ just like Windows.

---

## Step 2: Install FFmpeg (Optional but Recommended)

FFmpeg lets ViewTape **automatically create thumbnail images** from your uploaded videos. Without it, you'll need to upload thumbnails manually — the site still works fine either way.

### Windows — The Easy Way

1. Go to https://www.gyan.dev/ffmpeg/builds/
2. Under **"Release builds"**, click the link that says **`ffmpeg-release-essentials.zip`**
3. Download and **unzip** the file somewhere easy to find, like `C:\ffmpeg`
4. Inside the unzipped folder, find the `bin` folder — it has `ffmpeg.exe` inside it
5. Now you need to tell Windows where to find it:
   - Press the **Windows key**, type **"Environment Variables"**, and click **"Edit the system environment variables"**
   - Click the **"Environment Variables"** button at the bottom
   - In the **"System variables"** section, find **"Path"** and double-click it
   - Click **"New"** and type: `C:\ffmpeg\bin` (or wherever your `bin` folder is)
   - Click **OK** on everything to close all the windows
6. **Open a NEW Command Prompt** (the old one won't see the change) and type:
   ```
   ffmpeg -version
   ```
   If you see version info, you're all set!

### Linux — Super Easy

Just run this one command:

```bash
sudo apt install ffmpeg
```

That's it. Seriously. Type `ffmpeg -version` to confirm.

### Mac — Also Easy

```bash
brew install ffmpeg
```

If you don't have Homebrew, install it first from https://brew.sh/ (it's one command).

### Do I REALLY need FFmpeg?

**Nope!** ViewTape works perfectly without it. The only difference is:

- **With FFmpeg** — When you upload a video, a thumbnail image is automatically grabbed from the video for you
- **Without FFmpeg** — You upload your own thumbnail image when uploading a video (or it just shows a blank placeholder)

---

## Configuration

Copy `.env.example` to `.env` and edit as needed:
- `PORT` - Server port (default: 3000)
- `SESSION_SECRET` - Secret for session cookies (change this to any random text!)

---

## Port Forwarding (Sharing With Friends)

The server binds to `0.0.0.0` so it's accessible on your local network. To share with others:

1. **Same Wi-Fi / LAN** — Other devices on your network can connect via your local IP (e.g., `http://192.168.1.100:3000`). To find your IP, run `ipconfig` on Windows or `ifconfig` on Linux/Mac.
2. **Router port forwarding** — Log into your router (usually `192.168.1.1`), find port forwarding settings, and forward port `3000` (TCP) to your machine's local IP.
3. **ngrok (easiest for internet sharing)** — Install ngrok from https://ngrok.com/, then run `ngrok http 3000` and share the URL it gives you. Done!

---

## File Structure

```
ViewTape/
├── server.js          # Main Express server
├── start.bat          # Windows startup script (auto-opens browser)
├── start.sh           # Linux/Mac startup script (auto-opens browser)
├── package.json       # Dependencies
├── db/                # Database schema and init
├── routes/            # Express route handlers
├── views/             # EJS templates
├── public/            # Static CSS, JS, assets
├── uploads/           # Uploaded videos, thumbnails, avatars, banners
└── Icons/             # ViewTape branding assets
```

## Supported Video Formats

MP4, WebM, OGG, MOV, AVI, MKV (MP4 recommended for best browser compatibility)
