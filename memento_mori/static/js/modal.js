// memento_mori/static/js/modal.js

/**
 * Storage manager using IndexedDB for storing custom user-added posts
 * Enables offline, high-capacity, persistent storage directly in the browser
 */
const PostStorage = {
    DB_NAME: 'memento_mori_db',
    DB_VERSION: 1,
    STORE_NAME: 'custom_posts',
    LOCAL_KEY: 'memento_user_posts',

    getLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.LOCAL_KEY) || '[]');
        } catch (e) {
            return [];
        }
    },

    saveLocalStorage(posts) {
        try {
            localStorage.setItem(this.LOCAL_KEY, JSON.stringify(posts));
        } catch (e) {
            console.warn('localStorage write failed:', e);
        }
    },

    openDB() {
        return new Promise((resolve) => {
            if (!('indexedDB' in window)) {
                return resolve(null);
            }
            let resolved = false;
            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            }, 600);

            try {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        db.createObjectStore(this.STORE_NAME, { keyPath: 't' });
                    }
                };
                request.onsuccess = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(request.result);
                    }
                };
                request.onerror = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(null);
                    }
                };
            } catch (err) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(null);
                }
            }
        });
    },

    async getAll() {
        const localPosts = this.getLocalStorage();
        try {
            const db = await this.openDB();
            if (!db) return localPosts;
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.getAll();
                req.onsuccess = () => {
                    const idbPosts = req.result || [];
                    // Merge local and idb
                    const postMap = new Map();
                    localPosts.forEach(p => postMap.set(String(p.t), p));
                    idbPosts.forEach(p => postMap.set(String(p.t), p));
                    resolve(Array.from(postMap.values()));
                };
                req.onerror = () => resolve(localPosts);
            });
        } catch (e) {
            return localPosts;
        }
    },

    async save(post) {
        // Save to localStorage
        const posts = this.getLocalStorage();
        const existingIdx = posts.findIndex(p => String(p.t) === String(post.t));
        if (existingIdx >= 0) {
            posts[existingIdx] = post;
        } else {
            posts.unshift(post);
        }
        this.saveLocalStorage(posts);

        // Also save to IndexedDB
        try {
            const db = await this.openDB();
            if (db) {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.put(post);
            }
        } catch (e) {
            console.warn('IDB save error:', e);
        }
        return post;
    },

    async remove(timestamp) {
        // Remove from localStorage
        const posts = this.getLocalStorage().filter(p => String(p.t) !== String(timestamp));
        this.saveLocalStorage(posts);

        // Also remove from IndexedDB
        try {
            const db = await this.openDB();
            if (db) {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                store.delete(Number(timestamp));
            }
        } catch (e) {
            console.warn('IDB remove error:', e);
        }
        return true;
    }
};

/**
 * Toast notification helper
 */
