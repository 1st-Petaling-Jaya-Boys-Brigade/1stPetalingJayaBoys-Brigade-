/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Photo & Video Gallery and Instagram-Style Story Highlights Module (TSK-010 & TSK-033)
 *
 * Implements dedicated gallery tab, photo/video grid with format filtering,
 * image/video lightbox viewer, Instagram-style story highlights reel,
 * video & audio playback with auto-advancing segmented progress bars,
 * Google Drive / YouTube URL normalization, and Supabase Storage uploads.
 */

// ── State ──────────────────────────────────────────────────────────────────
var galleryImages = [];
var _currentGalleryFilter = 'all'; // 'all' | 'photos' | 'videos'

// ── Media Helpers & Link Normalization ─────────────────────────────────────
/**
 * Normalizes media URLs for Google Drive, YouTube, and Vimeo
 * Converts Google Drive sharing links into embeddable / streaming links
 * @param {string} rawUrl
 * @param {string} [preferType] - 'image' or 'video'
 * @returns {string} Normalized URL
 */
function normalizeMediaUrl(rawUrl, preferType) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  var url = rawUrl.trim();

  // 1. Google Drive Links
  var driveMatch = url.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|docs\.google\.com\/file\/d\/)([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    var fileId = driveMatch[1];
    if (preferType === 'image') {
      return 'https://lh3.googleusercontent.com/d/' + fileId;
    }
    // Default or video: return embeddable preview stream
    return 'https://drive.google.com/file/d/' + fileId + '/preview';
  }

  // 2. YouTube Links
  var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
  if (ytMatch && ytMatch[1]) {
    return 'https://www.youtube-nocookie.com/embed/' + ytMatch[1] + '?autoplay=1&enablejsapi=1&rel=0&playsinline=1';
  }

  // 3. Vimeo Links
  var vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return 'https://player.vimeo.com/video/' + vimeoMatch[1] + '?autoplay=1';
  }

  return url;
}

/**
 * Detects whether a URL or media item is a video format
 * Supports MP4, WebM, MOV, M4V, OGG, MKV, Google Drive preview, and YouTube
 * @param {string} url
 * @param {string} [type]
 * @returns {boolean}
 */
function isVideoMedia(url, type) {
  if (type === 'video') return true;
  if (type === 'image') return false;
  if (!url || typeof url !== 'string') return false;
  var clean = url.split('?')[0].toLowerCase();
  var videoExts = ['.mp4', '.webm', '.mov', '.m4v', '.ogg', '.ogv', '.mkv'];
  for (var i = 0; i < videoExts.length; i++) {
    if (clean.endsWith(videoExts[i])) return true;
  }
  if (url.indexOf('drive.google.com/file/d/') !== -1 && url.indexOf('/preview') !== -1) return true;
  if (url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1 || url.indexOf('vimeo.com') !== -1) return true;
  return false;
}

/**
 * Uploads a single media file (photo or video) to Supabase Storage
 * @param {File} file
 * @returns {Promise<{url: string, type: string, filename: string}|null>}
 */
async function uploadSingleMediaFile(file) {
  if (!file) return null;
  var rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  var isVid = (file.type && file.type.startsWith('video/')) || ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', 'mkv'].indexOf(rawExt) !== -1;
  var defaultExt = isVid ? 'mp4' : 'jpg';
  var ext = rawExt || defaultExt;
  var rand = Math.random().toString(36).substring(2, 7);
  var prefix = isVid ? 'video_' : 'photo_';
  var fname = prefix + Date.now() + '_' + rand + '.' + ext;
  var defaultMime = isVid ? 'video/mp4' : 'image/jpeg';
  var mime = file.type || defaultMime;

  var blob = new Blob([await file.arrayBuffer()], { type: mime });

  var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
  if (client && typeof client.uploadFile === 'function') {
    await client.uploadFile('gallery', fname, blob);
    var url = client.fileUrl('gallery', fname);

    // Advisory notification if file is large (>25MB)
    if (file.size > 25 * 1024 * 1024 && typeof showToast === 'function') {
      showToast('Uploaded large media file (' + Math.round(file.size / (1024 * 1024)) + 'MB). Tip: For large videos, Google Drive links are recommended to preserve storage.', 'info');
    }

    return {
      url: url,
      type: isVid ? 'video' : 'image',
      filename: fname
    };
  }
  return null;
}

// ── Data Fetching ──────────────────────────────────────────────────────────
/**
 * Loads all gallery images and videos from Supabase ordered by creation date ascending
 */
async function loadGallery() {
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client && client.req) {
      var rows = null;
      try {
        rows = await client.req('GET', 'bb_gallery?order=created_at.asc&select=id,url');
      } catch (errGet) {
        rows = await client.req('GET', 'bb_gallery?order=created_at.asc&select=*');
      }
      galleryImages.length = 0;
      if (rows && rows.length) {
        rows.forEach(function(r) {
          var detectedType = r.type || (isVideoMedia(r.url) ? 'video' : 'image');
          galleryImages.push({ id: r.id, url: r.url, type: detectedType });
        });
      }
    }
  } catch (e) {
    console.warn('loadGallery error:', e);
  }

  if (typeof window !== 'undefined') {
    window.galleryImages = galleryImages;
  }
  renderGallery();
}

/**
 * Filters gallery media by type ('all', 'photos', 'videos')
 * @param {string} filter
 * @param {HTMLElement} [btn]
 */
function filterGallery(filter, btn) {
  _currentGalleryFilter = filter || 'all';
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.gallery-filter-pill').forEach(function(p) {
      p.classList.remove('active');
    });
    if (btn) {
      if (btn.classList && typeof btn.classList.add === 'function') btn.classList.add('active');
    } else {
      var target = document.getElementById('gallery-filter-' + _currentGalleryFilter);
      if (target && target.classList && typeof target.classList.add === 'function') target.classList.add('active');
    }
  }
  renderGallery();
}

// ── Public & Admin Rendering ───────────────────────────────────────────────
/**
 * Renders gallery grids on the dedicated Gallery page, Home page teaser, and Admin Console
 */
