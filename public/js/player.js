/* ========================================
   ViewTape - 2007-Style HTML5 Video Player
   Adapted from 2007-YouTube-Player-HTML5-main
   Local video only, YouTube code stripped
   ======================================== */

let isDraggingTimeline = false;
let isDraggingVolume = false;
let videoDuration = 0;
let earliestWatchedTime = 0;
let previousVolume = 100;

const myVideo = document.getElementById('myVideo');
const loadingIndicator = document.getElementById('loadingIndicator');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const progressRed = document.getElementById('progressRed');
const progressLoaded = document.getElementById('progressLoaded');
const progressHandle = document.getElementById('progressHandle');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const progressSection = document.querySelector('.progress-section');
const volumeTrack = document.getElementById('volumeTrack');
const volumeHandle = document.getElementById('volumeHandle');
const volumeLevel = document.getElementById('volumeLevel');
const volumeBtn = document.getElementById('volumeBtn');
const endedButtons = document.getElementById('endedButtons');
const watchAgainBtn = document.getElementById('watchAgainBtn');

if (endedButtons) endedButtons.style.display = 'none';
if (loadingIndicator) {
  loadingIndicator.style.zIndex = '99999999';
  loadingIndicator.style.position = 'absolute';
  loadingIndicator.style.top = '50%';
  loadingIndicator.style.left = '50%';
  loadingIndicator.style.transform = 'translate(-50%, -50%)';
  loadingIndicator.style.backgroundRepeat = 'no-repeat';
  loadingIndicator.style.backgroundPosition = 'center';
  loadingIndicator.style.backgroundSize = 'contain';
  loadingIndicator.style.pointerEvents = 'none';
}

// Loading animation frames
let loadingFrame = 1;
const loadingTotalFrames = 22;
let loadingInterval = null;
const loadingFrameDelay = 100;

function updateLoadingFrame() {
  if (loadingFrame < loadingTotalFrames) {
    loadingFrame++;
  } else {
    loadingFrame = 1;
  }
  loadingIndicator.style.backgroundImage = "url('/public/assets/loading_frames/" + loadingFrame + ".png')";
}

function startLoadingAnimation() {
  if (!loadingInterval && loadingIndicator) {
    loadingFrame = 1;
    loadingIndicator.style.backgroundImage = "url('/public/assets/loading_frames/1.png')";
    loadingIndicator.style.display = 'block';
    loadingInterval = setInterval(updateLoadingFrame, loadingFrameDelay);
  }
}

function stopLoadingAnimation() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    loadingFrame = 1;
  }
}

// Video events
if (myVideo) {
  myVideo.addEventListener('loadstart', startLoadingAnimation);
  myVideo.addEventListener('loadeddata', stopLoadingAnimation);
  myVideo.addEventListener('waiting', startLoadingAnimation);
  myVideo.addEventListener('playing', stopLoadingAnimation);
  myVideo.addEventListener('canplay', stopLoadingAnimation);
  myVideo.addEventListener('canplaythrough', stopLoadingAnimation);

  myVideo.addEventListener('loadedmetadata', function() {
    videoDuration = myVideo.duration;
    updateProgress();
    updateBuffered();
    setVolume(myVideo.volume * 100);
    if (endedButtons) endedButtons.style.display = 'none';
  });

  myVideo.addEventListener('timeupdate', function() { scheduleUIUpdate(); });
  myVideo.addEventListener('progress', function() { scheduleUIUpdate(); });

  myVideo.addEventListener('ended', function() {
    myVideo.style.display = 'none';
    if (endedButtons) endedButtons.style.display = 'flex';
  });

  myVideo.addEventListener('play', function() {
    if (playPauseBtn) playPauseBtn.classList.add('playing');
    if (endedButtons) endedButtons.style.display = 'none';
    myVideo.style.display = 'block';
  });

  myVideo.addEventListener('pause', function() {
    if (playPauseBtn) playPauseBtn.classList.remove('playing');
  });

  myVideo.addEventListener('click', togglePlayPause);
  myVideo.addEventListener('dblclick', toggleFullscreen);
}

// Watch Again button
if (watchAgainBtn) {
  watchAgainBtn.addEventListener('click', function() {
    if (endedButtons) endedButtons.style.display = 'none';
    myVideo.style.display = 'block';
    earliestWatchedTime = 0;
    myVideo.currentTime = 0;
    myVideo.play();
    updateProgress();
    updateBuffered();
  });
}

function togglePlayPause() {
  if (!myVideo) return;
  if (myVideo.paused || myVideo.ended) {
    myVideo.play();
    if (playPauseBtn) playPauseBtn.classList.add('playing');
  } else {
    myVideo.pause();
    if (playPauseBtn) playPauseBtn.classList.remove('playing');
  }
}

