/**
 * Memento Mori - Digital Signage Engine
 * Optimized for Portrait & Landscape Digital Signage Displays / Monitors / TVs
 */

(function () {
  'use strict';

  // State Management
  const state = {
    items: [],            // Filtered & ordered playlist
    rawItems: [],         // All available items
    currentIndex: 0,
    currentMediaIndex: 0,
    isPlaying: true,
    isNavigating: false,
    timer: null,
    progressRaf: null,
    timerStartTime: 0,
    timerDuration: 10000,
    idleTimer: null,
    wakeLock: null,
    settings: {
      orientation: 'auto',      // 'auto' | 'landscape' | 'portrait'
      duration: 10,             // Seconds
      filter: 'all',            // 'all' | 'posts' | 'stories' | 'photos' | 'videos'
      order: 'shuffle',         // 'shuffle' | 'newest' | 'oldest'
      kenBurns: true,
      ambientBg: true,
      clock: true,
      infoMode: 'full',         // 'full' | 'minimal' | 'off'
      muted: true
    }
  };

  // DOM Elements cache
  let dom = {};

  // Initialize once DOM is ready
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheDom();
    loadSavedSettings();
    initClock();
    initIdleDetection();
    initKeyboardShortcuts();
    initEventListeners();

    // Load data from window or API
    await loadPlaylistData();

    // Handle URL parameters (e.g., ?orientation=portrait&filter=stories&order=shuffle)
    applyUrlParams();

    // Apply layout and settings
    applySettingsToUi();
    applyOrientationLayout();
    window.addEventListener('resize', debounce(applyOrientationLayout, 150));

    // Request wake lock to prevent monitor sleeping
    requestWakeLock();

    // Start playback
    if (state.items.length > 0) {
      renderSlide(0, 0, false);
      if (state.isPlaying) {
        startSlideTimer();
      }
    } else {
      showEmptyState();
    }
  }

  function cacheDom() {
    dom = {
      root: document.getElementById('signageRoot'),
      container: document.getElementById('signageContainer'),
      ambientBg: document.getElementById('ambientBg'),
      stage: document.getElementById('signageStage'),
      clockWidget: document.getElementById('clockWidget'),
      clockTime: document.getElementById('clockTime'),
      clockDate: document.getElementById('clockDate'),
      progressBar: document.getElementById('progressBar'),
      hud: document.getElementById('signageHud'),
      playBtn: document.getElementById('hudPlayBtn'),
      playIcon: document.getElementById('hudPlayIcon'),
      pauseIcon: document.getElementById('hudPauseIcon'),
      prevBtn: document.getElementById('hudPrevBtn'),
      nextBtn: document.getElementById('hudNextBtn'),
      orientationBtn: document.getElementById('hudOrientationBtn'),
      muteBtn: document.getElementById('hudMuteBtn'),
      volumeOnIcon: document.getElementById('volumeOnIcon'),
      volumeOffIcon: document.getElementById('volumeOffIcon'),
      settingsBtn: document.getElementById('hudSettingsBtn'),
      fullscreenBtn: document.getElementById('hudFullscreenBtn'),
      exitBtn: document.getElementById('hudExitBtn'),
      counter: document.getElementById('hudCounter'),
      settingsModal: document.getElementById('settingsModal'),
      settingsCloseBtn: document.getElementById('settingsCloseBtn'),
      // Settings controls
      orientButtons: document.querySelectorAll('[data-setting="orientation"]'),
      durationButtons: document.querySelectorAll('[data-setting="duration"]'),
      filterButtons: document.querySelectorAll('[data-setting="filter"]'),
      orderButtons: document.querySelectorAll('[data-setting="order"]'),
      infoModeButtons: document.querySelectorAll('[data-setting="infoMode"]'),
      toggleKenBurns: document.getElementById('toggleKenBurns'),
      toggleAmbientBg: document.getElementById('toggleAmbientBg'),
      toggleClock: document.getElementById('toggleClock'),
      toggleMuted: document.getElementById('toggleMuted')
    };
  }

  /* ==========================================================================
     Data Processing & Playlist Preparation
     ========================================================================== */

  async function loadPlaylistData() {
    let postsData = window.postData || {};
    let storiesData = window.storiesData || {};

    // If data is not embedded in the page, attempt fetching from API
    if (Object.keys(postsData).length === 0) {
      try {
        const postsRes = await fetch('/api/posts');
        if (postsRes.ok) postsData = await postsRes.json();
      } catch (e) {
        console.warn('Could not load /api/posts:', e);
      }
    }

    if (Object.keys(storiesData).length === 0) {
      try {
        const storiesRes = await fetch('/api/stories');
        if (storiesRes.ok) storiesData = await storiesRes.json();
      } catch (e) {
        console.warn('Could not load /api/stories:', e);
      }
    }

    const items = [];

    // Process Posts
    Object.entries(postsData).forEach(([timestampStr, post]) => {
      const mediaList = Array.isArray(post.m) ? post.m : (post.m ? [post.m] : []);
      if (mediaList.length === 0) return;

      const timestamp = parseInt(timestampStr, 10) || post.t || 0;
      const isVideo = isVideoUrl(mediaList[0]);

      items.push({
        type: 'post',
        id: `post_${timestamp}`,
        index: post.i,
        timestamp: timestamp,
        date: post.d || formatDate(timestamp),
        caption: post.tt || '',
        media: mediaList,
        isVideo: isVideo,
        likes: post.l ? parseInt(post.l, 10) : null,
        comments: post.c ? parseInt(post.c, 10) : null,
        views: post.im ? parseInt(post.im, 10) : null,
        location: post.loc || null,
        username: window.signageProfile?.username || 'speared',
        profilePic: window.signageProfile?.profile_picture || 'media/profile.webp'
      });
    });

    // Process Stories
    Object.entries(storiesData).forEach(([timestampStr, story]) => {
      const mediaList = Array.isArray(story.m) ? story.m : (story.m ? [story.m] : []);
      if (mediaList.length === 0) return;

      const timestamp = parseInt(timestampStr, 10) || story.t || 0;
      const isVideo = isVideoUrl(mediaList[0]);

      items.push({
        type: 'story',
        id: `story_${timestamp}`,
        index: story.i,
        timestamp: timestamp,
        date: story.d || formatDate(timestamp),
        caption: story.tt || '',
        media: mediaList,
        storyThumb: story.story_thumb || null,
        isVideo: isVideo,
        likes: null,
        comments: null,
        views: null,
        username: window.signageProfile?.username || 'speared',
        profilePic: window.signageProfile?.profile_picture || 'media/profile.webp'
      });
    });

    state.rawItems = items;
    rebuildPlaylist();
  }

  function isVideoUrl(url) {
    if (!url) return false;
    return /\.(mp4|mov|avi|webm)$/i.test(url);
  }

  function rebuildPlaylist() {
    let filtered = [...state.rawItems];

    // Filter by type
    if (state.settings.filter === 'posts') {
      filtered = filtered.filter(item => item.type === 'post');
    } else if (state.settings.filter === 'stories') {
      filtered = filtered.filter(item => item.type === 'story');
    } else if (state.settings.filter === 'photos') {
      filtered = filtered.filter(item => !item.isVideo);
    } else if (state.settings.filter === 'videos') {
      filtered = filtered.filter(item => item.isVideo);
    }

    // Sort order
    if (state.settings.order === 'shuffle') {
      filtered = shuffleArray(filtered);
    } else if (state.settings.order === 'newest') {
      filtered.sort((a, b) => b.timestamp - a.timestamp);
    } else if (state.settings.order === 'oldest') {
      filtered.sort((a, b) => a.timestamp - b.timestamp);
    }

    state.items = filtered;
    state.currentIndex = 0;
    state.currentMediaIndex = 0;
    updateCounter();
  }

  function shuffleArray(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /* ==========================================================================
     Slide Presentation & Rendering
     ========================================================================== */

  function renderSlide(index, mediaIndex = 0, isTransition = true) {
    if (state.items.length === 0) return;

    if (index < 0) index = state.items.length - 1;
    if (index >= state.items.length) index = 0;

    state.currentIndex = index;
    state.currentMediaIndex = mediaIndex;

    const item = state.items[index];
    const currentMediaUrl = item.media[mediaIndex] || item.media[0];
    const isVideo = isVideoUrl(currentMediaUrl);

    // Update Counter
    updateCounter();

    // Create new slide element
    const slide = document.createElement('div');
    slide.className = 'signage-slide';
    if (isTransition) {
      slide.style.opacity = '0';
    }

    // Determine content layout class (wide vs tall)
    const isTall = item.type === 'story' || isTallAspect(currentMediaUrl);
    const layoutClass = isTall ? 'content-layout-tall' : 'content-layout-wide';

    // Container for slide content
    const contentWrap = document.createElement('div');
    contentWrap.className = layoutClass;
    contentWrap.style.width = '100%';
    contentWrap.style.height = '100%';

    // Media Box
    const mediaBox = document.createElement('div');
    mediaBox.className = 'signage-media-box';

    // Build media element
    let mediaEl;
    if (isVideo) {
      mediaEl = document.createElement('video');
      mediaEl.src = currentMediaUrl;
      mediaEl.className = 'signage-media is-video';
      mediaEl.autoplay = true;
      mediaEl.playsInline = true;
      mediaEl.muted = state.settings.muted;
      mediaEl.loop = false;

      // Handle video end event
      mediaEl.addEventListener('ended', onVideoEnded);
      mediaEl.addEventListener('loadedmetadata', () => {
        // Adapt duration based on video duration if valid
        if (mediaEl.duration && !isNaN(mediaEl.duration) && mediaEl.duration > 0) {
          state.timerDuration = Math.round(mediaEl.duration * 1000);
        }
      });
      mediaEl.addEventListener('error', () => {
        console.warn('Video failed to load:', currentMediaUrl);
        setTimeout(nextSlide, 1500);
      });
    } else {
      mediaEl = document.createElement('img');
      mediaEl.className = 'signage-media is-photo';
      if (state.settings.kenBurns) {
        if (index % 2 === 1) mediaEl.classList.add('alt-motion');
      }

      // Check for webp fallback
      let resolvedSrc = currentMediaUrl;
      if (!resolvedSrc.endsWith('.webp') && /\.(jpg|jpeg|png|heic)$/i.test(resolvedSrc)) {
        const webpCandidate = resolvedSrc.replace(/\.(jpg|jpeg|png|heic)$/i, '.webp');
        mediaEl.src = webpCandidate;
        mediaEl.onerror = function () {
          this.onerror = null;
          this.src = currentMediaUrl;
        };
      } else {
        mediaEl.src = resolvedSrc;
      }

      mediaEl.addEventListener('load', () => {
        // Check natural dimensions to adjust layout dynamically
        if (mediaEl.naturalHeight > mediaEl.naturalWidth * 1.1) {
          contentWrap.classList.remove('content-layout-wide');
          contentWrap.classList.add('content-layout-tall');
        }
      });

      mediaEl.addEventListener('error', () => {
        console.warn('Image failed to load:', currentMediaUrl);
        setTimeout(nextSlide, 1500);
      });
    }

    mediaBox.appendChild(mediaEl);

    // Carousel dots indicator if multiple media
    if (item.media.length > 1) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'signage-carousel-dots';
      for (let i = 0; i < item.media.length; i++) {
        const dot = document.createElement('div');
        dot.className = `signage-carousel-dot ${i === mediaIndex ? 'active' : ''}`;
        dotsWrap.appendChild(dot);
      }
      mediaBox.appendChild(dotsWrap);
    }

    contentWrap.appendChild(mediaBox);

    // Build Information Overlay / Sidebar Card
    const infoCard = buildInfoElement(item, isTall, mediaIndex);
    if (infoCard) {
      contentWrap.appendChild(infoCard);
    }

    slide.appendChild(contentWrap);

    // Replace or transition slide in Stage
    const oldSlide = dom.stage.querySelector('.signage-slide.active');
    dom.stage.appendChild(slide);

    // Force layout reflow
    void slide.offsetHeight;

    slide.classList.add('active');
    slide.style.opacity = '1';

    if (oldSlide) {
      oldSlide.classList.remove('active');
      oldSlide.style.opacity = '0';
      setTimeout(() => {
        if (oldSlide.parentNode === dom.stage) {
          dom.stage.removeChild(oldSlide);
        }
      }, 900);
    }

    // Update Ambient Blurred Background
    updateAmbientBackdrop(item, currentMediaUrl, isVideo);
  }

  function buildInfoElement(item, isTall, mediaIndex) {
    if (state.settings.infoMode === 'off') return null;

    const currentLayout = getActiveLayout();
    let containerClass = 'signage-info-overlay';

    if (currentLayout === 'landscape' && isTall) {
      containerClass = 'signage-info-sidebar';
    } else if (currentLayout === 'portrait') {
      containerClass = 'signage-info-card';
    }

    const card = document.createElement('div');
    card.className = containerClass;

    // Header with avatar & name
    const authorRow = document.createElement('div');
    authorRow.className = 'signage-author-row';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'signage-author-avatar-wrap';
    const avatarImg = document.createElement('img');
    avatarImg.className = 'signage-author-avatar';
    avatarImg.src = item.profilePic || 'media/profile.webp';
    avatarImg.alt = item.username;
    avatarWrap.appendChild(avatarImg);
    authorRow.appendChild(avatarWrap);

    const authorMeta = document.createElement('div');
    authorMeta.className = 'signage-author-meta';

    const authorName = document.createElement('div');
    authorName.className = 'signage-author-name';
    authorName.textContent = window.signageProfile?.name || 'Gavin Spear';

    const authorSub = document.createElement('div');
    authorSub.className = 'signage-author-sub';
    authorSub.innerHTML = `<span>@${item.username}</span>`;

    // Type Badge
    const badge = document.createElement('span');
    if (item.type === 'story') {
      badge.className = 'signage-badge badge-story';
      badge.textContent = 'Story';
    } else if (item.isVideo) {
      badge.className = 'signage-badge badge-video';
      badge.textContent = 'Video';
    } else if (item.media.length > 1) {
      badge.className = 'signage-badge badge-carousel';
      badge.textContent = `${mediaIndex + 1}/${item.media.length}`;
    } else {
      badge.className = 'signage-badge';
      badge.textContent = 'Post';
    }
    authorSub.appendChild(badge);

    authorMeta.appendChild(authorName);
    authorMeta.appendChild(authorSub);
    authorRow.appendChild(authorMeta);
    card.appendChild(authorRow);

    // Caption (if present and not minimal mode)
    if (item.caption && state.settings.infoMode !== 'minimal') {
      const captionEl = document.createElement('div');
      captionEl.className = 'signage-caption';
      captionEl.textContent = item.caption;
      card.appendChild(captionEl);
    }

    // Metrics & Date footer
    const metricsRow = document.createElement('div');
    metricsRow.className = 'signage-metrics-row';

    if (item.likes !== null && item.likes > 0) {
      metricsRow.innerHTML += `
        <span class="signage-metric">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          ${item.likes.toLocaleString()}
        </span>
      `;
    }

    if (item.comments !== null && item.comments > 0) {
      metricsRow.innerHTML += `
        <span class="signage-metric">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
          ${item.comments.toLocaleString()}
        </span>
      `;
    }

    const dateEl = document.createElement('span');
    dateEl.className = 'signage-date';
    dateEl.textContent = formatHumanDate(item.date || item.timestamp);
    metricsRow.appendChild(dateEl);

    card.appendChild(metricsRow);

    return card;
  }

  function updateAmbientBackdrop(item, mediaUrl, isVideo) {
    if (!state.settings.ambientBg) {
      dom.ambientBg.classList.add('disabled');
      return;
    }
    dom.ambientBg.classList.remove('disabled');

    let bgUrl = mediaUrl;
    if (isVideo) {
      bgUrl = item.storyThumb || 'media/profile.webp';
    } else if (bgUrl && !bgUrl.endsWith('.webp') && /\.(jpg|jpeg|png)$/i.test(bgUrl)) {
      bgUrl = bgUrl.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }

    dom.ambientBg.style.backgroundImage = `url("${bgUrl}")`;
  }

  function isTallAspect(url) {
    if (!url) return false;
    if (url.includes('/stories/')) return true;
    return false;
  }

  /* ==========================================================================
     Playback Controller & Slide Timer
     ========================================================================== */

  function startSlideTimer() {
    clearSlideTimer();
    if (!state.isPlaying || state.items.length === 0) return;

    const currentItem = state.items[state.currentIndex];
    const isVideo = currentItem && currentItem.isVideo;

    // Default duration from settings for photos
    state.timerDuration = state.settings.duration * 1000;
    state.timerStartTime = performance.now();

    function updateProgress(now) {
      if (!state.isPlaying) return;

      const elapsed = now - state.timerStartTime;
      const progress = Math.min(100, (elapsed / state.timerDuration) * 100);

      if (dom.progressBar) {
        dom.progressBar.style.width = `${progress}%`;
      }

      if (elapsed >= state.timerDuration) {
        // If it's a video, let the video ended event control advancing unless it hangs
        if (!isVideo) {
          nextSlide();
        }
      } else {
        state.progressRaf = requestAnimationFrame(updateProgress);
      }
    }

    state.progressRaf = requestAnimationFrame(updateProgress);
  }

  function clearSlideTimer() {
    if (state.progressRaf) {
      cancelAnimationFrame(state.progressRaf);
      state.progressRaf = null;
    }
    if (dom.progressBar) {
      dom.progressBar.style.width = '0%';
    }
  }

  function nextSlide() {
    if (state.items.length === 0) return;

    const currentItem = state.items[state.currentIndex];
    // If carousel post and more media to display, advance carousel item
    if (currentItem && currentItem.media && currentItem.media.length > 1) {
      if (state.currentMediaIndex < currentItem.media.length - 1) {
        renderSlide(state.currentIndex, state.currentMediaIndex + 1);
        if (state.isPlaying) startSlideTimer();
        return;
      }
    }

    const nextIndex = (state.currentIndex + 1) % state.items.length;
    renderSlide(nextIndex, 0);
    if (state.isPlaying) startSlideTimer();
  }

  function prevSlide() {
    if (state.items.length === 0) return;

    const currentItem = state.items[state.currentIndex];
    // If in carousel and not at first media item, step back within post
    if (state.currentMediaIndex > 0) {
      renderSlide(state.currentIndex, state.currentMediaIndex - 1);
      if (state.isPlaying) startSlideTimer();
      return;
    }

    const prevIndex = (state.currentIndex - 1 + state.items.length) % state.items.length;
    renderSlide(prevIndex, 0);
    if (state.isPlaying) startSlideTimer();
  }

  function togglePlayPause() {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      dom.playIcon.style.display = 'none';
      dom.pauseIcon.style.display = 'block';
      startSlideTimer();

      // Resume current video if any
      const activeVideo = dom.stage.querySelector('video.signage-media');
      if (activeVideo) activeVideo.play();
    } else {
      dom.playIcon.style.display = 'block';
      dom.pauseIcon.style.display = 'none';
      clearSlideTimer();

      // Pause current video if any
      const activeVideo = dom.stage.querySelector('video.signage-media');
      if (activeVideo) activeVideo.pause();
    }
  }

  function onVideoEnded() {
    nextSlide();
  }

  function toggleMute() {
    state.settings.muted = !state.settings.muted;
    saveSettings();

    if (dom.volumeOnIcon && dom.volumeOffIcon) {
      dom.volumeOnIcon.style.display = state.settings.muted ? 'none' : 'block';
      dom.volumeOffIcon.style.display = state.settings.muted ? 'block' : 'none';
    }

    const activeVideo = dom.stage.querySelector('video.signage-media');
    if (activeVideo) {
      activeVideo.muted = state.settings.muted;
    }
  }

  /* ==========================================================================
     Orientation & Layout Management
     ========================================================================== */

  function getActiveLayout() {
    if (state.settings.orientation === 'portrait') return 'portrait';
    if (state.settings.orientation === 'landscape') return 'landscape';
    // Auto detection
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  function applyOrientationLayout() {
    const layout = getActiveLayout();

    dom.container.classList.remove('layout-landscape', 'layout-portrait', 'layout-auto');
    if (state.settings.orientation === 'auto') {
      dom.container.classList.add('layout-auto');
      dom.container.classList.add(layout === 'portrait' ? 'layout-portrait' : 'layout-landscape');
    } else {
      dom.container.classList.add(`layout-${layout}`);
    }

    // Update orientation button tooltip/label in HUD
    if (dom.orientationBtn) {
      dom.orientationBtn.setAttribute('title', `Orientation: ${state.settings.orientation.toUpperCase()}`);
    }

    // Re-render current slide info card for layout adaptions
    if (state.items.length > 0) {
      renderSlide(state.currentIndex, state.currentMediaIndex, false);
    }
  }

  function cycleOrientation() {
    const modes = ['auto', 'landscape', 'portrait'];
    const currentIdx = modes.indexOf(state.settings.orientation);
    const nextMode = modes[(currentIdx + 1) % modes.length];

    state.settings.orientation = nextMode;
    saveSettings();
    applySettingsToUi();
    applyOrientationLayout();
  }

  /* ==========================================================================
     Clock & Date Widget
     ========================================================================== */

  function initClock() {
    function update() {
      const now = new Date();
      if (dom.clockTime) {
        dom.clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (dom.clockDate) {
        dom.clockDate.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    }
    update();
    setInterval(update, 1000);
  }

  /* ==========================================================================
     Auto-Hiding HUD & Kiosk Idle Detection
     ========================================================================== */

  function initIdleDetection() {
    const resetIdle = () => {
      document.body.classList.remove('idle-cursor');
      if (dom.hud) dom.hud.classList.remove('hidden');

      clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(() => {
        // Do not hide if settings modal is open
        if (dom.settingsModal && dom.settingsModal.classList.contains('open')) return;

        document.body.classList.add('idle-cursor');
        if (dom.hud) dom.hud.classList.add('hidden');
      }, 3500);
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('mousedown', resetIdle);
    window.addEventListener('touchstart', resetIdle);
    window.addEventListener('keydown', resetIdle);

    resetIdle();
  }

  /* ==========================================================================
     Wake Lock API (Keep Monitor Awake)
     ========================================================================== */

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', () => {
          state.wakeLock = null;
        });
      } catch (err) {
        console.log('Screen Wake Lock not supported or request was denied:', err);
      }
    }
  }

  // Re-request wake lock when page regains visibility
  document.addEventListener('visibilitychange', () => {
    if (state.wakeLock !== null && document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });

  /* ==========================================================================
     Keyboard Shortcuts & Events
     ========================================================================== */

  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          nextSlide();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          prevSlide();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          cycleOrientation();
          break;
        case 'k':
        case 'K':
          e.preventDefault();
          state.settings.kenBurns = !state.settings.kenBurns;
          saveSettings();
          applySettingsToUi();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          cycleInfoMode();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          toggleSettingsModal();
          break;
        case 'Escape':
          if (dom.settingsModal && dom.settingsModal.classList.contains('open')) {
            dom.settingsModal.classList.remove('open');
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            exitToGallery();
          }
          break;
      }
    });

    // Double-click to toggle fullscreen
    window.addEventListener('dblclick', (e) => {
      if (e.target.closest('#signageHud') || e.target.closest('#settingsModal')) return;
      toggleFullscreen();
    });
  }

  function initEventListeners() {
    if (dom.playBtn) dom.playBtn.addEventListener('click', togglePlayPause);
    if (dom.nextBtn) dom.nextBtn.addEventListener('click', nextSlide);
    if (dom.prevBtn) dom.prevBtn.addEventListener('click', prevSlide);
    if (dom.orientationBtn) dom.orientationBtn.addEventListener('click', cycleOrientation);
    if (dom.muteBtn) dom.muteBtn.addEventListener('click', toggleMute);
    if (dom.fullscreenBtn) dom.fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (dom.exitBtn) dom.exitBtn.addEventListener('click', exitToGallery);
    if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', toggleSettingsModal);
    if (dom.settingsCloseBtn) dom.settingsCloseBtn.addEventListener('click', toggleSettingsModal);

    // Segmented Buttons in Settings
    setupSegmentedControls('orientation', (val) => {
      state.settings.orientation = val;
      saveSettings();
      applyOrientationLayout();
    });

    setupSegmentedControls('duration', (val) => {
      state.settings.duration = parseInt(val, 10);
      saveSettings();
      if (state.isPlaying) startSlideTimer();
    });

    setupSegmentedControls('filter', (val) => {
      state.settings.filter = val;
      saveSettings();
      rebuildPlaylist();
      renderSlide(0, 0);
      if (state.isPlaying) startSlideTimer();
    });

    setupSegmentedControls('order', (val) => {
      state.settings.order = val;
      saveSettings();
      rebuildPlaylist();
      renderSlide(0, 0);
      if (state.isPlaying) startSlideTimer();
    });

    setupSegmentedControls('infoMode', (val) => {
      state.settings.infoMode = val;
      saveSettings();
      applySettingsToUi();
      renderSlide(state.currentIndex, state.currentMediaIndex, false);
    });

    // Toggle Checkboxes
    if (dom.toggleKenBurns) {
      dom.toggleKenBurns.addEventListener('change', (e) => {
        state.settings.kenBurns = e.target.checked;
        saveSettings();
        applySettingsToUi();
      });
    }

    if (dom.toggleAmbientBg) {
      dom.toggleAmbientBg.addEventListener('change', (e) => {
        state.settings.ambientBg = e.target.checked;
        saveSettings();
        applySettingsToUi();
        const currentItem = state.items[state.currentIndex];
        if (currentItem) updateAmbientBackdrop(currentItem, currentItem.media[state.currentMediaIndex], currentItem.isVideo);
      });
    }

    if (dom.toggleClock) {
      dom.toggleClock.addEventListener('change', (e) => {
        state.settings.clock = e.target.checked;
        saveSettings();
        applySettingsToUi();
      });
    }

    if (dom.toggleMuted) {
      dom.toggleMuted.addEventListener('change', (e) => {
        state.settings.muted = e.target.checked;
        saveSettings();
        applySettingsToUi();
        const activeVideo = dom.stage.querySelector('video.signage-media');
        if (activeVideo) activeVideo.muted = state.settings.muted;
      });
    }
  }

  function setupSegmentedControls(settingName, onChange) {
    const buttons = document.querySelectorAll(`[data-setting="${settingName}"]`);
    buttons.forEach((btn) => {
      btn.addEventListener('click', function () {
        buttons.forEach((b) => b.classList.remove('active'));
        this.classList.add('active');
        const val = this.getAttribute('data-value');
        onChange(val);
      });
    });
  }

  function cycleInfoMode() {
    const modes = ['full', 'minimal', 'off'];
    const idx = modes.indexOf(state.settings.infoMode);
    state.settings.infoMode = modes[(idx + 1) % modes.length];
    saveSettings();
    applySettingsToUi();
    renderSlide(state.currentIndex, state.currentMediaIndex, false);
  }

  function toggleSettingsModal() {
    if (dom.settingsModal) {
      dom.settingsModal.classList.toggle('open');
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function exitToGallery() {
    window.location.href = 'index.html';
  }

  /* ==========================================================================
     Settings Persistence & Sync
     ========================================================================== */

  function loadSavedSettings() {
    try {
      const saved = localStorage.getItem('memento_mori_signage_settings');
      if (saved) {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read settings from localStorage:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('memento_mori_signage_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.warn('Could not write settings to localStorage:', e);
    }
  }

  function applySettingsToUi() {
    // Sync Segmented Buttons
    syncSegmentedActive('orientation', state.settings.orientation);
    syncSegmentedActive('duration', String(state.settings.duration));
    syncSegmentedActive('filter', state.settings.filter);
    syncSegmentedActive('order', state.settings.order);
    syncSegmentedActive('infoMode', state.settings.infoMode);

    // Sync Checkboxes
    if (dom.toggleKenBurns) dom.toggleKenBurns.checked = state.settings.kenBurns;
    if (dom.toggleAmbientBg) dom.toggleAmbientBg.checked = state.settings.ambientBg;
    if (dom.toggleClock) dom.toggleClock.checked = state.settings.clock;
    if (dom.toggleMuted) dom.toggleMuted.checked = state.settings.muted;

    // Volume icon
    if (dom.volumeOnIcon && dom.volumeOffIcon) {
      dom.volumeOnIcon.style.display = state.settings.muted ? 'none' : 'block';
      dom.volumeOffIcon.style.display = state.settings.muted ? 'block' : 'none';
    }

    // Ken Burns root class
    if (state.settings.kenBurns) {
      dom.root.classList.add('kenburns-active');
    } else {
      dom.root.classList.remove('kenburns-active');
    }

    // Clock visibility
    if (dom.clockWidget) {
      dom.clockWidget.style.display = state.settings.clock ? 'flex' : 'none';
    }

    // Info mode root class
    dom.root.classList.remove('info-mode-full', 'info-mode-minimal', 'info-mode-off');
    dom.root.classList.add(`info-mode-${state.settings.infoMode}`);
  }

  function syncSegmentedActive(settingName, val) {
    const buttons = document.querySelectorAll(`[data-setting="${settingName}"]`);
    buttons.forEach((b) => {
      if (b.getAttribute('data-value') === val) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('orientation')) {
      const orient = params.get('orientation');
      if (['auto', 'landscape', 'portrait'].includes(orient)) {
        state.settings.orientation = orient;
      }
    }

    if (params.has('filter')) {
      const filter = params.get('filter');
      if (['all', 'posts', 'stories', 'photos', 'videos'].includes(filter)) {
        state.settings.filter = filter;
      }
    }

    if (params.has('interval') || params.has('duration')) {
      const dur = parseInt(params.get('interval') || params.get('duration'), 10);
      if (!isNaN(dur) && dur > 0) {
        state.settings.duration = dur;
      }
    }

    if (params.has('order')) {
      const order = params.get('order');
      if (['shuffle', 'newest', 'oldest'].includes(order)) {
        state.settings.order = order;
      }
    }

    // If starting from a specific post timestamp
    if (params.has('post')) {
      const postTimestamp = parseInt(params.get('post'), 10);
      rebuildPlaylist();
      const matchIdx = state.items.findIndex((item) => item.timestamp === postTimestamp);
      if (matchIdx !== -1) {
        state.currentIndex = matchIdx;
      }
    } else {
      rebuildPlaylist();
    }
  }

  function updateCounter() {
    if (dom.counter && state.items.length > 0) {
      dom.counter.textContent = `${state.currentIndex + 1} / ${state.items.length}`;
    }
  }

  function showEmptyState() {
    dom.stage.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #fff;">
        <h2 style="font-size: 24px; margin-bottom: 12px;">No Media Found</h2>
        <p style="color: rgba(255,255,255,0.6); margin-bottom: 24px;">No posts or stories matched your filter criteria.</p>
        <button onclick="window.location.href='index.html'" style="background: #0095f6; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Return to Archive
        </button>
      </div>
    `;
  }

  /* ==========================================================================
     Utilities
     ========================================================================== */

  function formatHumanDate(dateInput) {
    if (typeof dateInput === 'string' && dateInput.length > 4) {
      return dateInput;
    }
    const timestamp = typeof dateInput === 'number' ? dateInput : parseInt(dateInput, 10);
    if (!timestamp || isNaN(timestamp)) return '';

    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
})();