function renderGallery() {
  if (typeof document === 'undefined') return;

  var grid          = document.getElementById('gallery-grid');
  var homeGrid      = document.getElementById('home-gallery-grid');
  var adminGrid     = document.getElementById('admin-gallery-grid');
  var noPhotos      = document.getElementById('no-photos');
  var noPhotosHome  = document.getElementById('no-photos-home');
  var countBadge    = document.getElementById('gallery-media-count-badge');

  renderStoryHighlightsReel();
  renderAdminStoryHighlights();

  // Filter items
  var filtered = galleryImages.filter(function(item) {
    if (_currentGalleryFilter === 'photos') return !isVideoMedia(item.url, item.type);
    if (_currentGalleryFilter === 'videos') return isVideoMedia(item.url, item.type);
    return true;
  });

  if (countBadge) {
    var filterLabel = _currentGalleryFilter === 'photos' ? 'Photos' : (_currentGalleryFilter === 'videos' ? 'Videos' : 'All Media');
    countBadge.textContent = filtered.length + ' ' + filterLabel;
  }

  if (!galleryImages.length) {
    if (grid)         grid.innerHTML = '';
    if (homeGrid)     homeGrid.innerHTML = '';
    if (adminGrid)    adminGrid.innerHTML = '';
    if (noPhotos)     noPhotos.style.display = 'block';
    if (noPhotosHome) noPhotosHome.style.display = 'block';
    return;
  }

  if (noPhotos)     noPhotos.style.display = filtered.length ? 'none' : 'block';
  if (noPhotosHome) noPhotosHome.style.display = 'none';

  var pubHtml = '';
  var homeHtml = '';
  var admHtml = '';

  filtered.forEach(function(item, i) {
    var rawUrl = (typeof item === 'string') ? item : (item.url || '');
    var id     = (typeof item === 'object' && item && item.id) ? item.id : '';
    var isVid  = isVideoMedia(rawUrl, item.type);

    var validatedUrl = (typeof safeUrl === 'function') ? safeUrl(rawUrl, '') : rawUrl;
    var safeUrlStr   = (typeof escapeHtml === 'function') ? escapeHtml(validatedUrl) : validatedUrl;

    var videoBadgeHtml = isVid
      ? '<span class="gallery-video-badge"><svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px;"><polygon points="5 3 19 12 5 21 5 3"/></svg> Video</span>'
      : '';

    // Public grid item with clickable lightbox preview
    pubHtml += '<div class="gallery-img-wrap" data-lightbox-idx="' + i + '" style="cursor:pointer;" title="Click to view ' + (isVid ? 'video' : 'photo') + '">'
      + videoBadgeHtml
      + '<img src="' + safeUrlStr + '" alt="Media ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'" />'
      + '</div>';

    // Home teaser: limit to first 6 items
    if (i < 6) {
      homeHtml += '<div class="gallery-img-wrap" data-home-idx="' + i + '" style="cursor:pointer;" title="Click to preview">'
        + videoBadgeHtml
        + '<img src="' + safeUrlStr + '" alt="Media ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'" />'
        + '</div>';
    }

    // Admin grid item with delete button
    admHtml += '<div class="gallery-img-wrap">'
      + videoBadgeHtml
      + '<img src="' + safeUrlStr + '" alt="Media ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'" />'
      + '<button type="button" class="del-btn" data-gi="' + i + '" data-gid="' + id + '" title="Delete Media" aria-label="Delete Media">&times;</button>'
      + '</div>';
  });

  if (grid) {
    grid.innerHTML = pubHtml;
    grid.querySelectorAll('[data-lightbox-idx]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-lightbox-idx'), 10);
        openGalleryLightbox(idx);
      });
    });
  }

  if (homeGrid) {
    homeGrid.innerHTML = homeHtml;
    homeGrid.querySelectorAll('[data-home-idx]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-home-idx'), 10);
        openGalleryLightbox(idx);
      });
    });
  }

  if (adminGrid) {
    adminGrid.innerHTML = admHtml;
    adminGrid.querySelectorAll('[data-gi]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-gi'), 10);
        var rowId = btn.getAttribute('data-gid');
        deleteGalleryImage(idx, rowId);
      });
    });
  }
}

// ── Lightbox Preview ───────────────────────────────────────────────────────
/**
 * Opens a responsive full-screen lightbox modal for a selected photo or video
 * @param {number} idx - Index in filtered/galleryImages
 */
function openGalleryLightbox(idx) {
  if (typeof document === 'undefined') return;
  var filtered = galleryImages.filter(function(item) {
    if (_currentGalleryFilter === 'photos') return !isVideoMedia(item.url, item.type);
    if (_currentGalleryFilter === 'videos') return isVideoMedia(item.url, item.type);
    return true;
  });
  var item = filtered[idx] || galleryImages[idx];
  if (!item) return;

  var rawUrl = (typeof item === 'string') ? item : item.url;
  if (!rawUrl) return;

  var normUrl = normalizeMediaUrl(rawUrl, item.type);
  var isVid = isVideoMedia(normUrl, item.type);

  var validatedUrl = (typeof safeUrl === 'function') ? safeUrl(normUrl, '') : normUrl;
  var safeUrlStr   = (typeof escapeHtml === 'function') ? escapeHtml(validatedUrl) : validatedUrl;

  // Remove existing lightbox if present
  var existing = document.getElementById('gallery-lightbox-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'gallery-lightbox-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,18,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;backdrop-filter:blur(6px);animation:fadeIn 0.2s ease;';

  var mediaContentHtml = '';
  if (isVid) {
    if (safeUrlStr.indexOf('/preview') !== -1 || safeUrlStr.indexOf('youtube') !== -1 || safeUrlStr.indexOf('vimeo') !== -1) {
      // Embedded player (Google Drive Preview, YouTube, Vimeo)
      mediaContentHtml = '<iframe src="' + safeUrlStr + '" style="width:88vw;max-width:960px;height:72vh;border:none;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.7);background:#000;" allow="autoplay; fullscreen; encrypted-media"></iframe>';
    } else {
      // Direct HTML5 Video (MP4, WebM, MOV)
      mediaContentHtml = '<video src="' + safeUrlStr + '" controls autoplay playsinline style="max-width:92vw;max-height:86vh;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.12);background:#000;"></video>';
    }
  } else {
    // Photo
    mediaContentHtml = '<img src="' + safeUrlStr + '" alt="Photo preview" style="max-width:100%;max-height:86vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);" />';
  }

  modal.innerHTML = '<div style="position:relative;max-width:94vw;max-height:92vh;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation();">'
    + mediaContentHtml
    + '<button type="button" aria-label="Close Preview" style="position:absolute;top:-14px;right:-14px;background:var(--accent,#c8961e);color:#0a0c10;border:2px solid #fff;border-radius:50%;width:34px;height:34px;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);line-height:1;">&times;</button>'
    + '</div>';

  function closeModal() {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    document.removeEventListener('keydown', handleKey);
  }

  function handleKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  modal.addEventListener('click', closeModal);
  modal.querySelector('button').addEventListener('click', closeModal);
  document.addEventListener('keydown', handleKey);

  document.body.appendChild(modal);
}

// ── Upload Operations ──────────────────────────────────────────────────────
/**
 * Shared file uploader for gallery photos and videos (file input and drag-and-drop)
 * @param {FileList|File[]} files
 */
async function uploadGalleryFiles(files) {
  if (!files || !files.length) return;
  var validExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'heic', 'mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', 'mkv'];

  var validFiles = Array.from(files).filter(function(f) {
    if (!f) return false;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var isMimeValid = (f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')));
    return isMimeValid || validExts.indexOf(ext) !== -1;
  });

  if (!validFiles.length) {
    if (typeof showToast === 'function') {
      showToast('Please select valid image or video files (JPG, PNG, WebP, MP4, MOV, WebM).', 'warning');
    }
    return;
  }

  var dropZone = (typeof document !== 'undefined') ? document.getElementById('gallery-drop') : null;
  if (dropZone) dropZone.style.opacity = '0.5';

  var successCount = 0;
  var failCount = 0;
  var lastUploadError = '';

  for (var fi = 0; fi < validFiles.length; fi++) {
    var file = validFiles[fi];
    try {
      var res = await uploadSingleMediaFile(file);
      if (res && res.url) {
        var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
        var row = null;
        if (client && client.post) {
          try {
            row = await client.post('bb_gallery', {
              url: res.url,
              type: res.type,
              created_at: new Date().toISOString()
            });
          } catch (errPostType) {
            row = await client.post('bb_gallery', {
              url: res.url,
              created_at: new Date().toISOString()
            });
          }
        }
        var id = (row && row[0] && row[0].id) ? row[0].id : null;
        galleryImages.push({ id: id, url: res.url, type: res.type });
        successCount++;
      }
    } catch (e) {
      console.error('Gallery upload error for file ' + file.name + ':', e);
      lastUploadError = e.message || 'Storage error';
      failCount++;
    }
  }

  if (dropZone) dropZone.style.opacity = '1';

  renderGallery();

  if (typeof showToast === 'function') {
    if (successCount > 0 && failCount === 0) {
      showToast('Uploaded ' + successCount + ' media file' + (successCount > 1 ? 's' : '') + ' successfully!', 'success');
    } else if (successCount > 0 && failCount > 0) {
      showToast('Uploaded ' + successCount + ' file' + (successCount > 1 ? 's' : '') + ' (' + failCount + ' failed).', 'warning');
    } else if (failCount > 0) {
      showToast('Upload failed: ' + (lastUploadError || 'Please check storage bucket permissions.'), 'error');
    }
  }
}

/**
 * Handles file selection from the admin file input element
 * @param {HTMLInputElement} input
 */
async function handleGalleryUpload(input) {
  if (!input || !input.files || !input.files.length) return;
  var files = Array.from(input.files);
  await uploadGalleryFiles(files);
  input.value = ''; // Reset input to allow selecting identical file name again
}

// ── Delete Operations ──────────────────────────────────────────────────────
/**
 * Deletes a gallery media item from Supabase database and storage bucket
 * @param {number} idx - Index in galleryImages
 * @param {string} rowId - Database row ID in bb_gallery
 */
async function deleteGalleryImage(idx, rowId) {
  var item = galleryImages[idx];
  if (!item) return;

  var confirmed = false;
  var confirmMsg = 'Are you sure you want to delete this media item from the gallery?';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(confirmMsg, 'Delete Media');
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  var url = item ? (typeof item === 'string' ? item : item.url) : null;

  // Optimistic UI update
  galleryImages.splice(idx, 1);
  renderGallery();

  // Background deletion from Supabase
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client) {
      if (rowId && client.delete) {
        await client.delete('bb_gallery?id=eq.' + rowId);
      }
      if (url && client.deleteFile) {
        var fname = url.split('/').pop();
        if (fname) {
          await client.deleteFile('gallery', fname);
        }
      }
    }
    if (typeof showToast === 'function') {
      showToast('Media deleted successfully.', 'success');
    }
  } catch (e) {
    console.error('deleteGalleryImage error:', e);
    if (typeof showToast === 'function') {
      showToast('Failed to delete media from storage.', 'error');
    }
  }
}

