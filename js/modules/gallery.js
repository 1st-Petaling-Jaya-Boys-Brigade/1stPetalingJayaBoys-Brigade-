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
    var url = (typeof item === 'string') ? item : (item.url || '');
    var id  = (typeof item === 'object' && item && item.id) ? item.id : '';

    var safeUrl = (typeof escapeHtml === 'function') ? escapeHtml(url) : url;

    // Public grid item with clickable lightbox preview
    pubHtml += '<div class="gallery-img-wrap" data-lightbox-idx="' + i + '" style="cursor:pointer;" title="Click to preview photo">'
      + '<img src="' + safeUrl + '" alt="Photo ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"/>'
      + '</div>';

    // Admin grid item with delete button
    admHtml += '<div class="gallery-img-wrap">'
      + '<img src="' + safeUrl + '" alt="Photo ' + (i + 1) + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"/>'
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
  var url = (typeof item === 'string') ? item : item.url;
  if (!url) return;

  var safeUrl = (typeof escapeHtml === 'function') ? escapeHtml(url) : url;

  // Remove existing lightbox if present
  var existing = document.getElementById('gallery-lightbox-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'gallery-lightbox-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,18,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;backdrop-filter:blur(6px);animation:fadeIn 0.2s ease;';

  modal.innerHTML = '<div style="position:relative;max-width:92vw;max-height:92vh;display:flex;align-items:center;justify-content:center;" onclick="event.stopPropagation();">'
    + '<img src="' + safeUrl + '" alt="Photo preview" style="max-width:100%;max-height:86vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);"/>'
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

// ── Global Window Exports (HTML inline handler compatibility) ────────────────
if (typeof window !== 'undefined') {
  window.galleryImages        = galleryImages;
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
    loadGallery: loadGallery,
    renderGallery: renderGallery,
    openGalleryLightbox: openGalleryLightbox,
    uploadGalleryFiles: uploadGalleryFiles,
    handleGalleryUpload: handleGalleryUpload,
    deleteGalleryImage: deleteGalleryImage,
    initGalleryDropZone: initGalleryDropZone
  };
}
