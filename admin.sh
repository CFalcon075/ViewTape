#!/bin/bash
cd "$(dirname "$0")"

show_menu() {
  clear
  echo "=========================================="
  echo "  ViewTape - Server Maintenance Tool"
  echo "=========================================="
  echo ""
  echo "   1) List all channels (users)"
  echo "   2) List all videos"
  echo "   3) Delete a specific channel (by username)"
  echo "   4) Delete a specific video (by ID)"
  echo "   5) Purge ALL videos (keep users)"
  echo "   6) Purge ALL channels and videos (full reset)"
  echo "   7) Purge empty channels (0 videos)"
  echo "   8) Purge all comments"
  echo "   9) Purge all ratings"
  echo "  10) Purge all playlists"
  echo "  11) Purge all notifications"
  echo "  12) Purge all subscriptions"
  echo "  13) Show database stats"
  echo "  14) Exit"
  echo ""
}

press_enter() {
  echo ""
  read -p "Press Enter to continue..."
}

list_channels() {
  echo ""
  echo "--- All Channels ---"
  node -e "
    var m=require('./db/init');
    (async()=>{
      await m.initializeDb();
      var r=m.dbAll('SELECT id,username,(SELECT COUNT(*) FROM videos WHERE user_id=users.id) as vids FROM users ORDER BY id');
      r.forEach(function(u){ console.log('  ID:'+u.id+' | '+u.username+' | '+u.vids+' videos') });
      console.log('Total: '+r.length+' channels');
      process.exit(0);
    })()
  "
  press_enter
}

list_videos() {
  echo ""
  echo "--- All Videos ---"
  node -e "
    var m=require('./db/init');
    (async()=>{
      await m.initializeDb();
      var r=m.dbAll('SELECT videos.id,videos.title,videos.views,users.username FROM videos JOIN users ON videos.user_id=users.id ORDER BY videos.id');
      r.forEach(function(v){ console.log('  ID:'+v.id+' | '+v.title+' | by '+v.username+' | '+v.views+' views') });
      console.log('Total: '+r.length+' videos');
      process.exit(0);
    })()
  "
  press_enter
}