// ── Drag & Drop Initialization ─────────────────────────────────────────────
/**
 * Initializes drag-and-drop file upload listeners on the admin drop zone
 */
function initGalleryDropZone() {
  if (typeof document === 'undefined') return;
  var drop = document.getElementById('gallery-drop');
  if (!drop || drop._dropZoneInitialized) return;

  drop._dropZoneInitialized = true;

  drop.addEventListener('dragover', function(e) {
    e.preventDefault();
    drop.classList.add('dragover');
  });

  drop.addEventListener('dragleave', function() {
    drop.classList.remove('dragover');
  });

  drop.addEventListener('drop', function(e) {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) {
      uploadGalleryFiles(e.dataTransfer.files);
    }
  });
}

// Auto-initialize dropzone on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGalleryDropZone);
  } else {
    initGalleryDropZone();
  }
}


// ── Authentic Story Highlights Dataset (TSK-033) ───────────────────────────
var DEFAULT_STORY_HIGHLIGHTS = [
  {
    id: 'story-camps',
    title: 'Camps',
    cover: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=200&h=200&fit=crop&q=80',
    order: 1,
    active: true,
    items: [
      {
        id: 'c1',
        url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Night Campfire & Company Fellowship at Annual Boot Camp',
        date: '15 Jun 2026',
        location: 'Outback Camp Ground'
      },
      {
        id: 'c2',
        url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Pioneering Challenge: Constructing the watchtower bridge',
        date: '16 Jun 2026',
        location: 'Camp Pioneering Site'
      },
      {
        id: 'c3',
        url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Sunrise Morning Devotion & Squad Inspection',
        date: '17 Jun 2026',
        location: 'Base Camp Parade Ground'
      }
    ]
  },
  {
    id: 'story-awards',
    title: 'Awards Day',
    cover: 'https://images.unsplash.com/photo-1578269174936-2709b6aeb913?w=200&h=200&fit=crop&q=80',
    order: 2,
    active: true,
    items: [
      {
        id: 'a1',
        url: 'https://images.unsplash.com/photo-1578269174936-2709b6aeb913?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Presentation of the prestigious Founder’s and President’s Badges',
        date: '28 Jun 2026',
        location: 'Sanctuary, TMC PJ'
      },
      {
        id: 'a2',
        url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Annual Company Guard of Honour & Inspection Parade',
        date: '28 Jun 2026',
        location: 'Church Courtyard'
      },
      {
        id: 'a3',
        url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Best Squad and Platoon of the Year Celebration',
        date: '28 Jun 2026',
        location: 'Fellowship Hall'
      }
    ]
  },
  {
    id: 'story-band',
    title: 'Brass Band',
    cover: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=200&h=200&fit=crop&q=80',
    order: 3,
    active: true,
    items: [
      {
        id: 'b1',
        url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Brass Band Sectionals: Saturdays 9:30 AM – 11:30 AM Rehearsal',
        date: '11 Jul 2026',
        location: 'Music Room'
      },
      {
        id: 'b2',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        type: 'video',
        caption: 'Brass Band Sectionals: Fanfare and Percussion Showcase',
        date: '18 Jul 2026',
        location: 'Music Room'
      }
    ]
  },
  {
    id: 'story-drill',
    title: 'Drill',
    cover: 'https://images.unsplash.com/photo-1526478806334-5fd488fcaabc?w=200&h=200&fit=crop&q=80',
    order: 4,
    active: true,
    items: [
      {
        id: 'd1',
        url: 'https://images.unsplash.com/photo-1526478806334-5fd488fcaabc?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Ceremonial Squad Drill & Colour Party Rehearsal',
        date: '08 Aug 2026',
        location: 'Parade Ground'
      },
      {
        id: 'd2',
        url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Junior Section Drill Syllabus & Teamwork Basics',
        date: '15 Aug 2026',
        location: 'Sports Court'
      }
    ]
  },
  {
    id: 'story-enrolment',
    title: 'Enrolment',
    cover: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=200&h=200&fit=crop&q=80',
    order: 5,
    active: true,
    items: [
      {
        id: 'e1',
        url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&h=1200&fit=crop&q=85',
        type: 'image',
        caption: 'Annual Enrolment Service: Dedication of Recruits and Officers',
        date: '28 Jun 2026',
        location: 'Trinity Methodist Church PJ'
      }
    ]
  }
];

// Story highlights runtime state
var storyHighlights = JSON.parse(JSON.stringify(DEFAULT_STORY_HIGHLIGHTS));
var _currentStoryHighlightIdx = -1;
var _currentStorySlideIdx = 0;
var _storyTimer = null;
var _storySlideStartTime = 0;
var _storySlideDuration = 5000;
var _storyRemainingTime = 5000;
var _isStoryPaused = false;
var _storyKeyHandlerAttached = false;
var _storyHoldAttached = false;

/**
 * Loads Story Highlights from Supabase (bb_stories or bb_config) with fallback to default set
 */
async function loadStoryHighlights() {
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client && typeof client.get === 'function') {
      // 1. Check universal bb_config store first (prevents 404 when bb_stories table is not yet migrated)
      try {
        var cfgRows = await client.get('bb_config?key=eq.bb_story_highlights&select=value');
        if (cfgRows && cfgRows.length && cfgRows[0].value) {
          storyHighlights = typeof cfgRows[0].value === 'string' ? JSON.parse(cfgRows[0].value) : cfgRows[0].value;
        }
      } catch (errCfg) {}

      // 2. If bb_config has no highlights, query bb_stories table if present
      if (!storyHighlights || !storyHighlights.length) {
        try {
          var rows = await client.get('bb_stories?order=display_order.asc,created_at.asc');
          if (rows && rows.length) {
            storyHighlights = rows.map(function(r) {
              var items = Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? JSON.parse(r.items || '[]') : []);
              return {
                id: r.id,
                title: r.title,
                cover: r.cover || (items[0] ? items[0].url : 'assets/logo.png'),
                order: r.display_order || 0,
                active: r.active !== false,
                items: items
              };
            });
          }
        } catch (errDb) {}
      }
    }
  } catch (e) {
    console.warn('loadStoryHighlights error:', e);
  }

  if (!storyHighlights || !storyHighlights.length) {
    storyHighlights = JSON.parse(JSON.stringify(DEFAULT_STORY_HIGHLIGHTS));
  }

  if (typeof window !== 'undefined') {
    window.storyHighlights = storyHighlights;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.storyHighlights = storyHighlights;
  }

  renderStoryHighlightsReel();
  renderAdminStoryHighlights();
  return storyHighlights;
}

/**
 * Persists Story Highlights to both bb_stories and bb_config
 */
