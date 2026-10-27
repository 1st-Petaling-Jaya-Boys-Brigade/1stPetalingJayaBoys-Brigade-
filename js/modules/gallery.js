/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Photo Gallery Module (TSK-010)
 *
 * Implements public photo grid, image lightbox viewer, Supabase Storage uploads,
 * admin photo management, and drag-and-drop file ingestion.
 */

// ── State ──────────────────────────────────────────────────────────────────
var galleryImages = [];

// ── Data Fetching ──────────────────────────────────────────────────────────
/**
 * Loads all gallery images from Supabase ordered by creation date ascending
 */
async function loadGallery() {
  try {
    if (typeof supa !== 'undefined' && supa.req) {
      var rows = await supa.req('GET', 'bb_gallery?order=created_at.asc&select=id,url');
      galleryImages.length = 0;
      if (rows && rows.length) {
        rows.forEach(function(r) {
          galleryImages.push({ id: r.id, url: r.url });
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

// ── Public & Admin Rendering ───────────────────────────────────────────────
/**
 * Renders both the public home page gallery grid and admin management grid
 */
function renderGallery() {
  if (typeof document === 'undefined') return;

  var grid      = document.getElementById('gallery-grid');
  var adminGrid = document.getElementById('admin-gallery-grid');
  var noPhotos  = document.getElementById('no-photos');

  renderStoryHighlightsReel();
  renderAdminStoryHighlights();

  if (!galleryImages.length) {
    if (grid)      grid.innerHTML = '';
    if (adminGrid) adminGrid.innerHTML = '';
    if (noPhotos)  noPhotos.style.display = 'block';
    return;
  }

  if (noPhotos) noPhotos.style.display = 'none';

  var pubHtml = '';
  var admHtml = '';

  galleryImages.forEach(function(item, i) {
    var rawUrl = (typeof item === 'string') ? item : (item.url || '');
    var id     = (typeof item === 'object' && item && item.id) ? item.id : '';

    var validatedUrl = (typeof safeUrl === 'function') ? safeUrl(rawUrl, '') : rawUrl;
    var safeUrlStr   = (typeof escapeHtml === 'function') ? escapeHtml(validatedUrl) : validatedUrl;

    // Public grid item with clickable lightbox preview
    pubHtml += '<div class="gallery-img-wrap" data-lightbox-idx="' + i + '" style="cursor:pointer;" title="Click to preview photo">'
      + '<img src="' + safeUrlStr + '" alt="Photo ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"/>'
      + '</div>';

    // Admin grid item with delete button
    admHtml += '<div class="gallery-img-wrap">'
      + '<img src="' + safeUrlStr + '" alt="Photo ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"/>'
      + '<button type="button" class="del-btn" data-gi="' + i + '" data-gid="' + id + '" title="Delete Photo" aria-label="Delete Photo">&times;</button>'
      + '</div>';
  });

  if (grid) {
    grid.innerHTML = pubHtml;
    // Attach lightbox click listeners
    grid.querySelectorAll('[data-lightbox-idx]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-lightbox-idx'), 10);
        openGalleryLightbox(idx);
      });
    });
  }

  if (adminGrid) {
    adminGrid.innerHTML = admHtml;
    // Attach delete listeners
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
 * Opens a responsive full-screen lightbox modal for a selected photo
 * @param {number} idx - Index in galleryImages
 */
function openGalleryLightbox(idx) {
  if (typeof document === 'undefined') return;
  var item = galleryImages[idx];
  if (!item) return;
  var rawUrl = (typeof item === 'string') ? item : item.url;
  if (!rawUrl) return;

  var validatedUrl = (typeof safeUrl === 'function') ? safeUrl(rawUrl, '') : rawUrl;
  var safeUrlStr   = (typeof escapeHtml === 'function') ? escapeHtml(validatedUrl) : validatedUrl;

  // Remove existing lightbox if present
  var existing = document.getElementById('gallery-lightbox-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'gallery-lightbox-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,18,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;backdrop-filter:blur(6px);animation:fadeIn 0.2s ease;';

  modal.innerHTML = '<div style="position:relative;max-width:92vw;max-height:92vh;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation();">'
    + '<img src="' + safeUrlStr + '" alt="Photo preview" style="max-width:100%;max-height:86vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);"/>'
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
 * Shared file uploader for gallery photos (file input and drag-and-drop)
 * @param {FileList|File[]} files
 */
async function uploadGalleryFiles(files) {
  if (!files || !files.length) return;
  var validFiles = Array.from(files).filter(function(f) {
    return f && f.type && f.type.startsWith('image/');
  });

  if (!validFiles.length) {
    if (typeof showToast === 'function') {
      showToast('Please select valid image files (JPG, PNG, WebP).', 'warning');
    } else {
      alert('Please select valid image files.');
    }
    return;
  }

  var dropZone = (typeof document !== 'undefined') ? document.getElementById('gallery-drop') : null;
  if (dropZone) dropZone.style.opacity = '0.5';

  var successCount = 0;
  var failCount = 0;

  for (var fi = 0; fi < validFiles.length; fi++) {
    var file = validFiles[fi];
    try {
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!ext) ext = 'jpg';
      var rand = Math.random().toString(36).substring(2, 7);
      var fname = 'photo_' + Date.now() + '_' + fi + '_' + rand + '.' + ext;

      var blob = new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' });

      if (typeof supa !== 'undefined' && supa.uploadFile) {
        await supa.uploadFile('gallery', fname, blob);
        var url = supa.fileUrl('gallery', fname);
        var row = await supa.post('bb_gallery', { url: url, created_at: new Date().toISOString() });
        var id = (row && row[0] && row[0].id) ? row[0].id : null;
        galleryImages.push({ id: id, url: url });
        successCount++;
      }
    } catch (e) {
      console.error('Gallery upload error for file ' + file.name + ':', e);
      failCount++;
    }
  }

  if (dropZone) dropZone.style.opacity = '1';

  renderGallery();

  if (typeof showToast === 'function') {
    if (successCount > 0 && failCount === 0) {
      showToast('Uploaded ' + successCount + ' photo' + (successCount > 1 ? 's' : '') + ' successfully!', 'success');
    } else if (successCount > 0 && failCount > 0) {
      showToast('Uploaded ' + successCount + ' photo' + (successCount > 1 ? 's' : '') + ' (' + failCount + ' failed).', 'warning');
    } else if (failCount > 0) {
      showToast('Failed to upload photos. Please check storage bucket permissions.', 'error');
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
 * Deletes a gallery image from Supabase database and storage bucket
 * @param {number} idx - Index in galleryImages
 * @param {string} rowId - Database row ID in bb_gallery
 */
async function deleteGalleryImage(idx, rowId) {
  var item = galleryImages[idx];
  if (!item) return;

  var confirmed = false;
  var confirmMsg = 'Are you sure you want to delete this photo from the gallery?';
  if (typeof showConfirmModal === 'function') {
    confirmed = await showConfirmModal(confirmMsg, 'Delete Photo');
  } else if (typeof window !== 'undefined' && window.confirm) {
    confirmed = window.confirm(confirmMsg);
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
    if (typeof supa !== 'undefined') {
      if (rowId && supa.delete) {
        await supa.delete('bb_gallery?id=eq.' + rowId);
      }
      if (url && supa.deleteFile) {
        var fname = url.split('/').pop();
        if (fname) {
          await supa.deleteFile('gallery', fname);
        }
      }
    }
    if (typeof showToast === 'function') {
      showToast('Photo deleted successfully.', 'success');
    }
  } catch (e) {
    console.error('deleteGalleryImage error:', e);
    if (typeof showToast === 'function') {
      showToast('Failed to delete photo from storage.', 'error');
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
        caption: 'Night Campfire & Company Fellowship at Annual Boot Camp',
        date: '15 Jun 2026',
        location: 'Outback Camp Ground'
      },
      {
        id: 'c2',
        url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&h=1200&fit=crop&q=85',
        caption: 'Pioneering Challenge: Constructing the watchtower bridge',
        date: '16 Jun 2026',
        location: 'Camp Pioneering Site'
      },
      {
        id: 'c3',
        url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=1200&fit=crop&q=85',
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
        caption: 'Presentation of the prestigious Founder’s and President’s Badges',
        date: '28 Jun 2026',
        location: 'Sanctuary, TMC PJ'
      },
      {
        id: 'a2',
        url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&h=1200&fit=crop&q=85',
        caption: 'Annual Company Guard of Honour & Inspection Parade',
        date: '28 Jun 2026',
        location: 'Church Courtyard'
      },
      {
        id: 'a3',
        url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&h=1200&fit=crop&q=85',
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
        caption: 'Brass Band Sectionals: Saturdays 9:30 AM – 11:30 AM Rehearsal',
        date: '11 Jul 2026',
        location: 'Music Room'
      },
      {
        id: 'b2',
        url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=1200&fit=crop&q=85',
        caption: 'National BB Band Contest Performance Showcase',
        date: '18 Jul 2026',
        location: 'Auditorium'
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
        caption: 'Ceremonial Squad Drill & Colour Party Rehearsal',
        date: '08 Aug 2026',
        location: 'Parade Ground'
      },
      {
        id: 'd2',
        url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=800&h=1200&fit=crop&q=85',
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
      } catch (errDb) {
        // Fallback to bb_config
        var cfgRows = await client.get('bb_config?key=eq.bb_story_highlights&select=value');
        if (cfgRows && cfgRows.length && cfgRows[0].value) {
          storyHighlights = typeof cfgRows[0].value === 'string' ? JSON.parse(cfgRows[0].value) : cfgRows[0].value;
        }
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
 * Renders the circular Instagram-style Story Highlights Reel above the gallery
 */
function renderStoryHighlightsReel() {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('story-highlights-reel');
  if (!container) return;

  var activeHighlights = storyHighlights.filter(function(sh) { return sh.active !== false; });
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

    html += '<button type="button" class="story-highlight-item" data-sh-idx="' + idx + '" title="Watch ' + title + ' Story Highlight" aria-label="Watch ' + title + ' Story Highlight">'
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
 * Updates progress bars, media, header metadata, and caption for the active slide
 */
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

  // 1. Render Segmented Progress Bars
  var progressContainer = document.getElementById('story-progress-bars');
  if (progressContainer) {
    var pBarsHtml = '';
    for (var i = 0; i < curHighlight.items.length; i++) {
      var fillWidth = (i < _currentStorySlideIdx) ? '100%' : '0%';
      var transitionStyle = (i === _currentStorySlideIdx) ? 'transition: width ' + (_storyRemainingTime / 1000) + 's linear;' : 'transition: none;';
      pBarsHtml += '<div class="story-progress-bar">'
        + '<div class="story-progress-fill" id="story-fill-' + i + '" style="width:' + fillWidth + ';' + transitionStyle + '"></div>'
      + '</div>';
    }
    progressContainer.innerHTML = pBarsHtml;

    // Trigger CSS fill on current bar
    setTimeout(function() {
      var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
      if (currentFill) {
        currentFill.style.width = '100%';
      }
    }, 20);
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

  // 3. Media & Preloading
  var imgEl = document.getElementById('story-viewer-img');
  if (imgEl) {
    var safeMediaUrl = (typeof safeUrl === 'function') ? safeUrl(curSlide.url, '') : curSlide.url;
    imgEl.src = safeMediaUrl;
    imgEl.alt = curSlide.caption || curHighlight.title;
  }

  // Preload next slide if available
  if (_currentStorySlideIdx + 1 < curHighlight.items.length) {
    var nextSlide = curHighlight.items[_currentStorySlideIdx + 1];
    if (typeof Image !== 'undefined') {
      var preImg = new Image();
      preImg.src = (typeof safeUrl === 'function') ? safeUrl(nextSlide.url, '') : nextSlide.url;
    }
  }

  // 4. Caption & Location Pill
  var pillEl = document.getElementById('story-viewer-pill');
  var captionEl = document.getElementById('story-viewer-caption');

  if (pillEl) {
    if (curSlide.location) {
      pillEl.style.display = 'inline-flex';
      pillEl.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + (typeof escapeHtml === 'function' ? escapeHtml(curSlide.location) : curSlide.location);
    } else {
      pillEl.style.display = 'none';
    }
  }

  if (captionEl) {
    captionEl.textContent = curSlide.caption || '';
  }

  // 5. Reset and Start Timer
  startStoryTimer(_storySlideDuration);
}

/**
 * Starts the 5-second countdown to auto-advance to next slide
 */
function startStoryTimer(duration) {
  clearTimeout(_storyTimer);
  _storyRemainingTime = duration;
  _storySlideStartTime = Date.now();
  _isStoryPaused = false;

  var pauseBtn = document.getElementById('story-btn-pause');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    pauseBtn.title = 'Pause Story';
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
    pauseBtn.title = 'Resume Story';
  }
}

/**
 * Resumes story slide playback on release
 */
function resumeStoryPlayback() {
  if (!_isStoryPaused) return;
  _isStoryPaused = false;
  var currentFill = document.getElementById('story-fill-' + _currentStorySlideIdx);
  if (currentFill) {
    currentFill.style.transition = 'width ' + (_storyRemainingTime / 1000) + 's linear';
    currentFill.style.width = '100%';
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
 * Closes the story viewer modal
 */
function closeStoryViewer() {
  clearTimeout(_storyTimer);
  _currentStoryHighlightIdx = -1;
  _currentStorySlideIdx = 0;
  _isStoryPaused = false;

  if (typeof document !== 'undefined') {
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

  if (idInp) idInp.value = '';
  if (titleInp) titleInp.value = '';
  if (coverInp) coverInp.value = '';
  if (slidesList) {
    slidesList.innerHTML = '';
    addStorySlideRow('', '', '', '');
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

  if (idInp) idInp.value = sh.id;
  if (titleInp) titleInp.value = sh.title;
  if (coverInp) coverInp.value = sh.cover || '';

  if (slidesList) {
    slidesList.innerHTML = '';
    if (sh.items && sh.items.length) {
      sh.items.forEach(function(item) {
        addStorySlideRow(item.url || '', item.caption || '', item.date || '', item.location || '');
      });
    } else {
      addStorySlideRow('', '', '', '');
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
 * Adds an editable slide row inside the Admin Story Modal
 */
function addStorySlideRow(url, caption, date, location) {
  if (typeof document === 'undefined') return;
  var container = document.getElementById('adm-story-slides-list');
  if (!container) return;

  var div = document.createElement('div');
  div.className = 'adm-story-slide-row';
  div.style.cssText = 'background:var(--bg-card);border:1px solid var(--border-card);border-radius:10px;padding:10px;margin-bottom:8px;position:relative;';

  div.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">'
    + '<input type="text" class="form-input adm-slide-url" placeholder="Photo URL (https://...)" value="' + (url || '') + '" style="font-size:12px;padding:6px 10px;" />'
    + '<input type="text" class="form-input adm-slide-date" placeholder="Date (e.g. 15 Jun 2026)" value="' + (date || '') + '" style="font-size:12px;padding:6px 10px;" />'
  + '</div>'
  + '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;">'
    + '<input type="text" class="form-input adm-slide-caption" placeholder="Slide Caption / Remark" value="' + (caption || '') + '" style="font-size:12px;padding:6px 10px;" />'
    + '<input type="text" class="form-input adm-slide-loc" placeholder="Location / Activity" value="' + (location || '') + '" style="font-size:12px;padding:6px 10px;" />'
    + '<button type="button" onclick="this.closest(\'.adm-story-slide-row\').remove()" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">&times;</button>'
  + '</div>';

  container.appendChild(div);
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
    else alert('Please enter a story highlight title.');
    return;
  }

  var slides = [];
  var rows = document.querySelectorAll('.adm-story-slide-row');
  rows.forEach(function(r) {
    var urlInp = r.querySelector('.adm-slide-url');
    var capInp = r.querySelector('.adm-slide-caption');
    var dateInp = r.querySelector('.adm-slide-date');
    var locInp = r.querySelector('.adm-slide-loc');

    var u = (urlInp ? urlInp.value : '').trim();
    if (u) {
      slides.push({
        id: 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: (typeof safeUrl === 'function') ? safeUrl(u, '') : u,
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
    showToast('Story Highlight "' + title + '" saved successfully!', 'success');
  } else {
    alert('Story Highlight saved successfully!');
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
    confirmed = await showConfirmModal('Are you sure you want to delete the story highlight "' + target.title + '"?');
  } else if (typeof confirm === 'function') {
    confirmed = confirm('Delete story highlight "' + target.title + '"?');
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
  window.galleryImages        = galleryImages;
  window.storyHighlights        = storyHighlights;
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

  window.loadGallery          = loadGallery;
  window.renderGallery        = renderGallery;
  window.openGalleryLightbox  = openGalleryLightbox;
  window.uploadGalleryFiles   = uploadGalleryFiles;
  window.handleGalleryUpload  = handleGalleryUpload;
  window.deleteGalleryImage   = deleteGalleryImage;
  window.initGalleryDropZone  = initGalleryDropZone;
}

// ── Node.js Module Exports ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    galleryImages: galleryImages,
    DEFAULT_STORY_HIGHLIGHTS: DEFAULT_STORY_HIGHLIGHTS,
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

  Object.defineProperty(module.exports, 'storyHighlights', {
    get: function() { return storyHighlights; },
    set: function(v) { storyHighlights = v; },
    configurable: true,
    enumerable: true
  });
}