delete_channel() {
  echo ""
  read -p "Enter username to delete: " DELUSER
  if [ -z "$DELUSER" ]; then return; fi
  echo ""
  echo "WARNING: This will delete user \"$DELUSER\" and ALL their videos, comments, ratings, playlists, and subscriptions."
  read -p "Are you sure? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then return; fi
  node -e "
    var m=require('./db/init');var fs=require('fs');var path=require('path');
    (async()=>{
      await m.initializeDb();
      var u=m.dbGet('SELECT id FROM users WHERE username=?',['$DELUSER']);
      if(!u){console.log('User not found: $DELUSER');process.exit(1)}
      var uid=u.id;
      var vids=m.dbAll('SELECT filename,thumbnail FROM videos WHERE user_id=?',[uid]);
      vids.forEach(function(v){
        try{if(fs.existsSync(path.join(__dirname,'uploads','videos',v.filename)))fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}
        try{if(v.thumbnail&&fs.existsSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail)))fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}
      });
      var av=m.dbGet('SELECT avatar,banner FROM users WHERE id=?',[uid]);
      if(av&&av.avatar&&av.avatar!=='pfp1.png'&&av.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',av.avatar))}catch(e){}}
      if(av&&av.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',av.banner))}catch(e){}}
      m.dbRun('DELETE FROM notifications WHERE user_id=?',[uid]);
      m.dbRun('DELETE FROM subscriptions WHERE subscriber_id=? OR channel_id=?',[uid,uid]);
      m.dbRun('DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id=?)',[uid]);
      m.dbRun('DELETE FROM playlists WHERE user_id=?',[uid]);
      m.dbRun('DELETE FROM comments WHERE user_id=?',[uid]);
      m.dbRun('DELETE FROM ratings WHERE user_id=?',[uid]);
      m.dbRun('DELETE FROM comments WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);
      m.dbRun('DELETE FROM ratings WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);
      m.dbRun('DELETE FROM playlist_items WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);
      m.dbRun('DELETE FROM videos WHERE user_id=?',[uid]);
      m.dbRun('DELETE FROM users WHERE id=?',[uid]);
      console.log('Deleted user: $DELUSER and all associated data.');
      process.exit(0);
    })()
  "
  press_enter
}

delete_video() {
  echo ""
  read -p "Enter video ID to delete: " DELVID
  if [ -z "$DELVID" ]; then return; fi
  node -e "
    var m=require('./db/init');var fs=require('fs');var path=require('path');
    (async()=>{
      await m.initializeDb();
      var v=m.dbGet('SELECT * FROM videos WHERE id=?',[$DELVID]);
      if(!v){console.log('Video not found: ID $DELVID');process.exit(1)}
      try{if(fs.existsSync(path.join(__dirname,'uploads','videos',v.filename)))fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}
      try{if(v.thumbnail&&fs.existsSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail)))fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}
      m.dbRun('DELETE FROM comments WHERE video_id=?',[$DELVID]);
      m.dbRun('DELETE FROM ratings WHERE video_id=?',[$DELVID]);
      m.dbRun('DELETE FROM playlist_items WHERE video_id=?',[$DELVID]);
      m.dbRun('DELETE FROM videos WHERE id=?',[$DELVID]);
      console.log('Deleted video ID $DELVID: '+v.title);
      process.exit(0);
    })()
  "
  press_enter
}

purge_videos() {
  echo ""
  echo "WARNING: This will delete ALL videos, comments, ratings, and playlist items. Users will be kept."
  read -p "Are you sure? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then return; fi
  node -e "
    var m=require('./db/init');var fs=require('fs');var path=require('path');
    (async()=>{
      await m.initializeDb();
      var vids=m.dbAll('SELECT filename,thumbnail FROM videos');
      vids.forEach(function(v){
        try{fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}
        try{if(v.thumbnail)fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}
      });
      m.dbRun('DELETE FROM playlist_items');
      m.dbRun('DELETE FROM comments');
      m.dbRun('DELETE FROM ratings');
      m.dbRun('DELETE FROM notifications');
      m.dbRun('DELETE FROM videos');
      console.log('Purged '+vids.length+' videos and all related data.');
      process.exit(0);
    })()
  "
  press_enter
}

purge_all() {
  echo ""
  echo "!!!! DANGER: This will delete ALL users, videos, and everything. Full database reset. !!!!"
  read -p "Type PURGE to confirm: " CONFIRM
  if [ "$CONFIRM" != "PURGE" ]; then return; fi
  node -e "
    var m=require('./db/init');var fs=require('fs');var path=require('path');
    (async()=>{
      await m.initializeDb();
      var vids=m.dbAll('SELECT filename,thumbnail FROM videos');
      vids.forEach(function(v){
        try{fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}
        try{if(v.thumbnail)fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}
      });
      var avatars=m.dbAll('SELECT avatar,banner FROM users');
      avatars.forEach(function(u){
        if(u.avatar&&u.avatar!=='pfp1.png'&&u.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',u.avatar))}catch(e){}}
        if(u.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',u.banner))}catch(e){}}
      });
      m.dbRun('DELETE FROM playlist_items');m.dbRun('DELETE FROM playlists');
      m.dbRun('DELETE FROM notifications');m.dbRun('DELETE FROM subscriptions');
      m.dbRun('DELETE FROM comments');m.dbRun('DELETE FROM ratings');
      m.dbRun('DELETE FROM videos');m.dbRun('DELETE FROM users');
      console.log('Full purge complete. All data wiped.');
      process.exit(0);
    })()
  "
  press_enter
}

purge_empty() {
  echo ""
  echo "This will delete all users who have 0 videos (empty channels)."
  read -p "Are you sure? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then return; fi
  node -e "
    var m=require('./db/init');var fs=require('fs');var path=require('path');
    (async()=>{
      await m.initializeDb();
      var empty=m.dbAll('SELECT id,username,avatar,banner FROM users WHERE (SELECT COUNT(*) FROM videos WHERE user_id=users.id)=0');
      empty.forEach(function(u){
        if(u.avatar&&u.avatar!=='pfp1.png'&&u.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',u.avatar))}catch(e){}}
        if(u.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',u.banner))}catch(e){}}
        m.dbRun('DELETE FROM notifications WHERE user_id=?',[u.id]);
        m.dbRun('DELETE FROM subscriptions WHERE subscriber_id=? OR channel_id=?',[u.id,u.id]);
        m.dbRun('DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id=?)',[u.id]);
        m.dbRun('DELETE FROM playlists WHERE user_id=?',[u.id]);
        m.dbRun('DELETE FROM comments WHERE user_id=?',[u.id]);
        m.dbRun('DELETE FROM ratings WHERE user_id=?',[u.id]);
        m.dbRun('DELETE FROM users WHERE id=?',[u.id]);
        console.log('  Deleted: '+u.username);
      });
      console.log('Purged '+empty.length+' empty channels.');
      process.exit(0);
    })()
  "
  press_enter
}

purge_simple() {
  local TABLE="$1"
  local LABEL="$2"
  echo ""
  echo "This will delete ALL $LABEL."
  read -p "Are you sure? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then return; fi
  node -e "
    var m=require('./db/init');
    (async()=>{
      await m.initializeDb();
      m.dbRun('DELETE FROM $TABLE');
      console.log('All $LABEL purged.');
      process.exit(0);
    })()
  "
  press_enter
}

db_stats() {
  echo ""
  echo "--- Database Stats ---"
  node -e "
    var m=require('./db/init');
    (async()=>{
      await m.initializeDb();
      var u=m.dbGet('SELECT COUNT(*) as c FROM users');
      var v=m.dbGet('SELECT COUNT(*) as c FROM videos');
      var cm=m.dbGet('SELECT COUNT(*) as c FROM comments');
      var r=m.dbGet('SELECT COUNT(*) as c FROM ratings');
      var s=m.dbGet('SELECT COUNT(*) as c FROM subscriptions');
      var n=m.dbGet('SELECT COUNT(*) as c FROM notifications');
      var p=m.dbGet('SELECT COUNT(*) as c FROM playlists');
      var pi=m.dbGet('SELECT COUNT(*) as c FROM playlist_items');
      console.log('  Users:          '+u.c);
      console.log('  Videos:         '+v.c);
      console.log('  Comments:       '+cm.c);
      console.log('  Ratings:        '+r.c);
      console.log('  Subscriptions:  '+s.c);
      console.log('  Notifications:  '+n.c);
      console.log('  Playlists:      '+p.c);
      console.log('  Playlist Items: '+pi.c);
      process.exit(0);
    })()
  "
  press_enter
}

while true; do
  show_menu
  read -p "Enter option: " CHOICE
  case "$CHOICE" in
    1) list_channels ;;
    2) list_videos ;;
    3) delete_channel ;;
    4) delete_video ;;
    5) purge_videos ;;
    6) purge_all ;;
    7) purge_empty ;;
    8) purge_simple "comments" "comments" ;;
    9) purge_simple "ratings" "ratings" ;;
    10) purge_simple "playlist_items" "playlists"; purge_simple "playlists" "playlists" ;;
    11) purge_simple "notifications" "notifications" ;;
    12) purge_simple "subscriptions" "subscriptions" ;;
    13) db_stats ;;
    14) echo "Goodbye!"; exit 0 ;;
    *) echo "Invalid option."; press_enter ;;
  esac
done