async function saveStoryHighlights(newList) {
  if (Array.isArray(newList)) {
    storyHighlights = newList;
  }
  if (typeof window !== 'undefined') {
    window.storyHighlights = storyHighlights;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.storyHighlights = storyHighlights;
  }
  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client) {
      if (typeof client.upsert === 'function') {
        try {
          await client.upsert('bb_config', {
            key: 'bb_story_highlights',
            value: JSON.stringify(storyHighlights)
          }, 'key');
        } catch (e1) {}
      }
      if (typeof client.post === 'function') {
        try {
          for (var i = 0; i < storyHighlights.length; i++) {
            var sh = storyHighlights[i];
            await client.upsert('bb_stories', {
              id: sh.id,
              title: sh.title,
              cover: sh.cover,
              items: JSON.stringify(sh.items || []),
              display_order: sh.order || (i + 1),
              active: sh.active !== false
            }, 'id');
          }
        } catch (e2) {}
      }
    }
  } catch (e) {
    console.warn('saveStoryHighlights error:', e);
  }

  renderStoryHighlightsReel();
  renderAdminStoryHighlights();
  return true;
}

/**
 * Renders the circular Instagram-style Story Highlights Reel across all story containers
 */
function renderStoryHighlightsReel() {
  if (typeof document === 'undefined') return;
  var containers = document.querySelectorAll('.story-highlights-reel, #story-highlights-reel, #gallery-story-highlights-reel');
  if (!containers || !containers.length) return;

  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });

  containers.forEach(function(container) {
    if (!activeHighlights.length) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    var html = '';

    activeHighlights.forEach(function(sh, idx) {
      var coverUrl = sh.cover || (sh.items && sh.items[0] ? sh.items[0].url : 'assets/logo.png');
      var safeCover = (typeof safeUrl === 'function') ? safeUrl(coverUrl, 'assets/logo.png') : coverUrl;
      var title = (typeof escapeHtml === 'function') ? escapeHtml(sh.title) : sh.title;

      html += '<button type="button" class="story-highlight-item" data-sh-idx="' + idx + '" title="Watch ' + title + ' Highlight" aria-label="Watch ' + title + ' Highlight">'
        + '<div class="story-highlight-ring">'
          + '<div class="story-highlight-avatar">'
            + '<img src="' + safeCover + '" alt="' + title + '" loading="lazy" onerror="this.src=\'assets/logo.png\'" />'
          + '</div>'
        + '</div>'
        + '<span class="story-highlight-label">' + title + '</span>'
      + '</button>';
    });

    container.innerHTML = html;

    // Attach click listeners to launch story viewer
    container.querySelectorAll('[data-sh-idx]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-sh-idx'), 10);
        openStoryViewer(idx, 0);
      });
    });
  });
}

// Auto-initialize reel immediately from default highlights if DOM is available
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      renderStoryHighlightsReel();
      renderAdminStoryHighlights();
    });
  } else {
    setTimeout(function() {
      renderStoryHighlightsReel();
      renderAdminStoryHighlights();
    }, 0);
  }
}

/**
 * Opens the Fullscreen Story Viewer Modal for a specific highlight and slide
 */
function openStoryViewer(highlightIdx, slideIdx) {
  if (typeof document === 'undefined') return;
  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });
  if (!activeHighlights.length) return;

  var hIdx = Math.max(0, Math.min(highlightIdx, activeHighlights.length - 1));
  _currentStoryHighlightIdx = hIdx;
  _currentStorySlideIdx = slideIdx || 0;

  var modal = document.getElementById('story-viewer-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  attachStoryHoldListeners();
  attachStoryKeyListeners();

  updateStorySlideView();
}

/**
 * Updates progress bars, media (photo or video), header metadata, and caption for the active slide
 */
/**
 * Applies CSS linear transition animation to the active highlight progress bar
 * @param {number} durationMs - Total duration for the bar to fill
 * @param {number} [remainingMs] - Remaining time if resuming from pause
 */
function applyStoryProgressAnimation(durationMs, remainingMs) {
  if (typeof document === 'undefined') return;
  var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
  if (!currentFill) return;
  var secs = ((remainingMs !== undefined && remainingMs !== null ? remainingMs : durationMs) / 1000);
  currentFill.style.transition = 'none';
  currentFill.style.width = '0%';
  if (typeof currentFill.offsetWidth !== 'undefined') {
    void currentFill.offsetWidth; // Force layout reflow
  }
  currentFill.style.transition = 'width ' + secs + 's linear';
  currentFill.style.width = '100%';
}