function rewindVideo() {
  if (!myVideo) return;
  myVideo.currentTime = 0;
  earliestWatchedTime = 0;
  updateProgress();
  updateBuffered();
}

function updateProgress() {
  var duration = videoDuration || (myVideo ? myVideo.duration : 0) || 0;
  if (!duration || !progressSection) return;
  var currentTime = myVideo.currentTime;
  var timelineWidth = progressSection.clientWidth;
  var earliestPixel = Math.round((earliestWatchedTime / duration) * timelineWidth);
  var currentPixel = Math.round((currentTime / duration) * timelineWidth);
  var watchedWidth = Math.max(0, currentPixel - earliestPixel);

  if (progressRed) {
    progressRed.style.left = earliestPixel + 'px';
    progressRed.style.width = watchedWidth + 'px';
  }
  if (progressHandle) {
    var handleX = currentPixel - Math.round(progressHandle.offsetWidth / 2);
    progressHandle.style.left = handleX + 'px';
  }
  updateTimeDisplay(currentTime, duration);
}

function updateTimeDisplay(currentTime, duration) {
  if (timeCurrent) timeCurrent.textContent = formatTime(currentTime, true);
  if (timeTotal) timeTotal.textContent = duration ? formatTime(duration, false) : '0:00';
}

function formatTime(seconds, isCurrent) {
  var m = Math.floor(seconds / 60);
  var s = Math.floor(seconds % 60);
  var minutesStr = isCurrent ? (m < 10 ? '0' + m : m) : m;
  var secondsStr = s < 10 ? '0' + s : s;
  return minutesStr + ':' + secondsStr;
}

function updateBuffered() {
  var duration = videoDuration || (myVideo ? myVideo.duration : 0) || 0;
  if (!duration || !myVideo.buffered || myVideo.buffered.length === 0 || !progressSection) return;
  var bufferEnd = myVideo.buffered.end(myVideo.buffered.length - 1);
  var timelineWidth = progressSection.clientWidth;
  var loadedDuration = Math.max(0, bufferEnd - earliestWatchedTime);
  var earliestPixel = Math.round((earliestWatchedTime / duration) * timelineWidth);
  var loadedWidth = Math.round((loadedDuration / duration) * timelineWidth);
  if (progressLoaded) {
    progressLoaded.style.left = earliestPixel + 'px';
    progressLoaded.style.width = loadedWidth + 'px';
  }
}

// Timeline dragging
function startTimelineDrag(e) {
  isDraggingTimeline = true;
  if (progressHandle) progressHandle.classList.add('active');
  document.addEventListener('mousemove', dragTimeline);
  document.addEventListener('mouseup', stopTimelineDrag);
  e.preventDefault();
}

function dragTimeline(e) {
  if (!isDraggingTimeline) return;
  e.preventDefault();
  var rect = progressSection.getBoundingClientRect();
  var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  var duration = videoDuration || (myVideo ? myVideo.duration : 0) || 0;
  var newTime = (x / rect.width) * duration;
  var earliestPixel = (earliestWatchedTime / duration) * progressSection.clientWidth;
  var watchedWidth = (Math.max(0, newTime - earliestWatchedTime) / duration) * progressSection.clientWidth;
  if (progressRed) { progressRed.style.left = earliestPixel + 'px'; progressRed.style.width = watchedWidth + 'px'; }
  var handleX = (newTime / duration) * progressSection.clientWidth;
  if (progressHandle) progressHandle.style.left = (handleX - (progressHandle.offsetWidth / 2)) + 'px';
  updateTimeDisplay(newTime, duration);
}

function stopTimelineDrag(e) {
  if (!isDraggingTimeline) return;
  isDraggingTimeline = false;
  if (progressHandle) progressHandle.classList.remove('active');
  document.removeEventListener('mousemove', dragTimeline);
  document.removeEventListener('mouseup', stopTimelineDrag);
  var rect = progressSection.getBoundingClientRect();
  var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  var duration = videoDuration || (myVideo ? myVideo.duration : 0) || 0;
  var newTime = (x / rect.width) * duration;
  earliestWatchedTime = newTime;
  myVideo.currentTime = newTime;
  if (progressRed) { progressRed.style.width = '0px'; progressRed.style.left = ((earliestWatchedTime / duration) * progressSection.clientWidth) + 'px'; }
  if (progressLoaded) { progressLoaded.style.width = '0px'; progressLoaded.style.left = ((earliestWatchedTime / duration) * progressSection.clientWidth) + 'px'; }
  updateProgress();
  updateBuffered();
}