function showToast(message, duration = 3000) {
    const toast = document.getElementById('igToast');
    if (!toast) return;
    toast.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span>${message}</span>`;
    toast.style.display = 'flex';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

/**
 * Optimize image file for web and storage using HTML Canvas
 */
function optimizeImageFile(file, maxDimension = 1600, quality = 0.85) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            const mediaUrl = URL.createObjectURL(file);
            resolve({
                dataUrl: mediaUrl,
                thumbUrl: mediaUrl,
                isVideo: true,
                file: file
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                // Full-size optimized canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                // Thumbnail canvas (square 300x300 crop)
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 300;
                thumbCanvas.height = 300;
                const thumbCtx = thumbCanvas.getContext('2d');
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                thumbCtx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 300, 300);
                const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

                resolve({
                    dataUrl,
                    thumbUrl,
                    isVideo: false,
                    file: file
                });
            };
            img.onerror = () => {
                resolve({
                    dataUrl: e.target.result,
                    thumbUrl: e.target.result,
                    isVideo: false,
                    file: file
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Format timestamp into Instagram export date format
 */
function formatInstagramDate(dateObj) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = months[dateObj.getMonth()];
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = dateObj.getFullYear();

    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? String(hours).padStart(2, '0') : '12';

    return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

document.addEventListener('DOMContentLoaded', async function () {
    // DOM Elements
    const postsGrid = document.getElementById('postsGrid');
    const postModal = document.getElementById('postModal');
    const closeModalBtn = document.getElementById('closeModal');
    const mobileModalBackBtn = document.getElementById('mobileModalBackBtn');
    const modalPrev = document.getElementById('modalPrev');
    const modalNext = document.getElementById('modalNext');
    const postMedia = document.getElementById('postMedia');
    const postCaption = document.getElementById('postCaption');
    const postStats = document.getElementById('postStats');
    const postDate = document.getElementById('postDate');
    const postUsername = document.getElementById('postUsername');
    const postUserPic = document.getElementById('postUserPic');
    const sortLinks = document.querySelectorAll('.sort-link');

    // Create Modal Elements
    const openCreatePostBtn = document.getElementById('openCreatePostBtn');
    const navCreateBtn = document.getElementById('navCreateBtn');
    const createPostModal = document.getElementById('createPostModal');
    const createModalBackdrop = document.getElementById('createModalBackdrop');
    const createCancelBtn = document.getElementById('createCancelBtn');
    const createShareBtn = document.getElementById('createShareBtn');
    const createFileInput = document.getElementById('createFileInput');
    const createCameraInput = document.getElementById('createCameraInput');
    const createAddMoreInput = document.getElementById('createAddMoreInput');
    const createUploadZone = document.getElementById('createUploadZone');
    const createEditorZone = document.getElementById('createEditorZone');
    const editorMediaViewport = document.getElementById('editorMediaViewport');
    const editorThumbsStrip = document.getElementById('editorThumbsStrip');
    const editorSlideNav = document.getElementById('editorSlideNav');
    const editorPrevBtn = document.getElementById('editorPrevBtn');
    const editorNextBtn = document.getElementById('editorNextBtn');
    const editorIndicators = document.getElementById('editorIndicators');
    const createCaptionInput = document.getElementById('createCaptionInput');
    const createDateInput = document.getElementById('createDateInput');
    const setDateNowBtn = document.getElementById('setDateNowBtn');

    // Options Sheet Elements
    const desktopPostOptionsBtn = document.getElementById('desktopPostOptionsBtn');
    const mobileModalOptionsBtn = document.getElementById('mobileModalOptionsBtn');
    const postOptionsSheet = document.getElementById('postOptionsSheet');
    const deletePostBtn = document.getElementById('deletePostBtn');
    const downloadMediaBtn = document.getElementById('downloadMediaBtn');
    const copyPostLinkBtn = document.getElementById('copyPostLinkBtn');
    const closeOptionsSheetBtn = document.getElementById('closeOptionsSheetBtn');

    // Action buttons inside modal
    const likeActionBtn = document.getElementById('likeActionBtn');
    const shareActionBtn = document.getElementById('shareActionBtn');
    const saveActionBtn = document.getElementById('saveActionBtn');

    // Bottom Navigation Elements
    const navHomeBtn = document.getElementById('navHomeBtn');
    const navFilterBtn = document.getElementById('navFilterBtn');
    const navProfileBtn = document.getElementById('navProfileBtn');

    // State Variables
    let currentPostIndex = -1;
    let currentSlideIndex = 0;
    let postIndexToTimestamp = {};
    let currentSortType = 'newest';
    let selectedFiles = []; // Array of { dataUrl, thumbUrl, isVideo, file }
    let editorActiveIndex = 0;

    // Ensure window.postData is initialized
    window.postData = window.postData || {};

    // Initialize mapping and event listeners IMMEDIATELY so buttons work with zero delay
    initialize();

    // Load any saved custom posts asynchronously in the background
    loadCustomPosts().catch(err => console.warn('Custom posts load:', err));

    /**
     * Load custom posts from IndexedDB and merge into postData and DOM
     */
    async function loadCustomPosts() {
        const customPosts = await PostStorage.getAll();
        if (customPosts && customPosts.length > 0) {
            // Sort custom posts so highest timestamp comes first
            customPosts.sort((a, b) => b.t - a.t);

            customPosts.forEach(post => {
                const timestampStr = String(post.t);
                window.postData[timestampStr] = post;
                insertGridItem(post, false);
            });

            updatePostCountDisplay();
        }
    }

    /**
     * Update the post count displayed in the profile
     */
    function updatePostCountDisplay() {
        const postCountEl = document.getElementById('post-count');
        if (postCountEl) {
            const total = Object.keys(window.postData).length;
            postCountEl.textContent = total;
        }
    }

    /**
     * Insert a post item into the DOM grid
     */
    function insertGridItem(post, prepend = true) {
        if (!postsGrid) return;

        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';
        gridItem.setAttribute('data-index', post.i);
        gridItem.setAttribute('data-media-count', post.m ? post.m.length : 1);
        const isVideo = post.m && post.m[0] && (post.m[0].endsWith('.mp4') || post.m[0].endsWith('.mov') || post.m[0].endsWith('.webm'));
        gridItem.setAttribute('data-is-video', isVideo ? 'true' : 'false');
        if (post.custom) {
            gridItem.setAttribute('data-custom', 'true');
        }

        const thumbUrl = post.thumb || (post.m && post.m[0]) || '';

        let badgeHtml = '';
        if (isVideo) {
            badgeHtml = `
              <div class="media-type-badge video-badge" title="Video">
                <svg aria-label="Video" fill="currentColor" height="18" role="img" viewBox="0 0 24 24" width="18">
                  <path d="M5.888 22.5a3.46 3.46 0 0 1-1.721-.46l-.003-.002a3.451 3.451 0 0 1-1.72-2.982V4.943a3.45 3.45 0 0 1 5.163-2.987l12.226 7.029a3.45 3.45 0 0 1 0 5.972l-12.223 7.029a3.435 3.435 0 0 1-1.722.514z"></path>
                </svg>
              </div>`;
        } else if (post.m && post.m.length > 1) {
            badgeHtml = `
              <div class="media-type-badge carousel-badge" title="${post.m.length} items">
                <svg aria-label="Carousel" fill="currentColor" height="18" role="img" viewBox="0 0 48 48" width="18">
                  <path d="M34.8 29.7V8.3c0-2.9-2.4-5.3-5.3-5.3H8.1C5.2 3 2.8 5.4 2.8 8.3v21.4c0 2.9 2.4 5.3 5.3 5.3h21.4c2.9 0 5.3-2.4 5.3-5.3zm-5.3-23.7c1.3 0 2.3 1 2.3 2.3v21.4c0 1.3-1 2.3-2.3 2.3H8.1c-1.3 0-2.3-1-2.3-2.3V8.3c0-1.3 1-2.3 2.3-2.3h21.4zm10.7 7.7c-.8 0-1.5.7-1.5 1.5v22.8c0 1.3-1 2.3-2.3 2.3H13.6c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5h22.8c2.9 0 5.3-2.4 5.3-5.3V15.2c0-.8-.7-1.5-1.5-1.5z"></path>
                </svg>
              </div>`;
        }

        gridItem.innerHTML = `
          <div class="grid-item-media">
            <img src="${thumbUrl}" alt="Instagram post" loading="lazy">
          </div>
          ${badgeHtml}
          <div class="grid-item-overlay">
            <div class="grid-overlay-content">
              ${post.l ? `<div class="overlay-stat"><svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span>${post.l}</span></div>` : ''}
              ${post.c ? `<div class="overlay-stat"><svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg><span>${post.c}</span></div>` : ''}
              ${!post.l && !post.c && post.m && post.m.length > 1 ? `<div class="overlay-stat"><span>${post.m.length} items</span></div>` : ''}
            </div>
          </div>
        `;

        if (prepend && postsGrid.firstChild) {
            postsGrid.insertBefore(gridItem, postsGrid.firstChild);
        } else {
            postsGrid.appendChild(gridItem);
        }

        // Attach click listener
        gridItem.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            openModal(index);
        });
    }

    /**
     * Initialize post index mapping and listeners
     */
    function initialize() {
        postIndexToTimestamp = {};
        Object.entries(window.postData).forEach(([timestamp, post]) => {
            postIndexToTimestamp[post.i] = timestamp;
        });

        attachGridItemListeners();
        initializeSorting();
        initializeCreatePost();
        initializeTouchGestures();
        initializeOptionsSheet();
        initializeBottomNav();

        // Check URL parameters for direct post link
        const urlParams = new URLSearchParams(window.location.search);
        const postTimestamp = urlParams.get('post');
        const imageIndex = parseInt(urlParams.get('image') || '0');

        if (postTimestamp && window.postData[postTimestamp]) {
            let targetIdx = -1;
            Object.entries(postIndexToTimestamp).forEach(([index, t]) => {
                if (String(t) === String(postTimestamp)) {
                    targetIdx = parseInt(index);
                }
            });
            if (targetIdx >= 0) {
                setTimeout(() => openModal(targetIdx, imageIndex), 300);
            }
        }
    }

    function attachGridItemListeners() {
        const gridItems = document.querySelectorAll('.grid-item');
        gridItems.forEach(item => {
            // Remove previous listener clone to prevent duplicates
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            newItem.addEventListener('click', function () {
                const postIndex = parseInt(this.getAttribute('data-index'));
                openModal(postIndex);
            });
        });
    }

    /**
     * Sorting functionality
     */
    function initializeSorting() {
        sortLinks.forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                sortLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
                const sortType = this.getAttribute('data-sort');
                currentSortType = sortType;
                sortPosts(sortType);
            });
        });
    }

    function sortPosts(sortType) {
        let gridItems = Array.from(document.querySelectorAll('.grid-item'));

        switch (sortType) {
            case 'newest':
                gridItems.sort((a, b) => {
                    const indexA = parseInt(a.getAttribute('data-index'));
                    const indexB = parseInt(b.getAttribute('data-index'));
                    return getTimestampByIndex(indexB) - getTimestampByIndex(indexA);
                });
                break;

            case 'oldest':
                gridItems.sort((a, b) => {
                    const indexA = parseInt(a.getAttribute('data-index'));
                    const indexB = parseInt(b.getAttribute('data-index'));
                    return getTimestampByIndex(indexA) - getTimestampByIndex(indexB);
                });
                break;

            case 'most-media':
                gridItems.sort((a, b) => {
                    const countA = parseInt(a.getAttribute('data-media-count')) || 1;
                    const countB = parseInt(b.getAttribute('data-media-count')) || 1;
                    if (countB !== countA) return countB - countA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'videos-only':
                gridItems.sort((a, b) => {
                    const isVideoA = a.getAttribute('data-is-video') === 'true' ? 1 : 0;
                    const isVideoB = b.getAttribute('data-is-video') === 'true' ? 1 : 0;
                    if (isVideoB !== isVideoA) return isVideoB - isVideoA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'photos-only':
                gridItems.sort((a, b) => {
                    const isPhotoA = a.getAttribute('data-is-video') !== 'true' ? 1 : 0;
                    const isPhotoB = b.getAttribute('data-is-video') !== 'true' ? 1 : 0;
                    if (isPhotoB !== isPhotoA) return isPhotoB - isPhotoA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'most-likes':
                gridItems.sort((a, b) => {
                    const likesA = getLikesByIndex(parseInt(a.getAttribute('data-index'))) || 0;
                    const likesB = getLikesByIndex(parseInt(b.getAttribute('data-index'))) || 0;
                    if (likesB !== likesA) return likesB - likesA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'most-comments':
                gridItems.sort((a, b) => {
                    const commentsA = getCommentsByIndex(parseInt(a.getAttribute('data-index'))) || 0;
                    const commentsB = getCommentsByIndex(parseInt(b.getAttribute('data-index'))) || 0;
                    if (commentsB !== commentsA) return commentsB - commentsA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'most-views':
                gridItems.sort((a, b) => {
                    const viewsA = getViewsByIndex(parseInt(a.getAttribute('data-index'))) || 0;
                    const viewsB = getViewsByIndex(parseInt(b.getAttribute('data-index'))) || 0;
                    if (viewsB !== viewsA) return viewsB - viewsA;
                    return getTimestampByIndex(parseInt(b.getAttribute('data-index'))) - getTimestampByIndex(parseInt(a.getAttribute('data-index')));
                });
                break;

            case 'random':
                gridItems.sort(() => Math.random() - 0.5);
                break;
        }

        const fragment = document.createDocumentFragment();
        gridItems.forEach(item => fragment.appendChild(item));
        postsGrid.innerHTML = '';
        postsGrid.appendChild(fragment);
        attachGridItemListeners();
    }

    function getTimestampByIndex(index) {
        const timestamp = postIndexToTimestamp[index];
        return parseInt(timestamp) || 0;
    }

    function getLikesByIndex(index) {
        const timestamp = postIndexToTimestamp[index];
        if (timestamp && window.postData[timestamp]) {
            return parseInt(window.postData[timestamp].l) || 0;
        }
        return 0;
    }

    function getCommentsByIndex(index) {
        const timestamp = postIndexToTimestamp[index];
        if (timestamp && window.postData[timestamp]) {
            return parseInt(window.postData[timestamp].c) || 0;
        }
        return 0;
    }

    function getViewsByIndex(index) {
        const timestamp = postIndexToTimestamp[index];
        if (timestamp && window.postData[timestamp]) {
            return parseInt(window.postData[timestamp].im) || 0;
        }
        return 0;
    }

    /**
     * Open post modal
     */
    function openModal(index, imageIndex = 0) {
        currentPostIndex = index;
        const timestamp = postIndexToTimestamp[index];
        const post = window.postData[timestamp];

        if (!post) {
            console.error('Post not found for index:', index);
            return;
        }

        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        postModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        postModal.setAttribute('data-scroll-position', scrollPosition);

        updateModalContent(post, imageIndex);
        updateUrlWithPostInfo(timestamp, imageIndex);

        if (window.innerWidth <= 768) {
            postModal.scrollTop = 0;
        }
    }

    function updateUrlWithPostInfo(timestamp, imageIndex) {
        const url = new URL(window.location.href);
        url.searchParams.set('post', timestamp);
        if (imageIndex > 0) {
            url.searchParams.set('image', imageIndex);
        } else {
            url.searchParams.delete('image');
        }
        window.history.pushState({}, '', url);
    }

    function createMediaElement(mediaUrl) {
        const isVideo = mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') ||
            mediaUrl.endsWith('.avi') || mediaUrl.endsWith('.webm');

        if (isVideo) {
            const video = document.createElement('video');
            video.src = mediaUrl;
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = false;
            video.playsInline = true;
            video.alt = 'Instagram video post';
            return video;
        } else {
            const img = document.createElement('img');
            // Try WebP fallback for static server assets
            if (!mediaUrl.startsWith('data:') && !mediaUrl.startsWith('blob:') &&
                !mediaUrl.endsWith('.webp') &&
                (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') ||
                    mediaUrl.endsWith('.png') || mediaUrl.endsWith('.gif'))) {
                const webpUrl = mediaUrl.replace(/\.(jpg|jpeg|png|gif)$/i, '.webp');
                img.onerror = function () {
                    this.onerror = null;
                    this.src = mediaUrl;
                };
                img.src = webpUrl;
            } else {
                img.src = mediaUrl;
            }
            img.alt = 'Instagram post';
            return img;
        }
    }

    function updateModalContent(post, initialImageIndex = 0) {
        postMedia.innerHTML = '';
        postCaption.innerHTML = '';
        postStats.innerHTML = '';

        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-container';

        if (post.m && post.m.length > 1) {
            post.m.forEach((mediaUrl, index) => {
                const slide = document.createElement('div');
                slide.className = `media-slide ${index === initialImageIndex ? 'active' : ''}`;
                slide.appendChild(createMediaElement(mediaUrl));
                mediaContainer.appendChild(slide);
            });

            // Navigation buttons
            const prevBtn = document.createElement('div');
            prevBtn.className = 'slideshow-nav slideshow-prev';
            prevBtn.innerHTML = '❮';
            prevBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                navigateSlideshow(-1);
            });

            const nextBtn = document.createElement('div');
            nextBtn.className = 'slideshow-nav slideshow-next';
            nextBtn.innerHTML = '❯';
            nextBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                navigateSlideshow(1);
            });

            const indicator = document.createElement('div');
            indicator.className = 'slideshow-indicator';
            for (let i = 0; i < post.m.length; i++) {
                const dot = document.createElement('div');
                dot.className = `slideshow-dot ${i === initialImageIndex ? 'active' : ''}`;
                dot.setAttribute('data-index', i);
                dot.addEventListener('click', function (e) {
                    e.stopPropagation();
                    showSlide(parseInt(this.getAttribute('data-index')));
                });
                indicator.appendChild(dot);
            }

            mediaContainer.appendChild(prevBtn);
            mediaContainer.appendChild(nextBtn);
            mediaContainer.appendChild(indicator);
            currentSlideIndex = initialImageIndex;
        } else {
            const slide = document.createElement('div');
            slide.className = 'media-slide active';
            const singleMedia = (post.m && post.m[0]) ? post.m[0] : '';
            if (singleMedia) {
                slide.appendChild(createMediaElement(singleMedia));
            }
            mediaContainer.appendChild(slide);
            currentSlideIndex = 0;
        }

        postMedia.appendChild(mediaContainer);

        // Caption formatting
        const captionRow = document.querySelector('.post-caption-row');
        if (post.tt) {
            let escaped = post.tt
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            escaped = escaped.replace(/(^|\s)@([a-zA-Z0-9_.]+)/g, '$1<span class="ig-mention">@$2</span>');
            escaped = escaped.replace(/(^|\s)#([a-zA-Z0-9_]+)/g, '$1<span class="ig-hashtag">#$2</span>');
            postCaption.innerHTML = escaped.replace(/\n/g, '<br>');
            if (captionRow) captionRow.style.display = 'flex';
        } else {
            postCaption.innerHTML = '';
            if (captionRow) captionRow.style.display = 'none';
        }

        // Stats
        if (post.l && post.l !== '0') {
            const likesDiv = document.createElement('div');
            likesDiv.className = 'post-stat';
            likesDiv.innerHTML = `<strong>${post.l}</strong> likes`;
            postStats.appendChild(likesDiv);
        }

        if (post.c && post.c !== '0') {
            const commentsDiv = document.createElement('div');
            commentsDiv.className = 'post-stat';
            commentsDiv.innerHTML = `<strong>${post.c}</strong> comments`;
            postStats.appendChild(commentsDiv);
        }

        if (post.im && post.im !== '0') {
            const impressionsDiv = document.createElement('div');
            impressionsDiv.className = 'post-stat';
            impressionsDiv.innerHTML = `<strong>${post.im}</strong> views`;
            postStats.appendChild(impressionsDiv);
        }

        postDate.textContent = post.d || '';
        postStats.style.display = postStats.children.length > 0 ? 'flex' : 'none';

        // Reset like/save button state
        if (likeActionBtn) {
            likeActionBtn.classList.remove('liked');
            likeActionBtn.setAttribute('fill', 'none');
        }
    }

    function navigateSlideshow(direction) {
        const slides = document.querySelectorAll('.media-slide');
        if (slides.length <= 1) return;

        let activeIndex = currentSlideIndex;
        slides.forEach((slide, idx) => {
            if (slide.classList.contains('active')) activeIndex = idx;
        });

        // Pause video in active slide
        const currentVideo = slides[activeIndex].querySelector('video');
        if (currentVideo) currentVideo.pause();

        let newIndex = activeIndex + direction;
        if (newIndex < 0) newIndex = slides.length - 1;
        if (newIndex >= slides.length) newIndex = 0;

        showSlide(newIndex);
    }

    function showSlide(index) {
        const slides = document.querySelectorAll('.media-slide');
        const dots = document.querySelectorAll('.slideshow-dot');
        if (!slides[index]) return;

        slides.forEach(slide => {
            const video = slide.querySelector('video');
            if (video) video.pause();
            slide.classList.remove('active');
        });

        if (dots.length > 0) {
            dots.forEach(dot => dot.classList.remove('active'));
            if (dots[index]) dots[index].classList.add('active');
        }

        slides[index].classList.add('active');
        currentSlideIndex = index;

        const timestamp = postIndexToTimestamp[currentPostIndex];
        if (timestamp) updateUrlWithPostInfo(timestamp, index);
    }

    function navigatePost(direction) {
        const videos = document.querySelectorAll('.media-slide video');
        videos.forEach(v => v.pause());

        const gridItems = Array.from(document.querySelectorAll('.grid-item'));
        const gridIndexes = gridItems.map(item => parseInt(item.getAttribute('data-index')));
        const currentPosition = gridIndexes.indexOf(currentPostIndex);

        if (currentPosition === -1) return;

        let newPosition = (currentPosition + direction + gridIndexes.length) % gridIndexes.length;
        const newPostIndex = gridIndexes[newPosition];
        openModal(newPostIndex);
    }

    function closeModal() {
        const videos = document.querySelectorAll('.media-slide video');
        videos.forEach(v => v.pause());

        const scrollPosition = postModal.getAttribute('data-scroll-position') || 0;
        postModal.style.display = 'none';
        document.body.style.overflow = 'auto';

        const url = new URL(window.location.href);
        url.searchParams.delete('post');
        url.searchParams.delete('image');
        window.history.pushState({}, '', url);

        setTimeout(() => {
            window.scrollTo({
                top: parseInt(scrollPosition) || 0,
                behavior: 'auto'
            });
        }, 10);
    }

    // Modal navigation listeners
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (mobileModalBackBtn) mobileModalBackBtn.addEventListener('click', closeModal);
    if (modalPrev) modalPrev.addEventListener('click', (e) => { e.stopPropagation(); navigatePost(-1); });
    if (modalNext) modalNext.addEventListener('click', (e) => { e.stopPropagation(); navigatePost(1); });

    postModal.addEventListener('click', function (e) {
        if (e.target === postModal) closeModal();
    });

    document.addEventListener('keydown', function (e) {
        if (postModal.style.display === 'block') {
            if (e.key === 'Escape') closeModal();
            else if (e.key === 'ArrowLeft') navigatePost(-1);
            else if (e.key === 'ArrowRight') navigatePost(1);
        }
    });

    /**
     * Touch & Swipe Gestures for Mobile
     */
    function initializeTouchGestures() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let lastTapTime = 0;

        // Double-tap on media to like
        postMedia.addEventListener('click', function (e) {
            const currentTime = Date.now();
            const tapGap = currentTime - lastTapTime;
            lastTapTime = currentTime;

            if (tapGap < 320 && tapGap > 0) {
                // Double tap detected!
                triggerHeartAnimation(e);
            }
        });

        // Touch swipe tracking on post media and modal content
        postModal.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: true });

        postModal.addEventListener('touchend', function (e) {
            if (e.changedTouches.length !== 1) return;
            const deltaX = e.changedTouches[0].clientX - touchStartX;
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            const duration = Date.now() - touchStartTime;

            // 1. Swipe Down to close modal (if at top of modal scroll)
            if (deltaY > 80 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5 && postModal.scrollTop <= 15) {
                closeModal();
                return;
            }

            // 2. Horizontal swipe
            if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && duration < 600) {
                const timestamp = postIndexToTimestamp[currentPostIndex];
                const currentPost = window.postData[timestamp];

                // If post has multiple media slides:
                if (currentPost && currentPost.m && currentPost.m.length > 1) {
                    if (deltaX < 0) {
                        // Swipe left -> next slide (or next post if at end)
                        if (currentSlideIndex < currentPost.m.length - 1) {
                            navigateSlideshow(1);
                            return;
                        }
                    } else {
                        // Swipe right -> prev slide (or prev post if at start)
                        if (currentSlideIndex > 0) {
                            navigateSlideshow(-1);
                            return;
                        }
                    }
                }

                // Navigate post
                if (deltaX < 0) {
                    navigatePost(1);
                } else {
                    navigatePost(-1);
                }
            }
        }, { passive: true });
    }

    /**
     * Trigger Instagram heart pop animation on double-tap
     */
    function triggerHeartAnimation(e) {
        const rect = postMedia.getBoundingClientRect();
        const heart = document.createElement('div');
        heart.className = 'ig-heart-pulse';
        heart.innerHTML = `
          <svg viewBox="0 0 24 24" width="80" height="80" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>`;
        postMedia.appendChild(heart);

        if (likeActionBtn) {
            likeActionBtn.classList.add('liked');
            likeActionBtn.setAttribute('fill', '#ff3040');
        }

        setTimeout(() => {
            if (heart.parentNode) heart.parentNode.removeChild(heart);
        }, 900);
    }

    /**
     * Actions in post footer (Like, Save, Share)
     */
    if (likeActionBtn) {
        likeActionBtn.addEventListener('click', function () {
            this.classList.toggle('liked');
            if (this.classList.contains('liked')) {
                this.setAttribute('fill', '#ff3040');
            } else {
                this.setAttribute('fill', 'none');
            }
        });
    }

    if (saveActionBtn) {
        saveActionBtn.addEventListener('click', function () {
            this.classList.toggle('saved');
            if (this.classList.contains('saved')) {
                this.setAttribute('fill', '#ffffff');
                showToast('Post saved to collection');
            } else {
                this.setAttribute('fill', 'none');
            }
        });
    }

    if (shareActionBtn) {
        shareActionBtn.addEventListener('click', function () {
            copyPostLink();
        });
    }

    /**
     * Options Action Sheet Logic
     */
    function initializeOptionsSheet() {
        function openOptions() {
            const timestamp = postIndexToTimestamp[currentPostIndex];
            const post = window.postData[timestamp];
            if (deletePostBtn) {
                // Show delete button only if it's a custom user-added post
                if (post && post.custom) {
                    deletePostBtn.style.display = 'block';
                } else {
                    deletePostBtn.style.display = 'none';
                }
            }
            if (postOptionsSheet) postOptionsSheet.style.display = 'flex';
        }

        function closeOptions() {
            if (postOptionsSheet) postOptionsSheet.style.display = 'none';
        }

        if (desktopPostOptionsBtn) desktopPostOptionsBtn.addEventListener('click', openOptions);
        if (mobileModalOptionsBtn) mobileModalOptionsBtn.addEventListener('click', openOptions);
        if (closeOptionsSheetBtn) closeOptionsSheetBtn.addEventListener('click', closeOptions);
        if (postOptionsSheet) {
            postOptionsSheet.addEventListener('click', (e) => {
                if (e.target === postOptionsSheet) closeOptions();
            });
        }

        // Delete post
        if (deletePostBtn) {
            deletePostBtn.addEventListener('click', async function () {
                const timestamp = postIndexToTimestamp[currentPostIndex];
                if (!timestamp) return;

                if (confirm('Delete this photo from your archive?')) {
                    closeOptions();
                    await PostStorage.remove(timestamp);
                    delete window.postData[timestamp];

                    // Remove item from grid
                    const gridItem = document.querySelector(`.grid-item[data-index="${currentPostIndex}"]`);
                    if (gridItem) gridItem.remove();

                    updatePostCountDisplay();
                    closeModal();
                    showToast('Post deleted from archive');
                }
            });
        }

        // Copy link
        if (copyPostLinkBtn) {
            copyPostLinkBtn.addEventListener('click', function () {
                closeOptions();
                copyPostLink();
            });
        }

        // Download media
        if (downloadMediaBtn) {
            downloadMediaBtn.addEventListener('click', function () {
                closeOptions();
                const timestamp = postIndexToTimestamp[currentPostIndex];
                const post = window.postData[timestamp];
                if (!post || !post.m) return;
                const activeMedia = post.m[currentSlideIndex] || post.m[0];
                if (activeMedia) {
                    const a = document.createElement('a');
                    a.href = activeMedia;
                    a.download = `instagram-photo-${timestamp}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    showToast('Downloading photo...');
                }
            });
        }
    }

    function copyPostLink() {
        const url = window.location.href;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                showToast('Link copied to clipboard');
            }).catch(() => {
                prompt('Copy post URL:', url);
            });
        } else {
            prompt('Copy post URL:', url);
        }
    }

    /**
     * Create Post / Add Photo Modal Logic
     */
    function initializeCreatePost() {
        function openCreateModal() {
            selectedFiles = [];
            editorActiveIndex = 0;
            if (createEditorZone) createEditorZone.style.display = 'none';
            if (createUploadZone) createUploadZone.style.display = 'flex';
            if (createShareBtn) createShareBtn.disabled = true;
            if (createCaptionInput) createCaptionInput.value = '';

            // Pre-fill local date
            if (createDateInput) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                createDateInput.value = now.toISOString().slice(0, 16);
            }

            if (createPostModal) createPostModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeCreateModal() {
            if (createPostModal) createPostModal.style.display = 'none';
            document.body.style.overflow = 'auto';
            selectedFiles = [];
            if (createFileInput) createFileInput.value = '';
            if (createCameraInput) createCameraInput.value = '';
            if (createAddMoreInput) createAddMoreInput.value = '';
        }

        if (openCreatePostBtn) openCreatePostBtn.addEventListener('click', openCreateModal);
        if (navCreateBtn) navCreateBtn.addEventListener('click', openCreateModal);
        if (createCancelBtn) createCancelBtn.addEventListener('click', closeCreateModal);
        if (createModalBackdrop) createModalBackdrop.addEventListener('click', closeCreateModal);

        // Quick tags insertion
        document.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                const tag = this.getAttribute('data-insert');
                if (createCaptionInput && tag) {
                    const cur = createCaptionInput.value.trim();
                    createCaptionInput.value = cur ? `${cur} ${tag}` : tag;
                    createCaptionInput.focus();
                }
            });
        });

        // Set Date Now button
        if (setDateNowBtn && createDateInput) {
            setDateNowBtn.addEventListener('click', function () {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                createDateInput.value = now.toISOString().slice(0, 16);
            });
        }

        // File selection handlers
        async function handleFiles(files) {
            if (!files || files.length === 0) return;

            showToast('Processing media...');
            const fileArray = Array.from(files);

            for (const file of fileArray) {
                const optimized = await optimizeImageFile(file);
                selectedFiles.push(optimized);
            }

            if (selectedFiles.length > 0) {
                if (createUploadZone) createUploadZone.style.display = 'none';
                if (createEditorZone) createEditorZone.style.display = 'flex';
                if (createShareBtn) createShareBtn.disabled = false;
                renderEditorPreview();
            }
        }

        if (createFileInput) {
            createFileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        }
        if (createCameraInput) {
            createCameraInput.addEventListener('change', (e) => handleFiles(e.target.files));
        }
        if (createAddMoreInput) {
            createAddMoreInput.addEventListener('change', (e) => handleFiles(e.target.files));
        }

        // Drag and drop support on upload zone
        if (createUploadZone) {
            ['dragenter', 'dragover'].forEach(name => {
                createUploadZone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createUploadZone.classList.add('dragover');
                });
            });
            ['dragleave', 'drop'].forEach(name => {
                createUploadZone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createUploadZone.classList.remove('dragover');
                });
            });
            createUploadZone.addEventListener('drop', (e) => {
                if (e.dataTransfer && e.dataTransfer.files) {
                    handleFiles(e.dataTransfer.files);
                }
            });
        }

        // Render slide preview and thumbnails strip in editor
        function renderEditorPreview() {
            if (!editorMediaViewport || selectedFiles.length === 0) return;

            if (editorActiveIndex >= selectedFiles.length) {
                editorActiveIndex = selectedFiles.length - 1;
            }

            const current = selectedFiles[editorActiveIndex];
            editorMediaViewport.innerHTML = '';
            if (current.isVideo) {
                const v = document.createElement('video');
                v.src = current.dataUrl;
                v.controls = true;
                v.autoplay = true;
                v.loop = true;
                editorMediaViewport.appendChild(v);
            } else {
                const img = document.createElement('img');
                img.src = current.dataUrl;
                editorMediaViewport.appendChild(img);
            }

            // Slide navigation arrows and indicators
            if (editorSlideNav && editorIndicators) {
                if (selectedFiles.length > 1) {
                    editorSlideNav.style.display = 'flex';
                    editorIndicators.innerHTML = '';
                    selectedFiles.forEach((_, idx) => {
                        const dot = document.createElement('div');
                        dot.className = `editor-dot ${idx === editorActiveIndex ? 'active' : ''}`;
                        editorIndicators.appendChild(dot);
                    });
                } else {
                    editorSlideNav.style.display = 'none';
                }
            }

            // Thumbnails strip
            if (editorThumbsStrip) {
                editorThumbsStrip.innerHTML = '';
                selectedFiles.forEach((item, idx) => {
                    const thumb = document.createElement('div');
                    thumb.className = `editor-thumb-item ${idx === editorActiveIndex ? 'active' : ''}`;
                    thumb.innerHTML = `
                      <img src="${item.thumbUrl || item.dataUrl}" alt="Thumb">
                      <button type="button" class="editor-thumb-remove" data-index="${idx}" title="Remove photo">✕</button>
                    `;

                    thumb.addEventListener('click', (e) => {
                        if (e.target.classList.contains('editor-thumb-remove')) return;
                        editorActiveIndex = idx;
                        renderEditorPreview();
                    });

                    const removeBtn = thumb.querySelector('.editor-thumb-remove');
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectedFiles.splice(idx, 1);
                        if (selectedFiles.length === 0) {
                            if (createEditorZone) createEditorZone.style.display = 'none';
                            if (createUploadZone) createUploadZone.style.display = 'flex';
                            if (createShareBtn) createShareBtn.disabled = true;
                        } else {
                            renderEditorPreview();
                        }
                    });

                    editorThumbsStrip.appendChild(thumb);
                });
            }
        }

        if (editorPrevBtn) {
            editorPrevBtn.addEventListener('click', () => {
                editorActiveIndex = (editorActiveIndex - 1 + selectedFiles.length) % selectedFiles.length;
                renderEditorPreview();
            });
        }
        if (editorNextBtn) {
            editorNextBtn.addEventListener('click', () => {
                editorActiveIndex = (editorActiveIndex + 1) % selectedFiles.length;
                renderEditorPreview();
            });
        }

        // Share / Post submit
        if (createShareBtn) {
            createShareBtn.addEventListener('click', async function () {
                if (selectedFiles.length === 0) return;

                this.disabled = true;
                this.textContent = 'Posting...';

                try {
                    // Generate timestamp
                    let postDateObj = new Date();
                    if (createDateInput && createDateInput.value) {
                        postDateObj = new Date(createDateInput.value);
                    }
                    const timestamp = Math.floor(postDateObj.getTime() / 1000);
                    const formattedDate = formatInstagramDate(postDateObj);
                    const caption = (createCaptionInput ? createCaptionInput.value : '').trim();

                    // Generate safe unique index
                    const existingIndices = Object.values(window.postData).map(p => Number(p.i) || 0);
                    const nextIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 1;

                    const newPost = {
                        i: nextIndex,
                        m: selectedFiles.map(f => f.dataUrl),
                        t: timestamp,
                        d: formattedDate,
                        tt: caption,
                        im: '',
                        l: '0',
                        c: '0',
                        custom: true,
                        thumb: selectedFiles[0].thumbUrl || selectedFiles[0].dataUrl
                    };

                    // Save to IndexedDB
                    await PostStorage.save(newPost);

                    // Update memory postData & index mapping
                    const timestampStr = String(timestamp);
                    window.postData[timestampStr] = newPost;
                    postIndexToTimestamp[nextIndex] = timestampStr;

                    // Insert into DOM grid at the top
                    insertGridItem(newPost, true);
                    updatePostCountDisplay();

                    closeCreateModal();
                    showToast('Photo added to your archive!');

                    // Open the newly created post
                    setTimeout(() => {
                        openModal(nextIndex);
                    }, 400);

                } catch (err) {
                    console.error('Error creating post:', err);
                    alert('Could not save post: ' + err.message);
                } finally {
                    this.textContent = 'Share';
                    this.disabled = false;
                }
            });
        }
    }

    /**
     * Bottom Navigation Bar interactions
     */
    function initializeBottomNav() {
        if (navHomeBtn) {
            navHomeBtn.addEventListener('click', function (e) {
                if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/')) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        if (navFilterBtn) {
            navFilterBtn.addEventListener('click', function () {
                const sortContainer = document.getElementById('sortOptionsContainer');
                if (sortContainer) {
                    sortContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight briefly
                    sortContainer.style.transition = 'transform 0.2s';
                    sortContainer.style.transform = 'scale(1.02)';
                    setTimeout(() => { sortContainer.style.transform = 'scale(1)'; }, 300);
                }
            });
        }

        if (navProfileBtn) {
            navProfileBtn.addEventListener('click', function (e) {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    }
});

/**
 * Fixes common Unicode encoding issues in text
 */
function fixEncodingIssues(text) {
    if (!text) return text;
    const replacements = [
        { pattern: /â\u0080\u0099/g, replacement: "\u2019" },
        { pattern: /â\u0080\u009c/g, replacement: "\u201C" },
        { pattern: /â\u0080\u009d/g, replacement: "\u201D" },
        { pattern: /â\u0080\u0098/g, replacement: "\u2018" },
        { pattern: /â\u0080\u0093/g, replacement: "\u2013" },
        { pattern: /â\u0080\u0094/g, replacement: "\u2014" },
        { pattern: /â\u0080¦/g, replacement: "\u2026" },
        { pattern: /Â/g, replacement: "" },
        { pattern: /Â½/g, replacement: "\u00BD" },
        { pattern: /â€¢/g, replacement: "•" },
        { pattern: /Ã©/g, replacement: "é" },
        { pattern: /Ã¨/g, replacement: "è" },
        { pattern: /Ã¢/g, replacement: "â" },
        { pattern: /Ãª/g, replacement: "ê" },
        { pattern: /Ã«/g, replacement: "ë" },
        { pattern: /Ã®/g, replacement: "î" },
        { pattern: /Ã¯/g, replacement: "ï" },
        { pattern: /Ã´/g, replacement: "ô" },
        { pattern: /Ã¶/g, replacement: "ö" },
        { pattern: /Ã¹/g, replacement: "ù" },
        { pattern: /Ãº/g, replacement: "ú" },
        { pattern: /Ã¼/g, replacement: "ü" },
        { pattern: /Ã§/g, replacement: "ç" }
    ];

    let fixedText = text;
    for (const { pattern, replacement } of replacements) {
        fixedText = fixedText.replace(pattern, replacement);
    }
    return fixedText;
}

document.addEventListener('DOMContentLoaded', function () {
    for (const timestamp in window.postData) {
        const post = window.postData[timestamp];
        if (post && post.tt) {
            post.tt = fixEncodingIssues(post.tt);
        }
    }
    const captions = document.querySelectorAll('.post-caption');
    captions.forEach(caption => {
        caption.textContent = fixEncodingIssues(caption.textContent);
    });
});