function updateStorySlideView() {
  if (typeof document === 'undefined') return;
  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });
  var curHighlight = activeHighlights[_currentStoryHighlightIdx];
  if (!curHighlight || !curHighlight.items || !curHighlight.items.length) {
    closeStoryViewer();
    return;
  }

  // Bounds check slide index
  if (_currentStorySlideIdx >= curHighlight.items.length) {
    _currentStorySlideIdx = curHighlight.items.length - 1;
  }
  if (_currentStorySlideIdx < 0) {
    _currentStorySlideIdx = 0;
  }

  var curSlide = curHighlight.items[_currentStorySlideIdx];
  var rawUrl = curSlide.url || '';
  var normUrl = normalizeMediaUrl(rawUrl, curSlide.type);
  var isVid = isVideoMedia(normUrl, curSlide.type);

  // Set duration based on admin configuration or media type
  var defaultSec = isVid ? 30 : 5;
  var slideDurationSec = (curSlide.duration && isFinite(curSlide.duration) && Number(curSlide.duration) > 0)
    ? Number(curSlide.duration)
    : defaultSec;
  _storySlideDuration = slideDurationSec * 1000;
  _storyRemainingTime = _storySlideDuration;

  // 1. Render Segmented Progress Bars
  var progressContainer = document.getElementById('story-progress-bars');
  if (progressContainer) {
    var pBarsHtml = '';
    for (var i = 0; i < curHighlight.items.length; i++) {
      var fillWidth = (i < _currentStorySlideIdx) ? '100%' : '0%';
      pBarsHtml += '<div class="story-progress-bar">'
        + '<div class="story-progress-fill" id="story-fill-' + i + '" style="width:' + fillWidth + ';transition:none;"></div>'
      + '</div>';
    }
    progressContainer.innerHTML = pBarsHtml;
  }

  // 2. Header Meta
  var avatarEl = document.getElementById('story-viewer-avatar');
  var titleEl = document.getElementById('story-viewer-title');
  var dateEl = document.getElementById('story-viewer-date');
  var coverUrl = curHighlight.cover || (curHighlight.items[0] ? curHighlight.items[0].url : 'assets/logo.png');
  var safeCover = (typeof safeUrl === 'function') ? safeUrl(coverUrl, 'assets/logo.png') : coverUrl;

  if (avatarEl) avatarEl.src = safeCover;
  if (titleEl) titleEl.textContent = curHighlight.title;
  if (dateEl) dateEl.textContent = curSlide.date || '';

  // 3. Media Viewport (Photo vs HTML5 Video vs Embedded Player)
  var imgEl      = document.getElementById('story-viewer-img');
  var videoEl    = document.getElementById('story-viewer-video');
  var iframeEl   = document.getElementById('story-viewer-iframe');
  var soundBtn   = document.getElementById('story-btn-sound');

  var safeMediaUrl = (typeof safeUrl === 'function') ? safeUrl(normUrl, '') : normUrl;

  if (isVid) {
    if (safeMediaUrl.indexOf('/preview') !== -1 || safeMediaUrl.indexOf('youtube') !== -1 || safeMediaUrl.indexOf('vimeo') !== -1) {
      // Embedded player (Google Drive Preview, YouTube)
      var navZones = document.getElementById('story-nav-zones');
      if (navZones) navZones.style.pointerEvents = 'none'; // Unblock clicks so user can tap play & sound directly!

      if (imgEl) imgEl.style.display = 'none';
      if (videoEl) {
        videoEl.style.display = 'none';
        if (typeof videoEl.pause === 'function') videoEl.pause();
        videoEl.src = '';
      }
      if (soundBtn) soundBtn.style.display = 'none';
      if (iframeEl) {
        iframeEl.style.display = 'block';
        var autoplayUrl = safeMediaUrl;
        if (autoplayUrl.indexOf('autoplay=') === -1) {
          autoplayUrl += (autoplayUrl.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
        }
        iframeEl.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        if (iframeEl.src !== autoplayUrl) {
          iframeEl.src = autoplayUrl;
        }
      }
      // Linear progress bar based on configured video duration
      applyStoryProgressAnimation(_storySlideDuration, _storyRemainingTime);
      startStoryTimer(_storySlideDuration);
    } else {
      // Direct HTML5 Video (MP4, WebM, MOV)
      var navZonesVid = document.getElementById('story-nav-zones');
      if (navZonesVid) navZonesVid.style.pointerEvents = 'auto';
      if (imgEl) imgEl.style.display = 'none';
      if (iframeEl) {
        iframeEl.style.display = 'none';
        iframeEl.src = '';
      }
      if (soundBtn) soundBtn.style.display = 'flex';
      if (videoEl) {
        videoEl.style.display = 'block';
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        if (videoEl.src !== safeMediaUrl) {
          videoEl.src = safeMediaUrl;
        }
        videoEl.currentTime = 0;

        // Auto-adapt story timer to video duration when metadata is ready
        videoEl.onloadedmetadata = function() {
          if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
            if (!curSlide.duration || Number(curSlide.duration) === 30) {
              _storySlideDuration = Math.round(videoEl.duration * 1000);
              _storyRemainingTime = _storySlideDuration;
              startStoryTimer(_storySlideDuration);
            }
          }
        };

        // Frame-synchronized progress bar based on actual video playback
        videoEl.ontimeupdate = function() {
          if (videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
            var pct = Math.min(100, (videoEl.currentTime / videoEl.duration) * 100);
            var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
            if (currentFill) {
              currentFill.style.transition = 'none';
              currentFill.style.width = pct + '%';
            }
          }
        };

        // When video ends, advance to next slide
        videoEl.onended = function() {
          nextStorySlide();
        };

        // Attempt playback with fallback to muted if browser blocks sound
        var playPromise = (typeof videoEl.play === 'function') ? videoEl.play() : undefined;
        if (playPromise !== undefined) {
          playPromise.catch(function() {
            videoEl.muted = true;
            updateSoundIcon(true);
            if (typeof videoEl.play === 'function') videoEl.play().catch(function() {});
          });
        }
      }
      startStoryTimer(_storySlideDuration);
    }
  } else {
    // Standard Photo Slide
    var navZonesPhoto = document.getElementById('story-nav-zones');
    if (navZonesPhoto) navZonesPhoto.style.pointerEvents = 'auto';
    if (videoEl) {
      videoEl.style.display = 'none';
      if (typeof videoEl.pause === 'function') videoEl.pause();
      videoEl.src = '';
    }
    if (iframeEl) {
      iframeEl.style.display = 'none';
      iframeEl.src = '';
    }
    if (soundBtn) soundBtn.style.display = 'none';
    if (imgEl) {
      imgEl.style.display = 'block';
      imgEl.src = safeMediaUrl;
      imgEl.alt = curSlide.caption || curHighlight.title;
    }
    applyStoryProgressAnimation(_storySlideDuration, _storyRemainingTime);
    startStoryTimer(_storySlideDuration);
  }

  // Preload next slide if available
  if (_currentStorySlideIdx + 1 < curHighlight.items.length) {
    var nextSlide = curHighlight.items[_currentStorySlideIdx + 1];
    if (nextSlide && !isVideoMedia(nextSlide.url, nextSlide.type) && typeof Image !== 'undefined') {
      var preImg = new Image();
      preImg.src = (typeof safeUrl === 'function') ? safeUrl(nextSlide.url, '') : nextSlide.url;
    }
  }

  // 4. Caption & Location Pill
  var pillEl = document.getElementById('story-viewer-pill');
  var captionEl = document.getElementById('story-viewer-caption');

  if (pillEl) {
    var driveIdMatch = safeMediaUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    var driveFileId = driveIdMatch ? driveIdMatch[1] : null;

    if (curSlide.location || driveFileId) {
      pillEl.style.display = 'inline-flex';
      var locHtml = curSlide.location
        ? '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + (typeof escapeHtml === 'function' ? escapeHtml(curSlide.location) : curSlide.location)
        : '';
      var driveLinkHtml = driveFileId
        ? '<a href="https://drive.google.com/file/d/' + driveFileId + '/view" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;margin-left:6px;display:inline-flex;align-items:center;gap:3px;pointer-events:auto;" title="Open video in Google Drive"><svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open Video &nearr;</a>'
        : '';
      pillEl.innerHTML = locHtml + driveLinkHtml;
    } else {
      pillEl.style.display = 'none';
    }
  }

  if (captionEl) {
    captionEl.textContent = curSlide.caption || '';
  }
}

/**
 * Toggles video sound between muted and unmuted
 */
function toggleStorySound() {
  var videoEl = document.getElementById('story-viewer-video');
  if (!videoEl) return;
  videoEl.muted = !videoEl.muted;
  updateSoundIcon(videoEl.muted);
}

function updateSoundIcon(isMuted) {
  var icon = document.getElementById('story-sound-icon');
  if (!icon) return;
  if (isMuted) {
    icon.innerHTML = '<line x1="1" y1="1" x2="23" y2="23"/><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  } else {
    icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  }
}

/**
 * Starts the countdown to auto-advance to next slide
 */
function startStoryTimer(duration) {
  clearTimeout(_storyTimer);
  _storyRemainingTime = duration;
  _storySlideStartTime = Date.now();
  _isStoryPaused = false;

  var pauseBtn = document.getElementById('story-btn-pause');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    pauseBtn.title = 'Pause Highlight';
  }

  _storyTimer = setTimeout(function() {
    nextStorySlide();
  }, duration);
}

/**
 * Advances to the next slide or the next highlight collection
 */
function nextStorySlide() {
  clearTimeout(_storyTimer);
  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });
  var curHighlight = activeHighlights[_currentStoryHighlightIdx];
  if (!curHighlight) {
    closeStoryViewer();
    return;
  }

  if (_currentStorySlideIdx + 1 < curHighlight.items.length) {
    _currentStorySlideIdx++;
    _storyRemainingTime = _storySlideDuration;
    updateStorySlideView();
  } else {
    // Last slide of this highlight -> advance to next highlight
    if (_currentStoryHighlightIdx + 1 < activeHighlights.length) {
      _currentStoryHighlightIdx++;
      _currentStorySlideIdx = 0;
      _storyRemainingTime = _storySlideDuration;
      updateStorySlideView();
    } else {
      // Reached the end of all highlights
      closeStoryViewer();
    }
  }
}

/**
 * Navigates back to the previous slide or previous highlight collection
 */
function prevStorySlide() {
  clearTimeout(_storyTimer);
  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });
  if (_currentStorySlideIdx > 0) {
    _currentStorySlideIdx--;
    _storyRemainingTime = _storySlideDuration;
    updateStorySlideView();
  } else {
    // First slide -> go to previous highlight
    if (_currentStoryHighlightIdx > 0) {
      _currentStoryHighlightIdx--;
      var prevHighlight = activeHighlights[_currentStoryHighlightIdx];
      _currentStorySlideIdx = prevHighlight.items ? Math.max(0, prevHighlight.items.length - 1) : 0;
      _storyRemainingTime = _storySlideDuration;
      updateStorySlideView();
    } else {
      // First slide of first highlight -> restart slide
      _currentStorySlideIdx = 0;
      _storyRemainingTime = _storySlideDuration;
      updateStorySlideView();
    }
  }
}

/**
 * Pauses story slide playback on hold
 */