if (progressHandle) progressHandle.addEventListener('mousedown', startTimelineDrag);
if (progressSection) {
  progressSection.addEventListener('click', function(e) {
    if (isDraggingTimeline) return;
    var rect = progressSection.getBoundingClientRect();
    var clickX = e.clientX - rect.left;
    var duration = videoDuration || (myVideo ? myVideo.duration : 0) || 0;
    var newTime = (clickX / rect.width) * duration;
    earliestWatchedTime = newTime;
    myVideo.currentTime = newTime;
    updateProgress();
    updateBuffered();
  });
}

// Volume
function updateVolumeIcon(volPercent) {
  if (!volumeBtn) return;
  var iconFile;
  if (volPercent === 0) {
    iconFile = '/public/assets/volume/volume_icon.png';
    volumeBtn.classList.add('muted');
  } else if (volPercent <= 25) {
    iconFile = '/public/assets/volume/volume_icon_1.png';
    volumeBtn.classList.remove('muted');
  } else if (volPercent <= 50) {
    iconFile = '/public/assets/volume/volume_icon_2.png';
    volumeBtn.classList.remove('muted');
  } else if (volPercent <= 75) {
    iconFile = '/public/assets/volume/volume_icon_3.png';
    volumeBtn.classList.remove('muted');
  } else {
    iconFile = '/public/assets/volume/volume_icon_4.png';
    volumeBtn.classList.remove('muted');
  }
  volumeBtn.style.backgroundImage = "url('" + iconFile + "')";
  volumeBtn.style.backgroundRepeat = 'no-repeat';
  volumeBtn.style.backgroundPosition = 'center';
  volumeBtn.style.backgroundSize = 'contain';
}

function setVolume(volPercent) {
  volPercent = Math.max(0, Math.min(100, volPercent));
  if (myVideo) myVideo.volume = volPercent / 100;
  if (volumeLevel) volumeLevel.style.width = volPercent + '%';
  if (volumeTrack && volumeHandle) {
    var trackWidth = volumeTrack.clientWidth;
    var handleX = (volPercent / 100) * trackWidth;
    volumeHandle.style.left = (handleX - (volumeHandle.offsetWidth / 2)) + 'px';
  }
  updateVolumeIcon(volPercent);
}

if (volumeBtn) {
  volumeBtn.addEventListener('click', function() {
    var currentVol = myVideo ? myVideo.volume * 100 : 0;
    if (currentVol > 0) {
      previousVolume = currentVol;
      setVolume(0);
    } else {
      setVolume(previousVolume);
    }
  });
}

function startVolumeDrag(e) {
  isDraggingVolume = true;
  document.addEventListener('mousemove', dragVolume);
  document.addEventListener('mouseup', stopVolumeDrag);
  e.preventDefault();
}

function dragVolume(e) {
  if (!isDraggingVolume) return;
  e.preventDefault();
  var rect = volumeTrack.getBoundingClientRect();
  var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  setVolume((x / rect.width) * 100);
}

function stopVolumeDrag() {
  if (!isDraggingVolume) return;
  isDraggingVolume = false;
  document.removeEventListener('mousemove', dragVolume);
  document.removeEventListener('mouseup', stopVolumeDrag);
}

if (volumeHandle) volumeHandle.addEventListener('mousedown', startVolumeDrag);
if (volumeTrack) {
  volumeTrack.addEventListener('click', function(e) {
    var rect = volumeTrack.getBoundingClientRect();
    var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setVolume((x / rect.width) * 100);
  });
}

// Fullscreen
var controlBarHeight = 31;

function adjustVideoSizeForFullscreen() {
  var videoArea = document.querySelector('.video-area');
  if (!videoArea || !myVideo) return;
  if (document.fullscreenElement) {
    videoArea.style.height = 'calc(100vh - ' + controlBarHeight + 'px)';
    videoArea.style.width = '100%';
    videoArea.style.display = 'flex';
    videoArea.style.alignItems = 'center';
    videoArea.style.justifyContent = 'center';
    myVideo.style.width = 'auto';
    myVideo.style.height = '100%';
    myVideo.style.objectFit = 'contain';
  } else {
    videoArea.style.height = 'auto';
    videoArea.style.width = '100%';
    videoArea.style.display = '';
    videoArea.style.alignItems = '';
    videoArea.style.justifyContent = '';
    myVideo.style.width = '100%';
    myVideo.style.height = 'auto';
    myVideo.style.objectFit = 'contain';
  }
}

function toggleFullscreen() {
  var container = document.querySelector('.player-container');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(function(err) {
      console.error('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen().catch(function(err) {
      console.error('Exit fullscreen error:', err);
    });
  }
}

