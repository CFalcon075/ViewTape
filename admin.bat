@echo off
cd /d "%~dp0"
title ViewTape Admin Maintenance Tool

:MENU
cls
echo ==========================================
echo   ViewTape - Server Maintenance Tool
echo ==========================================
echo.
echo   1) List all channels (users)
echo   2) List all videos
echo   3) Delete a specific channel (by username)
echo   4) Delete a specific video (by ID)
echo   5) Purge ALL videos (keep users)
echo   6) Purge ALL channels and videos (full reset)
echo   7) Purge empty channels (0 videos)
echo   8) Purge all comments
echo   9) Purge all ratings
echo  10) Purge all playlists
echo  11) Purge all notifications
echo  12) Purge all subscriptions
echo  13) Show database stats
echo  14) Exit
echo.
set /p CHOICE="Enter option: "

if "%CHOICE%"=="1" goto LIST_CHANNELS
if "%CHOICE%"=="2" goto LIST_VIDEOS
if "%CHOICE%"=="3" goto DELETE_CHANNEL
if "%CHOICE%"=="4" goto DELETE_VIDEO
if "%CHOICE%"=="5" goto PURGE_VIDEOS
if "%CHOICE%"=="6" goto PURGE_ALL
if "%CHOICE%"=="7" goto PURGE_EMPTY
if "%CHOICE%"=="8" goto PURGE_COMMENTS
if "%CHOICE%"=="9" goto PURGE_RATINGS
if "%CHOICE%"=="10" goto PURGE_PLAYLISTS
if "%CHOICE%"=="11" goto PURGE_NOTIFS
if "%CHOICE%"=="12" goto PURGE_SUBS
if "%CHOICE%"=="13" goto DB_STATS
if "%CHOICE%"=="14" goto END
echo Invalid option.
pause
goto MENU

:LIST_CHANNELS
echo.
echo --- All Channels ---
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();var r=m.dbAll('SELECT id,username,(SELECT COUNT(*) FROM videos WHERE user_id=users.id) as vids FROM users ORDER BY id');r.forEach(function(u){console.log('  ID:'+u.id+' | '+u.username+' | '+u.vids+' videos')});console.log('Total: '+r.length+' channels');process.exit(0)})()"
echo.
pause
goto MENU

:LIST_VIDEOS
echo.
echo --- All Videos ---
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();var r=m.dbAll('SELECT videos.id,videos.title,videos.views,users.username FROM videos JOIN users ON videos.user_id=users.id ORDER BY videos.id');r.forEach(function(v){console.log('  ID:'+v.id+' | '+v.title+' | by '+v.username+' | '+v.views+' views')});console.log('Total: '+r.length+' videos');process.exit(0)})()"
echo.
pause
goto MENU