function pauseStoryPlayback() {
  if (_isStoryPaused) return;
  clearTimeout(_storyTimer);
  var elapsed = Date.now() - _storySlideStartTime;
  _storyRemainingTime = Math.max(300, _storyRemainingTime - elapsed);
  _isStoryPaused = true;

  // Pause HTML5 video if playing
  var videoEl = document.getElementById('story-viewer-video');
  if (videoEl && !videoEl.paused) {
    if (typeof videoEl.pause === 'function') videoEl.pause();
  }

  // Pause progress bar animation
  var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
  if (currentFill) {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      var computed = window.getComputedStyle(currentFill);
      currentFill.style.width = computed.width;
    }
    currentFill.style.transition = 'none';
  }

  var pauseBtn = document.getElementById('story-btn-pause');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    pauseBtn.title = 'Resume Highlight';
  }
}

/**
 * Resumes story slide playback on release
 */
function resumeStoryPlayback() {
  if (!_isStoryPaused) return;
  _isStoryPaused = false;

  // Resume HTML5 video
  var videoEl = document.getElementById('story-viewer-video');
  if (videoEl && videoEl.style.display !== 'none') {
    if (typeof videoEl.play === 'function') videoEl.play().catch(function() {});
  } else {
    var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
    if (currentFill) {
      currentFill.style.transition = 'width ' + (_storyRemainingTime / 1000) + 's linear';
      currentFill.style.width = '100%';
    }
  }

  var pauseBtn = document.getElementById('story-btn-pause');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    pauseBtn.title = 'Pause Highlight';
  }

  startStoryTimer(_storyRemainingTime);
}

/**
 * Toggles play/pause state from header button
 */
function toggleStoryPause() {
  if (_isStoryPaused) {
    resumeStoryPlayback();
  } else {
    pauseStoryPlayback();
  }
}

/**
 * Closes the story viewer modal and terminates media playback
 */
function closeStoryViewer() {
  clearTimeout(_storyTimer);
  _currentStoryHighlightIdx = -1;
  _currentStorySlideIdx = 0;
  _isStoryPaused = false;

  if (typeof document !== 'undefined') {
    var videoEl = document.getElementById('story-viewer-video');
    if (videoEl) {
      if (typeof videoEl.pause === 'function') videoEl.pause();
      videoEl.src = '';
    }
    var iframeEl = document.getElementById('story-viewer-iframe');
    if (iframeEl) {
      iframeEl.src = '';
    }
    var modal = document.getElementById('story-viewer-modal');
    if (modal) modal.style.display = 'none';
  }
}

/**
 * Attaches keyboard navigation (Left/Right/Space/Escape)
 */
function attachStoryKeyListeners() {
  if (_storyKeyHandlerAttached || typeof document === 'undefined') return;
  _storyKeyHandlerAttached = true;

  document.addEventListener('keydown', function(e) {
    var modal = document.getElementById('story-viewer-modal');
    if (!modal || modal.style.display !== 'flex') return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextStorySlide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevStorySlide();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      toggleStoryPause();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeStoryViewer();
    }
  });
}

/**
 * Attaches touch/mouse press-and-hold to pause story
 */
function attachStoryHoldListeners() {
  if (_storyHoldAttached || typeof document === 'undefined') return;
  var wrap = document.getElementById('story-media-wrap');
  if (!wrap) return;
  _storyHoldAttached = true;

  wrap.addEventListener('mousedown', pauseStoryPlayback);
  wrap.addEventListener('mouseup', resumeStoryPlayback);
  wrap.addEventListener('touchstart', pauseStoryPlayback, { passive: true });
  wrap.addEventListener('touchend', resumeStoryPlayback, { passive: true });
}

// ── Admin Story Highlights Management (TSK-033) ────────────────────────────
/**
 * Renders the highlights management list in the Admin Console
 */
function renderAdminStoryHighlights() {
  if (typeof document === 'undefined') return;
  var list = document.getElementById('admin-story-highlights-list');
  if (!list) return;

  if (!storyHighlights.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;grid-column:1/-1;text-align:center;padding:14px;">No story highlights configured yet.</div>';
    return;
  }

  var html = '';
  storyHighlights.forEach(function(sh) {
    var coverUrl = sh.cover || (sh.items && sh.items[0] ? sh.items[0].url : 'assets/logo.png');
    var safeCover = (typeof safeUrl === 'function') ? safeUrl(coverUrl, 'assets/logo.png') : coverUrl;
    var slideCount = sh.items ? sh.items.length : 0;
    var title = (typeof escapeHtml === 'function') ? escapeHtml(sh.title) : sh.title;

    html += '<div class="story-admin-item">'
      + '<div class="story-admin-cover"><img src="' + safeCover + '" alt="' + title + '" onerror="this.src=\'assets/logo.png\'" /></div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-family:\'Oswald\',sans-serif;font-size:13px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + title + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);">' + slideCount + ' slide' + (slideCount === 1 ? '' : 's') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:4px;">'
        + '<button type="button" onclick="openEditStoryModal(\'' + sh.id + '\')" class="portal-btn portal-btn-secondary" style="padding:4px 8px;font-size:11px;" title="Edit Highlight">Edit</button>'
        + '<button type="button" onclick="deleteStoryHighlight(\'' + sh.id + '\')" class="portal-btn" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);padding:4px 8px;font-size:11px;" title="Delete Highlight">&times;</button>'
      + '</div>'
    + '</div>';
  });

  list.innerHTML = html;
}

/**
 * Opens Create Story Modal
 */
function openCreateStoryModal() {
  if (typeof document === 'undefined') return;
  var idInp = document.getElementById('adm-story-id');
  var titleInp = document.getElementById('adm-story-title');
  var coverInp = document.getElementById('adm-story-cover');
  var slidesList = document.getElementById('adm-story-slides-list');
  var modalTitle = document.getElementById('adm-story-modal-title');

  if (modalTitle) modalTitle.textContent = 'Create Highlight';
  if (idInp) idInp.value = '';
  if (titleInp) titleInp.value = '';
  if (coverInp) coverInp.value = '';
  if (slidesList) {
    slidesList.innerHTML = '';
    addStorySlideRow('', '', '', '', 'auto', 5);
  }

  var modal = document.getElementById('adm-story-modal');
  if (modal) modal.style.display = 'flex';
}

/**
 * Opens Edit Story Modal for a given highlight ID
 */
function openEditStoryModal(id) {
  if (typeof document === 'undefined') return;
  var sh = storyHighlights.find(function(x) { return x.id === id; });
  if (!sh) return;

  var idInp = document.getElementById('adm-story-id');
  var titleInp = document.getElementById('adm-story-title');
  var coverInp = document.getElementById('adm-story-cover');
  var slidesList = document.getElementById('adm-story-slides-list');
  var modalTitle = document.getElementById('adm-story-modal-title');

  if (modalTitle) modalTitle.textContent = 'Edit Highlight';
  if (idInp) idInp.value = sh.id;
  if (titleInp) titleInp.value = sh.title;
  if (coverInp) coverInp.value = sh.cover || '';

  if (slidesList) {
    slidesList.innerHTML = '';
    if (sh.items && sh.items.length) {
      sh.items.forEach(function(item) {
        addStorySlideRow(item.url || '', item.caption || '', item.date || '', item.location || '', item.type || 'auto', item.duration);
      });
    } else {
      addStorySlideRow('', '', '', '', 'auto', 5);
    }
  }

  var modal = document.getElementById('adm-story-modal');
  if (modal) modal.style.display = 'flex';
}

/**
 * Closes Create/Edit Story Modal
 */