if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
if (rewindBtn) rewindBtn.addEventListener('click', rewindVideo);
if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

// Animated fullscreen button frames
var fullscreenFrame = 1;
var totalFrames = 24;
var fullscreenInterval = null;
var frameDelay = 40;

function updateFullscreenFrame() {
  if (fullscreenFrame < totalFrames) {
    fullscreenFrame++;
  } else {
    fullscreenFrame = 1;
  }
  fullscreenBtn.style.backgroundImage = "url('/public/assets/fullscreen_button/" + fullscreenFrame + ".png')";
}

function startFullscreenAnimation() {
  if (!fullscreenInterval && fullscreenBtn) {
    fullscreenFrame = 1;
    fullscreenBtn.style.backgroundImage = "url('/public/assets/fullscreen_button/1.png')";
    fullscreenBtn.style.opacity = 1;
    fullscreenInterval = setInterval(updateFullscreenFrame, frameDelay);
  }
}

function stopFullscreenAnimation() {
  if (fullscreenInterval) {
    clearInterval(fullscreenInterval);
    fullscreenInterval = null;
    fullscreenFrame = 1;
    if (fullscreenBtn) fullscreenBtn.style.backgroundImage = "url('/public/assets/fullscreen_button/1.png')";
  }
}

function attachFullscreenHoverEvents() {
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('mouseenter', startFullscreenAnimation);
    fullscreenBtn.addEventListener('mouseleave', stopFullscreenAnimation);
  }
}

function detachFullscreenHoverEvents() {
  if (fullscreenBtn) {
    fullscreenBtn.removeEventListener('mouseenter', startFullscreenAnimation);
    fullscreenBtn.removeEventListener('mouseleave', stopFullscreenAnimation);
  }
}

attachFullscreenHoverEvents();

document.addEventListener('fullscreenchange', function() {
  if (document.fullscreenElement) {
    stopFullscreenAnimation();
    detachFullscreenHoverEvents();
    if (fullscreenBtn) {
      fullscreenBtn.style.backgroundImage = "url('/public/assets/fullscreen_button/exit_fullscreen.png')";
      fullscreenBtn.style.backgroundSize = '45px 15px';
      fullscreenBtn.classList.add('exit-icon');
    }
  } else {
    if (fullscreenBtn) {
      fullscreenBtn.classList.remove('exit-icon');
      fullscreenBtn.style.backgroundImage = "url('/public/assets/fullscreen_button/1.png')";
      fullscreenBtn.style.backgroundSize = '25px 18px';
    }
    attachFullscreenHoverEvents();
  }
  adjustVideoSizeForFullscreen();
  scheduleUIUpdate();
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlayPause(); }
  else if (e.key === 'f') { e.preventDefault(); toggleFullscreen(); }
  else if (e.key === 'm') { e.preventDefault(); if (volumeBtn) volumeBtn.click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (myVideo) myVideo.currentTime = Math.max(0, myVideo.currentTime - 5); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (myVideo) myVideo.currentTime = Math.min(myVideo.duration, myVideo.currentTime + 5); }
  else if (e.key === 'Escape' && document.fullscreenElement) { document.exitFullscreen(); }
});

// RAF-based UI updates
var rafId = null;
function scheduleUIUpdate() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(function() {
    rafId = null;
    updateProgress();
    updateBuffered();
  });
}

// ResizeObserver
if (typeof ResizeObserver !== 'undefined' && progressSection) {
  var observer = new ResizeObserver(function() { scheduleUIUpdate(); });
  observer.observe(progressSection);
}

// Preload UI assets
function preloadImages(paths) {
  for (var i = 0; i < paths.length; i++) { var img = new Image(); img.src = paths[i]; }
}

function preloadUIAssets() {
  var frames = [];
  for (var i = 1; i <= 24; i++) frames.push('/public/assets/fullscreen_button/' + i + '.png');
  frames.push('/public/assets/fullscreen_button/exit_fullscreen.png');
  var loadFrames = [];
  for (var i = 1; i <= 22; i++) loadFrames.push('/public/assets/loading_frames/' + i + '.png');
  var volIcons = [
    '/public/assets/volume/volume_icon.png',
    '/public/assets/volume/volume_icon_1.png',
    '/public/assets/volume/volume_icon_2.png',
    '/public/assets/volume/volume_icon_3.png',
    '/public/assets/volume/volume_icon_4.png'
  ];
  preloadImages(frames.concat(loadFrames).concat(volIcons));
}

// Init
document.addEventListener('DOMContentLoaded', function() {
  preloadUIAssets();
  if (myVideo) myVideo.play().catch(function() {});
});