:DELETE_CHANNEL
echo.
set /p DELUSER="Enter username to delete: "
if "%DELUSER%"=="" goto MENU
echo.
echo WARNING: This will delete user "%DELUSER%" and ALL their videos, comments, ratings, playlists, and subscriptions.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');var fs=require('fs');var path=require('path');(async()=>{await m.initializeDb();var u=m.dbGet('SELECT id FROM users WHERE username=?',['%DELUSER%']);if(!u){console.log('User not found: %DELUSER%');process.exit(1)}var uid=u.id;var vids=m.dbAll('SELECT filename,thumbnail FROM videos WHERE user_id=?',[uid]);vids.forEach(function(v){var vp=path.join(__dirname,'uploads','videos',v.filename);var tp=path.join(__dirname,'uploads','thumbnails',v.thumbnail);try{if(fs.existsSync(vp))fs.unlinkSync(vp)}catch(e){}try{if(v.thumbnail&&fs.existsSync(tp))fs.unlinkSync(tp)}catch(e){}});var av=m.dbGet('SELECT avatar,banner FROM users WHERE id=?',[uid]);if(av&&av.avatar&&av.avatar!=='pfp1.png'&&av.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',av.avatar))}catch(e){}}if(av&&av.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',av.banner))}catch(e){}}m.dbRun('DELETE FROM notifications WHERE user_id=?',[uid]);m.dbRun('DELETE FROM subscriptions WHERE subscriber_id=? OR channel_id=?',[uid,uid]);m.dbRun('DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id=?)',[uid]);m.dbRun('DELETE FROM playlists WHERE user_id=?',[uid]);m.dbRun('DELETE FROM comments WHERE user_id=?',[uid]);m.dbRun('DELETE FROM ratings WHERE user_id=?',[uid]);m.dbRun('DELETE FROM comments WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);m.dbRun('DELETE FROM ratings WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);m.dbRun('DELETE FROM playlist_items WHERE video_id IN (SELECT id FROM videos WHERE user_id=?)',[uid]);m.dbRun('DELETE FROM videos WHERE user_id=?',[uid]);m.dbRun('DELETE FROM users WHERE id=?',[uid]);console.log('Deleted user: %DELUSER% and all associated data.');process.exit(0)})()"
echo.
pause
goto MENU

:DELETE_VIDEO
echo.
set /p DELVID="Enter video ID to delete: "
if "%DELVID%"=="" goto MENU
node -e "var m=require('./db/init');var fs=require('fs');var path=require('path');(async()=>{await m.initializeDb();var v=m.dbGet('SELECT * FROM videos WHERE id=?',[%DELVID%]);if(!v){console.log('Video not found: ID %DELVID%');process.exit(1)}var vp=path.join(__dirname,'uploads','videos',v.filename);var tp=path.join(__dirname,'uploads','thumbnails',v.thumbnail);try{if(fs.existsSync(vp))fs.unlinkSync(vp)}catch(e){}try{if(v.thumbnail&&fs.existsSync(tp))fs.unlinkSync(tp)}catch(e){}m.dbRun('DELETE FROM comments WHERE video_id=?',[%DELVID%]);m.dbRun('DELETE FROM ratings WHERE video_id=?',[%DELVID%]);m.dbRun('DELETE FROM playlist_items WHERE video_id=?',[%DELVID%]);m.dbRun('DELETE FROM videos WHERE id=?',[%DELVID%]);console.log('Deleted video ID %DELVID%: '+v.title);process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_VIDEOS
echo.
echo WARNING: This will delete ALL videos, comments, ratings, and playlist items. Users will be kept.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');var fs=require('fs');var path=require('path');(async()=>{await m.initializeDb();var vids=m.dbAll('SELECT filename,thumbnail FROM videos');vids.forEach(function(v){try{fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}try{if(v.thumbnail)fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}});m.dbRun('DELETE FROM playlist_items');m.dbRun('DELETE FROM comments');m.dbRun('DELETE FROM ratings');m.dbRun('DELETE FROM notifications');m.dbRun('DELETE FROM videos');console.log('Purged '+vids.length+' videos and all related data.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_ALL
echo.
echo !!!! DANGER: This will delete ALL users, videos, and everything. Full database reset. !!!!
set /p CONFIRM="Type PURGE to confirm: "
if not "%CONFIRM%"=="PURGE" goto MENU
node -e "var m=require('./db/init');var fs=require('fs');var path=require('path');(async()=>{await m.initializeDb();var vids=m.dbAll('SELECT filename,thumbnail FROM videos');vids.forEach(function(v){try{fs.unlinkSync(path.join(__dirname,'uploads','videos',v.filename))}catch(e){}try{if(v.thumbnail)fs.unlinkSync(path.join(__dirname,'uploads','thumbnails',v.thumbnail))}catch(e){}});var avatars=m.dbAll('SELECT avatar,banner FROM users');avatars.forEach(function(u){if(u.avatar&&u.avatar!=='pfp1.png'&&u.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',u.avatar))}catch(e){}}if(u.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',u.banner))}catch(e){}}});m.dbRun('DELETE FROM playlist_items');m.dbRun('DELETE FROM playlists');m.dbRun('DELETE FROM notifications');m.dbRun('DELETE FROM subscriptions');m.dbRun('DELETE FROM comments');m.dbRun('DELETE FROM ratings');m.dbRun('DELETE FROM videos');m.dbRun('DELETE FROM users');console.log('Full purge complete. All data wiped.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_EMPTY
echo.
echo This will delete all users who have 0 videos (empty channels).
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');var fs=require('fs');var path=require('path');(async()=>{await m.initializeDb();var empty=m.dbAll('SELECT id,username,avatar,banner FROM users WHERE (SELECT COUNT(*) FROM videos WHERE user_id=users.id)=0');empty.forEach(function(u){if(u.avatar&&u.avatar!=='pfp1.png'&&u.avatar!=='pfp2.png'){try{fs.unlinkSync(path.join(__dirname,'uploads','avatars',u.avatar))}catch(e){}}if(u.banner){try{fs.unlinkSync(path.join(__dirname,'uploads','banners',u.banner))}catch(e){}}m.dbRun('DELETE FROM notifications WHERE user_id=?',[u.id]);m.dbRun('DELETE FROM subscriptions WHERE subscriber_id=? OR channel_id=?',[u.id,u.id]);m.dbRun('DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id=?)',[u.id]);m.dbRun('DELETE FROM playlists WHERE user_id=?',[u.id]);m.dbRun('DELETE FROM comments WHERE user_id=?',[u.id]);m.dbRun('DELETE FROM ratings WHERE user_id=?',[u.id]);m.dbRun('DELETE FROM users WHERE id=?',[u.id]);console.log('  Deleted: '+u.username)});console.log('Purged '+empty.length+' empty channels.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_COMMENTS
echo.
echo This will delete ALL comments.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();m.dbRun('DELETE FROM comments');console.log('All comments purged.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_RATINGS
echo.
echo This will delete ALL ratings (stars and thumbs).
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();m.dbRun('DELETE FROM ratings');console.log('All ratings purged.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_PLAYLISTS
echo.
echo This will delete ALL playlists and playlist items.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();m.dbRun('DELETE FROM playlist_items');m.dbRun('DELETE FROM playlists');console.log('All playlists purged.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_NOTIFS
echo.
echo This will delete ALL notifications.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();m.dbRun('DELETE FROM notifications');console.log('All notifications purged.');process.exit(0)})()"
echo.
pause
goto MENU

:PURGE_SUBS
echo.
echo This will delete ALL subscriptions.
set /p CONFIRM="Are you sure? (yes/no): "
if /i not "%CONFIRM%"=="yes" goto MENU
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();m.dbRun('DELETE FROM subscriptions');console.log('All subscriptions purged.');process.exit(0)})()"
echo.
pause
goto MENU

:DB_STATS
echo.
echo --- Database Stats ---
node -e "var m=require('./db/init');(async()=>{await m.initializeDb();var u=m.dbGet('SELECT COUNT(*) as c FROM users');var v=m.dbGet('SELECT COUNT(*) as c FROM videos');var cm=m.dbGet('SELECT COUNT(*) as c FROM comments');var r=m.dbGet('SELECT COUNT(*) as c FROM ratings');var s=m.dbGet('SELECT COUNT(*) as c FROM subscriptions');var n=m.dbGet('SELECT COUNT(*) as c FROM notifications');var p=m.dbGet('SELECT COUNT(*) as c FROM playlists');var pi=m.dbGet('SELECT COUNT(*) as c FROM playlist_items');console.log('  Users:          '+u.c);console.log('  Videos:         '+v.c);console.log('  Comments:       '+cm.c);console.log('  Ratings:        '+r.c);console.log('  Subscriptions:  '+s.c);console.log('  Notifications:  '+n.c);console.log('  Playlists:      '+p.c);console.log('  Playlist Items: '+pi.c);process.exit(0)})()"
echo.
pause
goto MENU

:END
echo Goodbye!
exit /b