function closeAdminStoryModal() {
  if (typeof document === 'undefined') return;
  var modal = document.getElementById('adm-story-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Adds an editable slide row inside the Admin Story Modal supporting photos and videos
 * @param {string} url
 * @param {string} caption
 * @param {string} date
 * @param {string} location
 * @param {string} [type] - 'auto' | 'image' | 'video'
 */
function addStorySlideRow(url, caption, date, location, type, duration) {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('adm-story-slides-list');
  if (!container) return;

  var currentRows = container.querySelectorAll('.adm-story-slide-row').length;
  var slideNum = currentRows + 1;
  var slideType = type || (isVideoMedia(url) ? 'video' : 'auto');
  var defaultDur = (slideType === 'video') ? 30 : 5;
  var slideDur = (duration && isFinite(duration) && Number(duration) > 0) ? Number(duration) : defaultDur;

  var div = document.createElement('div');
  div.className = 'adm-story-slide-row';
  div.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:12px;margin-bottom:10px;position:relative;';

  div.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap;">'
    + '<span style="font-size:12px;font-weight:700;color:var(--accent);">Slide #' + slideNum + '</span>'
    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      + '<div style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:6px;padding:2px 6px;" title="Display duration in seconds">'
        + '<span style="font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">Time:</span>'
        + '<input type="number" class="form-input adm-slide-duration" min="1" max="600" step="1" value="' + slideDur + '" style="font-size:11px;padding:2px 4px;width:44px;text-align:center;border:none;background:transparent;color:var(--text-primary);" />'
        + '<span style="font-size:10px;color:var(--text-muted);">s</span>'
      + '</div>'
      + '<select class="form-input adm-slide-type" style="font-size:11px;padding:3px 8px;width:auto;border-radius:6px;" onchange="handleSlideTypeChange(this)">'
        + '<option value="auto"' + (slideType === 'auto' ? ' selected' : '') + '>Auto Detect</option>'
        + '<option value="image"' + (slideType === 'image' ? ' selected' : '') + '>Photo</option>'
        + '<option value="video"' + (slideType === 'video' ? ' selected' : '') + '>Video</option>'
      + '</select>'
      + '<label class="portal-btn portal-btn-secondary" style="padding:4px 9px;font-size:11px;cursor:pointer;margin:0;display:inline-flex;align-items:center;gap:4px;" title="Upload photo or video for this slide">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
        + '<span>Upload</span>'
        + '<input type="file" accept="image/*,video/*,.mp4,.webm,.mov,.m4v,.png,.jpg,.jpeg,.gif,.webp" style="display:none;" onchange="handleSlideFileUpload(this)" />'
      + '</label>'
      + '<button type="button" onclick="this.closest(\'.adm-story-slide-row\').remove()" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" title="Remove slide">&times;</button>'
    + '</div>'
  + '</div>'
  + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">'
    + '<input type="text" class="form-input adm-slide-url" placeholder="Photo/Video URL or Google Drive link" value="' + (url || '') + '" oninput="handleSlideUrlInput(this)" style="font-size:12px;padding:6px 10px;" />'
    + '<input type="text" class="form-input adm-slide-date" placeholder="Date (e.g. 15 Jun 2026)" value="' + (date || '') + '" style="font-size:12px;padding:6px 10px;" />'
  + '</div>'
  + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    + '<input type="text" class="form-input adm-slide-caption" placeholder="Slide Caption / Remark" value="' + (caption || '') + '" style="font-size:12px;padding:6px 10px;" />'
    + '<input type="text" class="form-input adm-slide-loc" placeholder="Location / Activity" value="' + (location || '') + '" style="font-size:12px;padding:6px 10px;" />'
  + '</div>'
  + '<div class="adm-slide-status" style="font-size:11px;margin-top:6px;color:var(--text-muted);display:none;"></div>';

  container.appendChild(div);
}

/**
 * Adjusts default duration when admin toggles slide format
 * @param {HTMLSelectElement} sel
 */
function handleSlideTypeChange(sel) {
  if (!sel) return;
  var row = sel.closest('.adm-story-slide-row');
  if (!row) return;
  var durInp = row.querySelector('.adm-slide-duration');
  if (durInp) {
    var curVal = parseInt(durInp.value, 10);
    if (sel.value === 'image' && curVal === 30) {
      durInp.value = '5';
    } else if (sel.value === 'video' && curVal === 5) {
      durInp.value = '30';
    }
  }
}

/**
 * Handles slide-specific file uploads in the story creator modal
 * @param {HTMLInputElement} input
 */
async function handleSlideFileUpload(input) {
  if (!input || !input.files || !input.files.length) return;
  var file = input.files[0];
  var row = input.closest('.adm-story-slide-row');
  if (!row) return;

  var statusEl = row.querySelector('.adm-slide-status');
  var urlInput = row.querySelector('.adm-slide-url');
  var typeSelect = row.querySelector('.adm-slide-type');

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Uploading ' + file.name + '...';
  }

  try {
    var res = await uploadSingleMediaFile(file);
    if (res && res.url) {
      if (urlInput) urlInput.value = res.url;
      if (typeSelect) typeSelect.value = res.type;
      var durInp = row.querySelector('.adm-slide-duration');
      if (durInp) {
        if (res.type === 'video' && parseInt(durInp.value, 10) === 5) durInp.value = '30';
        else if (res.type === 'image' && parseInt(durInp.value, 10) === 30) durInp.value = '5';
      }
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">Uploaded: ' + (typeof escapeHtml === 'function' ? escapeHtml(file.name) : file.name) + ' (' + res.type.toUpperCase() + ')</span>';
      }
      if (typeof showToast === 'function') {
        showToast('Uploaded ' + res.type + ' successfully!', 'success');
      }
    }
  } catch (err) {
    console.error('Slide file upload failed:', err);
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:var(--red);">Upload failed: ' + (typeof escapeHtml === 'function' ? escapeHtml(err.message || 'Error') : 'Error') + '</span>';
    }
  }
}

/**
 * Auto-detects and normalizes Google Drive / YouTube links in the slide URL input
 * @param {HTMLInputElement} input
 */
function handleSlideUrlInput(input) {
  if (!input) return;
  var row = input.closest('.adm-story-slide-row');
  if (!row) return;
  var val = (input.value || '').trim();
  var statusEl = row.querySelector('.adm-slide-status');
  var typeSelect = row.querySelector('.adm-slide-type');

  if (!val) {
    if (statusEl) statusEl.style.display = 'none';
    return;
  }

  if (val.indexOf('drive.google.com') !== -1 || val.indexOf('docs.google.com') !== -1) {
    var normDrive = normalizeMediaUrl(val, (typeSelect && typeSelect.value !== 'auto') ? typeSelect.value : 'video');
    input.value = normDrive;
    if (typeSelect && typeSelect.value === 'auto') typeSelect.value = 'video';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#3b82f6;font-weight:600;">Google Drive embed streaming link ready.</span>';
    }
  } else if (val.indexOf('youtube.com') !== -1 || val.indexOf('youtu.be') !== -1) {
    var normYt = normalizeMediaUrl(val, 'video');
    input.value = normYt;
    if (typeSelect) typeSelect.value = 'video';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#ef4444;font-weight:600;">YouTube video embed stream ready.</span>';
    }
  } else if (isVideoMedia(val)) {
    if (typeSelect && typeSelect.value === 'auto') typeSelect.value = 'video';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:var(--accent);font-weight:600;">Direct video file (MP4/WebM/MOV) detected.</span>';
    }
  } else {
    if (statusEl) statusEl.style.display = 'none';
  }
}

/**
 * Saves Highlight and its slides from the Admin Modal
 */
async function saveStoryHighlightModal() {
  if (typeof document === 'undefined') return;
  var id = ((document.getElementById('adm-story-id') || {}).value || '').trim();
  var rawTitle = ((document.getElementById('adm-story-title') || {}).value || '').trim();
  var rawCover = ((document.getElementById('adm-story-cover') || {}).value || '').trim();

  var title = (typeof sanitizeText === 'function') ? sanitizeText(rawTitle, 80) : rawTitle;
  var cover = (typeof safeUrl === 'function') ? safeUrl(rawCover, '') : rawCover;

  if (!title) {
    if (typeof showToast === 'function') showToast('Please enter a story highlight title.', 'warning');
    return;
  }

  var slides = [];
  var rows = document.querySelectorAll('.adm-story-slide-row');
  rows.forEach(function(r) {
    var urlInp = r.querySelector('.adm-slide-url');
    var capInp = r.querySelector('.adm-slide-caption');
    var dateInp = r.querySelector('.adm-slide-date');
    var locInp = r.querySelector('.adm-slide-loc');
    var typeInp = r.querySelector('.adm-slide-type');

    var durInp = r.querySelector('.adm-slide-duration');
    var u = (urlInp ? urlInp.value : '').trim();
    if (u) {
      var normU = normalizeMediaUrl(u);
      var slideType = (typeInp && typeInp.value !== 'auto') ? typeInp.value : (isVideoMedia(normU) ? 'video' : 'image');
      var parsedDur = durInp ? parseInt(durInp.value, 10) : 0;
      var defaultDur = slideType === 'video' ? 30 : 5;
      var slideDurationSec = (parsedDur > 0 && isFinite(parsedDur)) ? parsedDur : defaultDur;

      slides.push({
        id: 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: (typeof safeUrl === 'function') ? safeUrl(normU, '') : normU,
        type: slideType,
        duration: slideDurationSec,
        caption: (typeof sanitizeText === 'function') ? sanitizeText((capInp ? capInp.value : '').trim(), 140) : (capInp ? capInp.value : '').trim(),
        date: (typeof sanitizeText === 'function') ? sanitizeText((dateInp ? dateInp.value : '').trim(), 50) : (dateInp ? dateInp.value : '').trim(),
        location: (typeof sanitizeText === 'function') ? sanitizeText((locInp ? locInp.value : '').trim(), 60) : (locInp ? locInp.value : '').trim()
      });
    }
  });

  if (!slides.length) {
    slides.push({
      id: 's_' + Date.now(),
      url: cover || 'assets/logo.png',
      type: isVideoMedia(cover) ? 'video' : 'image',
      duration: isVideoMedia(cover) ? 30 : 5,
      caption: title,
      date: new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
      location: '1st Petaling Jaya'
    });
  }

  var highlightId = id || ('story_' + Date.now());
  var existingIdx = storyHighlights.findIndex(function(x) { return x.id === highlightId; });

  var highlightObj = {
    id: highlightId,
    title: title,
    cover: cover || slides[0].url,
    order: (existingIdx >= 0) ? (storyHighlights[existingIdx].order || (existingIdx + 1)) : (storyHighlights.length + 1),
    active: true,
    items: slides
  };

  if (existingIdx >= 0) {
    storyHighlights[existingIdx] = highlightObj;
  } else {
    storyHighlights.push(highlightObj);
  }

  await saveStoryHighlights();
  closeAdminStoryModal();

  if (typeof showToast === 'function') {
    showToast('Highlight "' + title + '" saved successfully!', 'success');
  }
}

/**
 * Deletes a Story Highlight by ID
 */
async function deleteStoryHighlight(id) {
  var target = storyHighlights.find(function(x) { return x.id === id; });
  if (!target) return;

  var confirmed = true;
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal('Are you sure you want to delete the highlight "' + target.title + '"?', 'Delete Highlight');
  }

  if (!confirmed) return;

  storyHighlights = storyHighlights.filter(function(x) { return x.id !== id; });
  await saveStoryHighlights();

  try {
    var client = (typeof window !== 'undefined' && window.supa) ? window.supa : (typeof supa !== 'undefined' ? supa : null);
    if (client && typeof client.delete === 'function') {
      await client.delete('bb_stories?id=eq.' + encodeURIComponent(id));
    }
  } catch (e) {}

  if (typeof showToast === 'function') {
    showToast('Highlight deleted.', 'success');
  }
}

// ── Global Window Exports (HTML inline handler compatibility) ────────────────
if (typeof window !== 'undefined') {
  window.galleryImages          = galleryImages;
  window.storyHighlights        = storyHighlights;
  window.normalizeMediaUrl      = normalizeMediaUrl;
  window.isVideoMedia           = isVideoMedia;
  window.uploadSingleMediaFile  = uploadSingleMediaFile;
  window.filterGallery          = filterGallery;
  window.toggleStorySound       = toggleStorySound;
  window.handleSlideFileUpload  = handleSlideFileUpload;
  window.handleSlideUrlInput    = handleSlideUrlInput;

  window.loadStoryHighlights    = loadStoryHighlights;
  window.saveStoryHighlights    = saveStoryHighlights;
  window.renderStoryHighlightsReel = renderStoryHighlightsReel;
  window.renderAdminStoryHighlights = renderAdminStoryHighlights;
  window.openStoryViewer        = openStoryViewer;
  window.closeStoryViewer       = closeStoryViewer;
  window.nextStorySlide         = nextStorySlide;
  window.prevStorySlide         = prevStorySlide;
  window.pauseStoryPlayback     = pauseStoryPlayback;
  window.resumeStoryPlayback    = resumeStoryPlayback;
  window.toggleStoryPause       = toggleStoryPause;
  window.openCreateStoryModal   = openCreateStoryModal;
  window.openEditStoryModal     = openEditStoryModal;
  window.closeAdminStoryModal   = closeAdminStoryModal;
  window.addStorySlideRow       = addStorySlideRow;
  window.saveStoryHighlightModal = saveStoryHighlightModal;
  window.deleteStoryHighlight   = deleteStoryHighlight;
  window.handleSlideTypeChange  = handleSlideTypeChange;
  window.applyStoryProgressAnimation = applyStoryProgressAnimation;
  window.getStorySlideDuration  = function() { return _storySlideDuration; };

  window.loadGallery            = loadGallery;
  window.renderGallery          = renderGallery;
  window.openGalleryLightbox    = openGalleryLightbox;
  window.uploadGalleryFiles     = uploadGalleryFiles;
  window.handleGalleryUpload    = handleGalleryUpload;
  window.deleteGalleryImage     = deleteGalleryImage;
  window.initGalleryDropZone    = initGalleryDropZone;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    galleryImages: galleryImages,
    DEFAULT_STORY_HIGHLIGHTS: DEFAULT_STORY_HIGHLIGHTS,
    normalizeMediaUrl: normalizeMediaUrl,
    isVideoMedia: isVideoMedia,
    uploadSingleMediaFile: uploadSingleMediaFile,
    filterGallery: filterGallery,
    toggleStorySound: toggleStorySound,
    handleSlideFileUpload: handleSlideFileUpload,
    handleSlideUrlInput: handleSlideUrlInput,
    handleSlideTypeChange: handleSlideTypeChange,
    applyStoryProgressAnimation: applyStoryProgressAnimation,
    getStorySlideDuration: function() { return _storySlideDuration; },

    loadStoryHighlights: loadStoryHighlights,
    saveStoryHighlights: saveStoryHighlights,
    renderStoryHighlightsReel: renderStoryHighlightsReel,
    renderAdminStoryHighlights: renderAdminStoryHighlights,
    openStoryViewer: openStoryViewer,
    closeStoryViewer: closeStoryViewer,
    nextStorySlide: nextStorySlide,
    prevStorySlide: prevStorySlide,
    pauseStoryPlayback: pauseStoryPlayback,
    resumeStoryPlayback: resumeStoryPlayback,
    toggleStoryPause: toggleStoryPause,
    openCreateStoryModal: openCreateStoryModal,
    openEditStoryModal: openEditStoryModal,
    closeAdminStoryModal: closeAdminStoryModal,
    addStorySlideRow: addStorySlideRow,
    saveStoryHighlightModal: saveStoryHighlightModal,
    deleteStoryHighlight: deleteStoryHighlight,

    loadGallery: loadGallery,
    renderGallery: renderGallery,
    openGalleryLightbox: openGalleryLightbox,
    uploadGalleryFiles: uploadGalleryFiles,
    handleGalleryUpload: handleGalleryUpload,
    deleteGalleryImage: deleteGalleryImage,
    initGalleryDropZone: initGalleryDropZone
  };

  Object.defineProperty(module.exports, '_storySlideDuration', { get: function() { return _storySlideDuration; }, configurable: true });
  Object.defineProperty(module.exports, 'storyHighlights', {
    get: function() { return storyHighlights; },
    set: function(v) { storyHighlights = v; },
    configurable: true,
    enumerable: true
  });
}
