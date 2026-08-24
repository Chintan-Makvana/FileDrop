const API = '/api';
let token = localStorage.getItem('filedrop_token');
let userEmail = localStorage.getItem('filedrop_email');
let userName = localStorage.getItem('filedrop_username');
let userRole = localStorage.getItem('filedrop_role') || 'user';
let userAvatar = localStorage.getItem('filedrop_avatar') || null;
let cachedFiles = [];
let currentAdminView = 'all';
let currentSearchQuery = '';

// ---------- Device Identification & Vault Binding ----------
function detectDefaultDeviceName() {
  const ua = navigator.userAgent;
  let os = 'Device';
  if (ua.includes('Win')) os = 'Windows PC';
  else if (ua.includes('Mac')) os = 'MacBook';
  else if (ua.includes('Linux')) os = 'Linux PC';
  else if (ua.includes('Android')) os = 'Android Phone';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'Apple iOS';

  let browser = '';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  return browser ? `${os} • ${browser}` : os;
}

let clientDeviceId = localStorage.getItem('filedrop_device_id');
if (!clientDeviceId) {
  clientDeviceId = 'dev_' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 12));
  localStorage.setItem('filedrop_device_id', clientDeviceId);
}

let clientDeviceName = localStorage.getItem('filedrop_device_name') || detectDefaultDeviceName();
localStorage.setItem('filedrop_device_name', clientDeviceName);

let isDeviceAuthorized = true;
let linkedDeviceName = clientDeviceName;

function getAuthHeaders(extra = {}) {
  return {
    Authorization: 'Bearer ' + token,
    'x-device-id': clientDeviceId,
    'x-device-name': encodeURIComponent(clientDeviceName),
    ...extra,
  };
}

const authScreen = document.getElementById('auth-screen');
const dashboard = document.getElementById('dashboard');
const authError = document.getElementById('auth-error');
const toastContainer = document.getElementById('toast-container');

// ---------- Toast Notification System ----------
function showToast(msg, type = 'success', duration = 3200) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(msg)}</span>`;
  
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, duration);
}

// ---------- Avatar Renderer Helper ----------
function renderAvatar(containerEl, avatarVal, nameVal) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  if (avatarVal && (avatarVal.startsWith('/') || avatarVal.startsWith('http') || avatarVal.startsWith('data:'))) {
    const img = document.createElement('img');
    img.src = avatarVal;
    img.alt = nameVal || 'Avatar';
    containerEl.appendChild(img);
  } else if (avatarVal && avatarVal.length <= 5) {
    containerEl.textContent = avatarVal;
  } else {
    const initial = (nameVal && nameVal.length > 0 ? nameVal.charAt(0) : 'U').toUpperCase();
    containerEl.textContent = initial;
  }
}

// ---------- Tab switching ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('login-form').classList.toggle('hidden', btn.dataset.tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', btn.dataset.tab !== 'register');
    authError.classList.add('hidden');
  });
});

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
  
  const card = document.querySelector('.auth-card');
  if (card) {
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both';
  }
}

// ---------- Login / Register ----------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  await authRequest('/auth/login', { email, password });
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  await authRequest('/auth/register', { email, password, username });
});

async function authRequest(path, body) {
  try {
    const payload = {
      deviceId: clientDeviceId,
      deviceName: clientDeviceName,
      ...body,
    };
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'Something went wrong');

    token = data.token;
    userEmail = data.email;
    userName = data.username || (data.email ? data.email.split('@')[0] : 'User');
    userRole = data.role || (data.email === 'admin@filedrop.com' ? 'admin' : 'user');
    userAvatar = data.avatar || null;

    localStorage.setItem('filedrop_token', token);
    localStorage.setItem('filedrop_email', userEmail);
    localStorage.setItem('filedrop_username', userName);
    localStorage.setItem('filedrop_role', userRole);
    if (userAvatar) {
      localStorage.setItem('filedrop_avatar', userAvatar);
    } else {
      localStorage.removeItem('filedrop_avatar');
    }

    if (data.deviceId) {
      linkedDeviceId = data.deviceId;
      linkedDeviceName = data.deviceName || 'Primary Device';
      isDeviceAuthorized = Boolean(data.isLinkedDevice);
    }

    enterDashboard();
  } catch (err) {
    showError('Could not reach the server. Is it running?');
  }
}

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  userEmail = null;
  userName = null;
  userRole = 'user';
  userAvatar = null;
  localStorage.removeItem('filedrop_token');
  localStorage.removeItem('filedrop_email');
  localStorage.removeItem('filedrop_username');
  localStorage.removeItem('filedrop_role');
  localStorage.removeItem('filedrop_avatar');
  dashboard.classList.add('hidden');
  authScreen.classList.remove('hidden');
  showToast('Logged out successfully.', 'info');
});

function updateUserDisplay(name, avatar, role) {
  const displayName = name || userName || (userEmail ? userEmail.split('@')[0] : 'User');
  const activeAvatar = avatar !== undefined ? avatar : userAvatar;
  const activeRole = role || userRole;

  const nameEl = document.getElementById('user-display-name');
  const avatarContainer = document.getElementById('user-avatar-container');
  const adminBadge = document.getElementById('admin-badge');
  const adminControls = document.getElementById('admin-view-controls');
  const manageUsersBtn = document.getElementById('manage-users-btn');
  const filesHeading = document.getElementById('files-heading');

  if (nameEl) nameEl.textContent = displayName;
  if (avatarContainer) renderAvatar(avatarContainer, activeAvatar, displayName);

  const isAdmin = activeRole === 'admin';
  if (adminBadge) adminBadge.classList.toggle('hidden', !isAdmin);
  if (adminControls) adminControls.classList.toggle('hidden', !isAdmin);
  if (manageUsersBtn) manageUsersBtn.classList.toggle('hidden', !isAdmin);
  if (filesHeading) {
    filesHeading.textContent = isAdmin
      ? currentAdminView === 'all'
        ? 'All System Files'
        : 'My Uploads'
      : 'Your Files';
  }
}

let activeNavTab = 'local';
let sessionVaultPassphrase = '';
let cachedVaultFiles = [];
let cachedHostedFiles = [];
let cachedFriends = [];
let myFriendCode = '';
let currentVaultSearchQuery = '';
let evictionTimerInterval = null;

function enterDashboard() {
  authScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  updateUserDisplay(userName, userAvatar, userRole);
  checkDeviceStatus();
  loadFiles();
  loadFriends();
  loadVaultFiles();
  loadHostedFiles();
  startEvictionTicker();
}

// ---------- Admin filter switcher ----------
document.querySelectorAll('.admin-view-controls .filter-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-view-controls .filter-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentAdminView = tab.dataset.view || 'all';
    const filesHeading = document.getElementById('files-heading');
    if (filesHeading) {
      filesHeading.textContent = currentAdminView === 'all' ? 'All System Files' : 'My Uploads';
    }
    loadFiles();
  });
});

// ---------- Drag & drop upload ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  })
);
dropzone.addEventListener('drop', (e) => uploadFiles(e.dataTransfer.files));

function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const formData = new FormData();
  Array.from(fileList).forEach((f) => formData.append('files', f));

  const progressWrap = document.getElementById('upload-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', API + '/files/upload');
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = pct + '%';
      progressLabel.textContent = `Uploading… ${pct}%`;
    }
  };

  xhr.onload = () => {
    progressWrap.classList.add('hidden');
    fileInput.value = '';
    if (xhr.status >= 200 && xhr.status < 300) {
      showToast(`Uploaded ${fileList.length} file(s) successfully! 🚀`);
      loadFiles();
    } else {
      showToast('Upload failed. Please try again.', 'error');
    }
  };

  xhr.onerror = () => {
    progressWrap.classList.add('hidden');
    showToast('Upload failed. Please check your connection.', 'error');
  };

  xhr.send(formData);
}

// ---------- File search & filtering ----------
const fileSearchInput = document.getElementById('file-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

if (fileSearchInput) {
  fileSearchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', currentSearchQuery.length === 0);
    applySearchFilter();
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (fileSearchInput) fileSearchInput.value = '';
    currentSearchQuery = '';
    clearSearchBtn.classList.add('hidden');
    applySearchFilter();
  });
}

function applySearchFilter() {
  const isAdmin = userRole === 'admin';
  if (!currentSearchQuery) {
    renderFiles(cachedFiles, isAdmin);
    return;
  }

  const filtered = cachedFiles.filter((f) => {
    const matchName = f.originalName && f.originalName.toLowerCase().includes(currentSearchQuery);
    const matchType = f.mimetype && f.mimetype.toLowerCase().includes(currentSearchQuery);
    const matchOwnerEmail = f.ownerEmail && f.ownerEmail.toLowerCase().includes(currentSearchQuery);
    const matchOwnerName = f.ownerUsername && f.ownerUsername.toLowerCase().includes(currentSearchQuery);
    return matchName || matchType || matchOwnerEmail || matchOwnerName;
  });

  renderFiles(filtered, isAdmin, true);
}

// ---------- File list ----------
async function loadFiles() {
  try {
    const url =
      userRole === 'admin' ? `${API}/files?view=${currentAdminView}` : `${API}/files`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 401) return logoutForced();
    const data = await res.json();
    cachedFiles = data.files || [];

    if (data.isAdmin) {
      const totalCountEl = document.getElementById('admin-total-files-count');
      if (totalCountEl) totalCountEl.textContent = data.totalCount !== undefined ? data.totalCount : cachedFiles.length;
    }

    applySearchFilter();
  } catch (e) {
    console.error('Error loading files:', e);
  }
}

function logoutForced() {
  token = null;
  userEmail = null;
  userName = null;
  userRole = 'user';
  userAvatar = null;
  localStorage.removeItem('filedrop_token');
  localStorage.removeItem('filedrop_email');
  localStorage.removeItem('filedrop_username');
  localStorage.removeItem('filedrop_role');
  localStorage.removeItem('filedrop_avatar');
  dashboard.classList.add('hidden');
  authScreen.classList.remove('hidden');
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function iconFor(mimetype) {
  if (!mimetype) return '📄';
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype.startsWith('video/')) return '🎞️';
  if (mimetype.startsWith('audio/')) return '🎵';
  if (mimetype.includes('pdf')) return '📕';
  if (mimetype.includes('zip') || mimetype.includes('compressed')) return '🗜️';
  return '📄';
}

function renderFiles(files, isAdmin, isSearching = false) {
  const list = document.getElementById('file-list');
  const empty = document.getElementById('empty-state');
  const searchEmpty = document.getElementById('search-empty-state');
  list.innerHTML = '';

  if (!files || files.length === 0) {
    if (isSearching && cachedFiles.length > 0) {
      if (searchEmpty) searchEmpty.classList.remove('hidden');
      if (empty) empty.classList.add('hidden');
    } else {
      if (empty) empty.classList.remove('hidden');
      if (searchEmpty) searchEmpty.classList.add('hidden');
    }
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (searchEmpty) searchEmpty.classList.add('hidden');

  files.forEach((f, index) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    // Set CSS custom variable for staggered entrance animation
    row.style.setProperty('--i', index);

    // Show owner tag if admin is viewing
    let ownerHtml = '';
    if (isAdmin) {
      const ownerLabel = f.isMine
        ? 'You'
        : escapeHtml(f.ownerEmail || f.ownerUsername || 'User');
      ownerHtml = `<span class="file-owner-chip ${f.isMine ? 'owner-self' : ''}">👤 ${ownerLabel}</span>`;
    }

    row.innerHTML = `
      <div class="file-meta">
        <span class="file-icon">${iconFor(f.mimetype)}</span>
        <div>
          <div class="file-name" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</div>
          <div class="file-sub">
            <span>${formatSize(f.size)}</span>
            <span>·</span>
            <span>${new Date(f.uploadedAt).toLocaleDateString()}</span>
            ${ownerHtml}
          </div>
        </div>
      </div>
      <div class="file-actions">
        <button data-action="download" title="Download file">⬇️ Download</button>
        <button data-action="share" title="Generate share link">🔗 Share</button>
        <button data-action="delete" title="Delete file">🗑️ Delete</button>
      </div>
    `;
    row.querySelector('[data-action="download"]').addEventListener('click', () => downloadFile(f.id));
    row.querySelector('[data-action="share"]').addEventListener('click', () => openShareModal(f.id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteFile(f.id));
    list.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return '-';
  }
}

function downloadFile(id) {
  showToast('Starting file download…', 'info');
  fetch(API + `/files/${id}/download`, { headers: { Authorization: 'Bearer ' + token } })
    .then((res) => {
      if (!res.ok) throw new Error('Download failed');
      return res.blob().then((blob) => {
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="(.+)"/);
        const filename = match ? match[1] : 'download';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Download started successfully! 💾');
      });
    })
    .catch(() => showToast('Could not download this file.', 'error'));
}

async function deleteFile(id) {
  if (!confirm('Delete this file? This cannot be undone.')) return;
  try {
    const res = await fetch(API + `/files/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (res.ok) {
      showToast('File deleted successfully.');
      loadFiles();
    } else {
      showToast('Failed to delete file.', 'error');
    }
  } catch (e) {
    showToast('Failed to delete file.', 'error');
  }
}

// ---------- Profile Modal & Avatar Management ----------
const profileModal = document.getElementById('profile-modal');
const profileBtn = document.getElementById('profile-btn');
const closeProfileModalBtn = document.getElementById('close-profile-modal-btn');
const closeProfileXBtn = document.getElementById('close-profile-x-btn');
const profileForm = document.getElementById('profile-form');
const profileUsernameInput = document.getElementById('profile-username-input');
const profileEmailInput = document.getElementById('profile-email-input');
const modalAvatarContainer = document.getElementById('modal-avatar-container');
const modalProfileUsernameHeading = document.getElementById('modal-profile-username-heading');
const modalProfileEmail = document.getElementById('modal-profile-email');
const modalRoleBadge = document.getElementById('modal-role-badge');
const statFileCount = document.getElementById('stat-file-count');
const statStorageUsed = document.getElementById('stat-storage-used');
const statMemberSince = document.getElementById('stat-member-since');
const profileMsg = document.getElementById('profile-msg');

const avatarFileInput = document.getElementById('avatar-file-input');
const avatarCameraBtn = document.getElementById('avatar-camera-btn');
const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
const presetAvatarBtn = document.getElementById('preset-avatar-btn');
const removeAvatarBtn = document.getElementById('remove-avatar-btn');
const presetAvatarDrawer = document.getElementById('preset-avatar-drawer');

if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
if (closeProfileXBtn) closeProfileXBtn.addEventListener('click', closeProfileModal);

if (profileModal) {
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) closeProfileModal();
  });
}

// Trigger file input for photo upload
if (avatarCameraBtn) avatarCameraBtn.addEventListener('click', () => avatarFileInput.click());
if (uploadAvatarBtn) uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());

// Handle file chosen
if (avatarFileInput) {
  avatarFileInput.addEventListener('change', async () => {
    if (!avatarFileInput.files || avatarFileInput.files.length === 0) return;
    const file = avatarFileInput.files[0];
    const formData = new FormData();
    formData.append('avatar', file);

    profileMsg.textContent = 'Uploading photo…';
    profileMsg.className = 'profile-msg';
    profileMsg.classList.remove('hidden');

    try {
      const res = await fetch(API + '/auth/profile/avatar', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        profileMsg.textContent = data.error || 'Failed to upload photo';
        profileMsg.className = 'profile-msg error';
      } else {
        userAvatar = data.avatar;
        localStorage.setItem('filedrop_avatar', userAvatar);
        renderAvatar(modalAvatarContainer, userAvatar, userName);
        updateUserDisplay(userName, userAvatar, userRole);

        profileMsg.textContent = '✓ Profile photo updated!';
        profileMsg.className = 'profile-msg success';
        showToast('Profile photo updated! 📸');
      }
    } catch (err) {
      profileMsg.textContent = 'Error uploading photo';
      profileMsg.className = 'profile-msg error';
    }
    avatarFileInput.value = '';
  });
}

// Toggle preset avatar drawer
if (presetAvatarBtn) {
  presetAvatarBtn.addEventListener('click', () => {
    if (presetAvatarDrawer) presetAvatarDrawer.classList.toggle('hidden');
  });
}

// Handle preset choice click
document.querySelectorAll('.preset-choice').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const selectedPreset = btn.dataset.preset;
    if (!selectedPreset) return;

    try {
      const res = await fetch(API + '/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ avatar: selectedPreset }),
      });
      const data = await res.json();
      if (res.ok) {
        userAvatar = selectedPreset;
        localStorage.setItem('filedrop_avatar', userAvatar);
        renderAvatar(modalAvatarContainer, userAvatar, userName);
        updateUserDisplay(userName, userAvatar, userRole);
        if (presetAvatarDrawer) presetAvatarDrawer.classList.add('hidden');

        profileMsg.textContent = `✓ Avatar set to ${selectedPreset}!`;
        profileMsg.className = 'profile-msg success';
        profileMsg.classList.remove('hidden');
        showToast(`Avatar set to ${selectedPreset}! ✨`);
      }
    } catch (err) {
      console.error(err);
    }
  });
});

// Remove custom photo
if (removeAvatarBtn) {
  removeAvatarBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(API + '/auth/profile/avatar', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        userAvatar = null;
        localStorage.removeItem('filedrop_avatar');
        renderAvatar(modalAvatarContainer, null, userName);
        updateUserDisplay(userName, null, userRole);

        profileMsg.textContent = '✓ Profile photo removed';
        profileMsg.className = 'profile-msg success';
        profileMsg.classList.remove('hidden');
        showToast('Profile photo removed.');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

async function openProfileModal() {
  profileMsg.className = 'profile-msg hidden';
  profileMsg.textContent = '';
  if (presetAvatarDrawer) presetAvatarDrawer.classList.add('hidden');

  // Compute file statistics
  const totalFiles = cachedFiles.length;
  const totalBytes = cachedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  statFileCount.textContent = totalFiles;
  statStorageUsed.textContent = formatSize(totalBytes);

  try {
    const res = await fetch(API + '/auth/profile', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      const data = await res.json();
      userName = data.username;
      userEmail = data.email;
      userRole = data.role || 'user';
      userAvatar = data.avatar || null;

      localStorage.setItem('filedrop_username', userName);
      localStorage.setItem('filedrop_email', userEmail);
      localStorage.setItem('filedrop_role', userRole);
      if (userAvatar) localStorage.setItem('filedrop_avatar', userAvatar);

      profileUsernameInput.value = data.username;
      profileEmailInput.value = data.email;
      modalProfileUsernameHeading.textContent = data.username;
      modalProfileEmail.textContent = data.email;

      if (modalRoleBadge) {
        modalRoleBadge.textContent = data.role === 'admin' ? 'Administrator 👑' : 'User';
        modalRoleBadge.className = `role-pill ${data.role === 'admin' ? 'role-admin' : ''}`;
      }

      renderAvatar(modalAvatarContainer, userAvatar, userName);
      statMemberSince.textContent = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'N/A';
    } else {
      profileUsernameInput.value = userName || '';
      profileEmailInput.value = userEmail || '';
    }
  } catch (err) {
    profileUsernameInput.value = userName || '';
    profileEmailInput.value = userEmail || '';
  }

  profileModal.classList.remove('hidden');
}

function closeProfileModal() {
  if (profileModal) profileModal.classList.add('hidden');
  if (presetAvatarDrawer) presetAvatarDrawer.classList.add('hidden');
}

if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = profileUsernameInput.value.trim();
    if (!newUsername) return;

    const saveBtn = document.getElementById('save-profile-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const res = await fetch(API + '/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await res.json();

      if (!res.ok) {
        profileMsg.textContent = data.error || 'Failed to update profile';
        profileMsg.className = 'profile-msg error';
        profileMsg.classList.remove('hidden');
      } else {
        userName = data.user.username;
        localStorage.setItem('filedrop_username', userName);
        updateUserDisplay(userName, userAvatar, userRole);

        modalProfileUsernameHeading.textContent = userName;
        renderAvatar(modalAvatarContainer, userAvatar, userName);

        profileMsg.textContent = '✓ Profile updated successfully!';
        profileMsg.className = 'profile-msg success';
        profileMsg.classList.remove('hidden');
        showToast('Profile updated! ✨');

        setTimeout(() => {
          closeProfileModal();
        }, 1000);
      }
    } catch (err) {
      profileMsg.textContent = 'Network error while updating profile.';
      profileMsg.className = 'profile-msg error';
      profileMsg.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

// ---------- ADMIN USER MANAGEMENT MODAL ----------
const manageUsersBtn = document.getElementById('manage-users-btn');
const adminUsersModal = document.getElementById('admin-users-modal');
const closeUsersModalBtn = document.getElementById('close-users-modal-btn');
const closeUsersXBtn = document.getElementById('close-users-x-btn');
const adminUsersList = document.getElementById('admin-users-list');
const usersLoadingState = document.getElementById('users-loading-state');

if (manageUsersBtn) manageUsersBtn.addEventListener('click', openAdminUsersModal);
if (closeUsersModalBtn) closeUsersModalBtn.addEventListener('click', closeAdminUsersModal);
if (closeUsersXBtn) closeUsersXBtn.addEventListener('click', closeAdminUsersModal);

if (adminUsersModal) {
  adminUsersModal.addEventListener('click', (e) => {
    if (e.target === adminUsersModal) closeAdminUsersModal();
  });
}

async function openAdminUsersModal() {
  adminUsersModal.classList.remove('hidden');
  adminUsersList.innerHTML = '';
  usersLoadingState.classList.remove('hidden');

  try {
    const res = await fetch(API + '/auth/users', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    usersLoadingState.classList.add('hidden');

    if (!res.ok) {
      adminUsersList.innerHTML = `<p class="error-msg">${data.error || 'Failed to load users'}</p>`;
      return;
    }

    renderAdminUsersList(data.users);
  } catch (err) {
    usersLoadingState.classList.add('hidden');
    adminUsersList.innerHTML = `<p class="error-msg">Could not reach the server.</p>`;
  }
}

function closeAdminUsersModal() {
  if (adminUsersModal) adminUsersModal.classList.add('hidden');
}

function renderAdminUsersList(users) {
  adminUsersList.innerHTML = '';
  if (!users || users.length === 0) {
    adminUsersList.innerHTML = '<p class="empty-state">No users registered.</p>';
    return;
  }

  users.forEach((u, index) => {
    const row = document.createElement('div');
    row.className = `admin-user-row ${u.isSelf ? 'is-self' : ''}`;
    row.style.setProperty('--i', index);

    const avatarHtml = u.avatar && (u.avatar.startsWith('/') || u.avatar.startsWith('http'))
      ? `<img src="${u.avatar}" alt="${escapeHtml(u.username)}" />`
      : (u.avatar || (u.username ? u.username.charAt(0).toUpperCase() : 'U'));

    row.innerHTML = `
      <div class="user-meta-left">
        <div class="user-row-avatar">${avatarHtml}</div>
        <div class="user-row-details">
          <div class="user-row-name-wrap">
            <span class="user-row-name">${escapeHtml(u.username)}</span>
            <span class="role-pill ${u.role === 'admin' ? 'role-admin' : ''}">${u.role}</span>
            ${u.isSelf ? '<span class="role-pill">You</span>' : ''}
          </div>
          <span class="user-row-email">${escapeHtml(u.email)}</span>
          <div class="user-row-stats">
            <span>📁 ${u.fileCount} file(s)</span>
            <span>·</span>
            <span>💾 ${formatSize(u.storageUsed)}</span>
            <span>·</span>
            <span>📅 ${new Date(u.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <div class="user-row-actions">
        <button class="user-action-btn" data-action="reset-pwd" data-user-id="${u.id}" data-user-email="${escapeHtml(u.email)}" data-user-name="${escapeHtml(u.username)}">🔑 Reset Password</button>
        ${
          u.isSelf
            ? ''
            : `<button class="user-action-btn danger-action" data-action="delete-user" data-user-id="${u.id}" data-user-email="${escapeHtml(u.email)}">🗑️ Delete</button>`
        }
      </div>
    `;

    // Password reset click
    row.querySelector('[data-action="reset-pwd"]').addEventListener('click', () => {
      openAdminResetModal(u.id, u.email, u.username);
    });

    // Delete user click
    const deleteBtn = row.querySelector('[data-action="delete-user"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        handleAdminDeleteUser(u.id, u.email);
      });
    }

    adminUsersList.appendChild(row);
  });
}

async function handleAdminDeleteUser(id, email) {
  if (!confirm(`Are you sure you want to permanently delete user account "${email}" and ALL their uploaded files?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(API + `/auth/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete user', 'error');
    } else {
      showToast(data.message || 'User deleted successfully');
      openAdminUsersModal(); // Reload user list
      loadFiles(); // Reload files list to reflect deleted files
    }
  } catch (err) {
    showToast('Error connecting to server.', 'error');
  }
}

// ---------- ADMIN RESET PASSWORD MODAL ----------
const adminResetModal = document.getElementById('admin-reset-modal');
const closeResetXBtn = document.getElementById('close-reset-x-btn');
const closeResetModalBtn = document.getElementById('close-reset-modal-btn');
const resetUserTargetEmail = document.getElementById('reset-user-target-email');
const adminResetPwdForm = document.getElementById('admin-reset-pwd-form');
const adminNewPasswordInput = document.getElementById('admin-new-password-input');
const adminResetMsg = document.getElementById('admin-reset-msg');
let activeResetTargetUserId = null;

if (closeResetXBtn) closeResetXBtn.addEventListener('click', closeAdminResetModal);
if (closeResetModalBtn) closeResetModalBtn.addEventListener('click', closeAdminResetModal);

if (adminResetModal) {
  adminResetModal.addEventListener('click', (e) => {
    if (e.target === adminResetModal) closeAdminResetModal();
  });
}

function openAdminResetModal(userId, userEmail, userUsername) {
  activeResetTargetUserId = userId;
  resetUserTargetEmail.textContent = `${userUsername} (${userEmail})`;
  adminNewPasswordInput.value = '';
  adminResetMsg.className = 'profile-msg hidden';
  adminResetMsg.textContent = '';
  adminResetModal.classList.remove('hidden');
}

function closeAdminResetModal() {
  if (adminResetModal) adminResetModal.classList.add('hidden');
}

if (adminResetPwdForm) {
  adminResetPwdForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = adminNewPasswordInput.value;
    if (!newPassword || newPassword.length < 6) {
      adminResetMsg.textContent = 'Password must be at least 6 characters.';
      adminResetMsg.className = 'profile-msg error';
      adminResetMsg.classList.remove('hidden');
      return;
    }

    const submitBtn = document.getElementById('submit-reset-pwd-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';

    try {
      const res = await fetch(API + `/auth/users/${activeResetTargetUserId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        adminResetMsg.textContent = data.error || 'Failed to update password';
        adminResetMsg.className = 'profile-msg error';
        adminResetMsg.classList.remove('hidden');
      } else {
        adminResetMsg.textContent = '✓ ' + (data.message || 'Password updated successfully!');
        adminResetMsg.className = 'profile-msg success';
        adminResetMsg.classList.remove('hidden');
        showToast('User password updated successfully! 🔑');

        setTimeout(() => {
          closeAdminResetModal();
        }, 1000);
      }
    } catch (err) {
      adminResetMsg.textContent = 'Network error while updating password.';
      adminResetMsg.className = 'profile-msg error';
      adminResetMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Set New Password';
    }
  });
}

// ---------- Share modal ----------
const shareModal = document.getElementById('share-modal');
const shareLinkInput = document.getElementById('share-link-input');
let activeShareFileId = null;

async function openShareModal(id) {
  activeShareFileId = id;
  const res = await fetch(API + `/files/${id}/share`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = await res.json();
  shareLinkInput.value = window.location.origin + data.path;
  shareModal.classList.remove('hidden');
}

document.getElementById('copy-link-btn').addEventListener('click', () => {
  shareLinkInput.select();
  navigator.clipboard.writeText(shareLinkInput.value);
  const btn = document.getElementById('copy-link-btn');
  btn.textContent = 'Copied!';
  showToast('Share link copied to clipboard! 📋');
  setTimeout(() => (btn.textContent = 'Copy'), 1500);
});

document.getElementById('revoke-link-btn').addEventListener('click', async () => {
  if (!activeShareFileId) return;
  await fetch(API + `/files/${activeShareFileId}/unshare`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  });
  shareModal.classList.add('hidden');
  showToast('Share link revoked.');
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
  shareModal.classList.add('hidden');
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (profileModal && !profileModal.classList.contains('hidden')) closeProfileModal();
    if (adminUsersModal && !adminUsersModal.classList.contains('hidden')) closeAdminUsersModal();
    if (adminResetModal && !adminResetModal.classList.contains('hidden')) closeAdminResetModal();
    if (shareModal && !shareModal.classList.contains('hidden')) shareModal.classList.add('hidden');
    if (addFriendModal && !addFriendModal.classList.contains('hidden')) closeAddFriendModal();
    if (quotaModal && !quotaModal.classList.contains('hidden')) closeQuotaModal();
    if (evictionModal && !evictionModal.classList.contains('hidden')) closeEvictionModal();
    if (decryptModal && !decryptModal.classList.contains('hidden')) closeDecryptModal();
  }
});

// ==========================================================================
// FRIEND VAULT & ZERO-KNOWLEDGE DISTRIBUTED STORAGE MODULE
// ==========================================================================

// ---------- Navigation Tab Switcher ----------
document.querySelectorAll('#main-nav-tabs .nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#main-nav-tabs .nav-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeNavTab = tab.dataset.nav || 'local';

    const viewLocal = document.getElementById('view-local');
    const viewVault = document.getElementById('view-vault');
    const viewFriends = document.getElementById('view-friends');

    if (viewLocal) viewLocal.classList.toggle('hidden', activeNavTab !== 'local');
    if (viewVault) viewVault.classList.toggle('hidden', activeNavTab !== 'vault');
    if (viewFriends) viewFriends.classList.toggle('hidden', activeNavTab !== 'friends');

    if (activeNavTab === 'local') {
      loadFiles();
    } else if (activeNavTab === 'vault') {
      loadVaultFiles();
      loadFriends();
    } else if (activeNavTab === 'friends') {
      loadFriends();
      loadHostedFiles();
    }
  });
});

// ---------- Vault Passphrase Visibility & Session Cache ----------
const toggleVaultPwdBtn = document.getElementById('toggle-vault-pwd-btn');
const vaultPassphraseInput = document.getElementById('vault-passphrase-input');
if (toggleVaultPwdBtn && vaultPassphraseInput) {
  toggleVaultPwdBtn.addEventListener('click', () => {
    const isPwd = vaultPassphraseInput.type === 'password';
    vaultPassphraseInput.type = isPwd ? 'text' : 'password';
    toggleVaultPwdBtn.textContent = isPwd ? '🙈' : '👁️';
  });
  vaultPassphraseInput.addEventListener('input', () => {
    sessionVaultPassphrase = vaultPassphraseInput.value;
  });
}

// ---------- Friend Selector & Quota Display ----------
const vaultFriendSelect = document.getElementById('vault-friend-select');
const vaultHostQuotaHint = document.getElementById('vault-host-quota-hint');

if (vaultFriendSelect) {
  vaultFriendSelect.addEventListener('change', () => {
    const selectedFriendId = vaultFriendSelect.value;
    const friend = cachedFriends.find((f) => f.friend.id === selectedFriendId);
    if (friend && vaultHostQuotaHint) {
      const remainingBytes = Math.max(0, (friend.quotaOtherGaveBytes || 0) - (friend.spaceIUsesOnFriendDevice || 0));
      vaultHostQuotaHint.textContent = `Quota available: ${formatSize(remainingBytes)} of ${formatSize(friend.quotaOtherGaveBytes)}`;
    }
  });
}

function populateFriendSelector() {
  if (!vaultFriendSelect) return;
  const currentVal = vaultFriendSelect.value;
  vaultFriendSelect.innerHTML = '';

  if (cachedFriends.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = 'No connected friends yet — connect a friend first';
    vaultFriendSelect.appendChild(opt);
    if (vaultHostQuotaHint) vaultHostQuotaHint.textContent = 'Connect a friend in "Friends & Hosting" to share storage.';
    return;
  }

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.disabled = true;
  defaultOpt.selected = !currentVal;
  defaultOpt.textContent = 'Choose friend host…';
  vaultFriendSelect.appendChild(defaultOpt);

  cachedFriends.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.friend.id;
    const remainingBytes = Math.max(0, (f.quotaOtherGaveBytes || 0) - (f.spaceIUsesOnFriendDevice || 0));
    opt.textContent = `${f.friend.username || f.friend.email} (${formatSize(remainingBytes)} free)`;
    if (f.friend.id === currentVal) opt.selected = true;
    vaultFriendSelect.appendChild(opt);
  });

  if (vaultFriendSelect.value) {
    vaultFriendSelect.dispatchEvent(new Event('change'));
  }
}

// ---------- Friend Vault Deposit (Zero-Knowledge AES-256 Upload) ----------
const vaultDropzone = document.getElementById('vault-dropzone');
const vaultFileInput = document.getElementById('vault-file-input');

if (vaultDropzone && vaultFileInput) {
  vaultDropzone.addEventListener('click', () => vaultFileInput.click());
  vaultFileInput.addEventListener('change', () => uploadToFriendVault(vaultFileInput.files));

  ['dragenter', 'dragover'].forEach((evt) =>
    vaultDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      vaultDropzone.classList.add('drag-over');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    vaultDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      vaultDropzone.classList.remove('drag-over');
    })
  );
  vaultDropzone.addEventListener('drop', (e) => uploadToFriendVault(e.dataTransfer.files));
}

async function uploadToFriendVault(fileList) {
  if (!fileList || fileList.length === 0) return;
  const file = fileList[0];

  const hostFriendId = vaultFriendSelect ? vaultFriendSelect.value : '';
  if (!hostFriendId) {
    showToast('Please select a connected friend host from the dropdown', 'error');
    return;
  }

  const passphrase = (vaultPassphraseInput && vaultPassphraseInput.value ? vaultPassphraseInput.value : sessionVaultPassphrase).trim();
  if (!passphrase || passphrase.length < 4) {
    showToast('Please enter a secret Vault Passphrase (min 4 characters) to encrypt your file', 'error');
    if (vaultPassphraseInput) vaultPassphraseInput.focus();
    return;
  }
  sessionVaultPassphrase = passphrase;

  const progressWrap = document.getElementById('vault-upload-progress');
  const progressFill = document.getElementById('vault-progress-fill');
  const progressLabel = document.getElementById('vault-progress-label');

  try {
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '20%';
    progressLabel.textContent = '🔒 Encrypting with AES-256-GCM in browser…';

    // Pure Zero-Knowledge Client-Side Encryption
    const { encryptedBlob } = await VaultCrypto.encryptFile(file, passphrase);

    progressFill.style.width = '45%';
    progressLabel.textContent = '⬆️ Uploading scrambled encrypted blob to friend…';

    const formData = new FormData();
    formData.append('vaultFile', encryptedBlob, 'vault_chunk.enc');
    formData.append('hostFriendId', hostFriendId);
    formData.append('encryptedMetaHint', file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/vault/upload');
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = 45 + Math.round((e.loaded / e.total) * 50);
        progressFill.style.width = pct + '%';
        progressLabel.textContent = `⬆️ Uploading to friend… ${Math.round((e.loaded / e.total) * 100)}%`;
      }
    };

    xhr.onload = () => {
      progressWrap.classList.add('hidden');
      if (vaultFileInput) vaultFileInput.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        const resData = JSON.parse(xhr.responseText);
        showToast(resData.message || 'File encrypted and stored safely in your friend\'s vault! 🛡️');
        loadVaultFiles();
        loadFriends();
      } else {
        let err = 'Upload failed';
        try { err = JSON.parse(xhr.responseText).error || err; } catch (e) {}
        showToast(err, 'error');
      }
    };

    xhr.onerror = () => {
      progressWrap.classList.add('hidden');
      showToast('Network error while depositing to friend vault.', 'error');
    };

    xhr.send(formData);
  } catch (err) {
    progressWrap.classList.add('hidden');
    showToast('Encryption error: ' + err.message, 'error');
  }
}

// ---------- Load and Render Remote Vault Files ----------
async function loadVaultFiles() {
  try {
    const res = await fetch(API + '/vault/my-vaults', {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) return logoutForced();
    const data = await res.json();
    cachedVaultFiles = data.files || [];

    const countBadge = document.getElementById('vault-files-count-badge');
    if (countBadge) countBadge.textContent = `${cachedVaultFiles.length} file${cachedVaultFiles.length === 1 ? '' : 's'}`;

    renderVaultFiles(cachedVaultFiles);
    checkAndRenderEvictionAlerts(cachedVaultFiles);
  } catch (err) {
    console.error('Error loading vault files:', err);
  }
}

function renderVaultFiles(files) {
  const container = document.getElementById('vault-file-list');
  const emptyState = document.getElementById('vault-empty-state');
  const searchEmptyState = document.getElementById('vault-search-empty-state');
  if (!container) return;

  container.innerHTML = '';

  const q = (currentVaultSearchQuery || '').toLowerCase();
  const filtered = files.filter((f) => {
    const hint = (f.encryptedMetaHint || '').toLowerCase();
    const hostName = ((f.host && (f.host.username || f.host.email)) || '').toLowerCase();
    return hint.includes(q) || hostName.includes(q);
  });

  if (files.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (searchEmptyState) searchEmptyState.classList.add('hidden');
    return;
  }

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.add('hidden');
    if (searchEmptyState) searchEmptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (searchEmptyState) searchEmptyState.classList.add('hidden');

  filtered.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'file-row vault-row';
    row.dataset.fileId = f.id;

    // Determine status badge & styling
    let statusPillHtml = '';
    if (f.status === 'stored') {
      statusPillHtml = `<span class="status-pill active-stored">🛡️ Encrypted AES-256</span>`;
    } else if (f.status === 'pending_approval') {
      statusPillHtml = `<span class="status-pill pending-approval">⏳ Awaiting Host Approval</span>`;
    } else if (f.status === 'eviction_requested') {
      const deadlineStr = f.eviction && f.eviction.deadline ? f.eviction.deadline : '';
      statusPillHtml = `<span class="status-pill eviction-warning" data-deadline="${deadlineStr}">⚠️ Eviction Notice</span>`;
    } else if (f.status === 'expired') {
      statusPillHtml = `<span class="status-pill expired">⛔ Expired / Evicted</span>`;
    }

    const hostName = (f.host && (f.host.username || f.host.email)) || 'Friend';
    const displayName = f.encryptedMetaHint || 'Encrypted Vault Blob';

    row.innerHTML = `
      <div class="file-meta">
        <span class="file-icon">🛡️</span>
        <div class="file-info">
          <div class="file-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
          <div class="file-sub">
            <span class="host-badge-chip">🏠 Hosted on ${escapeHtml(hostName)}</span>
            <span>•</span>
            <span>${formatSize(f.size)}</span>
            <span>•</span>
            <span>${formatDate(f.uploadedAt)}</span>
            <span>•</span>
            ${statusPillHtml}
          </div>
        </div>
      </div>
      <div class="file-actions">
        ${f.status !== 'expired' ? `<button class="primary-btn" data-action="decrypt" title="Download & Decrypt locally">🔓 Decrypt & Download</button>` : ''}
        <button class="ghost-btn" data-action="delete-vault" title="Remove file from friend's storage">🗑️ Delete</button>
      </div>
    `;

    // Hook buttons
    const decryptBtn = row.querySelector('[data-action="decrypt"]');
    if (decryptBtn) {
      decryptBtn.addEventListener('click', () => downloadAndDecryptVaultFile(f.id));
    }

    const deleteBtn = row.querySelector('[data-action="delete-vault"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Remove this file from ${hostName}'s device storage?`)) {
          await deleteVaultFile(f.id);
        }
      });
    }

    container.appendChild(row);
  });
}

// ---------- Decrypt and Download Workflow ----------
let pendingDecryptFileId = null;

const decryptModal = document.getElementById('decrypt-prompt-modal');
const decryptForm = document.getElementById('decrypt-prompt-form');
const decryptPassphraseInput = document.getElementById('decrypt-passphrase-input');
const toggleDecryptPwdBtn = document.getElementById('toggle-decrypt-pwd-btn');
const decryptErrorMsg = document.getElementById('decrypt-error-msg');
const decryptRememberChk = document.getElementById('decrypt-remember-session-chk');

if (toggleDecryptPwdBtn && decryptPassphraseInput) {
  toggleDecryptPwdBtn.addEventListener('click', () => {
    const isPwd = decryptPassphraseInput.type === 'password';
    decryptPassphraseInput.type = isPwd ? 'text' : 'password';
    toggleDecryptPwdBtn.textContent = isPwd ? '🙈' : '👁️';
  });
}

function openDecryptModal(fileId) {
  pendingDecryptFileId = fileId;
  if (decryptPassphraseInput) {
    decryptPassphraseInput.value = sessionVaultPassphrase || '';
  }
  if (decryptErrorMsg) decryptErrorMsg.classList.add('hidden');
  if (decryptModal) decryptModal.classList.remove('hidden');
  if (decryptPassphraseInput) decryptPassphraseInput.focus();
}

function closeDecryptModal() {
  if (decryptModal) decryptModal.classList.add('hidden');
  pendingDecryptFileId = null;
}

const closeDecryptXBtn = document.getElementById('close-decrypt-x-btn');
const closeDecryptModalBtn = document.getElementById('close-decrypt-modal-btn');
if (closeDecryptXBtn) closeDecryptXBtn.addEventListener('click', closeDecryptModal);
if (closeDecryptModalBtn) closeDecryptModalBtn.addEventListener('click', closeDecryptModal);

if (decryptForm) {
  decryptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingDecryptFileId) return;
    const pwd = (decryptPassphraseInput ? decryptPassphraseInput.value : '').trim();
    if (!pwd) return;

    if (decryptRememberChk && decryptRememberChk.checked) {
      sessionVaultPassphrase = pwd;
      if (vaultPassphraseInput) vaultPassphraseInput.value = pwd;
    }

    const targetId = pendingDecryptFileId;
    closeDecryptModal();
    await executeDownloadAndDecrypt(targetId, pwd);
  });
}

async function downloadAndDecryptVaultFile(fileId) {
  const pwd = sessionVaultPassphrase || (vaultPassphraseInput ? vaultPassphraseInput.value : '');
  if (!pwd) {
    openDecryptModal(fileId);
    return;
  }
  await executeDownloadAndDecrypt(fileId, pwd);
}

async function executeDownloadAndDecrypt(fileId, passphrase) {
  showToast('Fetching encrypted chunk & decrypting with AES-256… 🔒', 'info', 4000);

  try {
    const res = await fetch(API + `/vault/files/${fileId}/download`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      let errText = 'Download failed';
      try { const errJson = await res.json(); errText = errJson.error || errText; } catch (e) {}
      throw new Error(errText);
    }

    const arrayBuffer = await res.arrayBuffer();
    const { blob, originalName } = await VaultCrypto.decryptVaultBuffer(arrayBuffer, passphrase);

    // Instant browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    showToast(`Successfully decrypted & downloaded "${originalName}"! 🎉`, 'success', 4000);
  } catch (err) {
    showToast('Decryption Error: ' + err.message, 'error', 5000);
    openDecryptModal(fileId);
    if (decryptErrorMsg) {
      decryptErrorMsg.textContent = err.message;
      decryptErrorMsg.classList.remove('hidden');
    }
  }
}

async function deleteVaultFile(fileId) {
  try {
    const res = await fetch(API + `/vault/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete file');

    showToast('File removed from friend vault.');
    loadVaultFiles();
    loadFriends();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Eviction Alerts & Live Countdown Ticker ----------
function checkAndRenderEvictionAlerts(vaultFiles) {
  const globalBanner = document.getElementById('global-eviction-banner');
  const vaultNoticeContainer = document.getElementById('vault-eviction-notices-container');
  const alertBadge = document.getElementById('vault-alert-badge');

  const evictionFiles = vaultFiles.filter((f) => f.status === 'eviction_requested');

  if (alertBadge) {
    if (evictionFiles.length > 0) {
      alertBadge.textContent = evictionFiles.length;
      alertBadge.classList.remove('hidden');
    } else {
      alertBadge.classList.add('hidden');
    }
  }

  if (evictionFiles.length === 0) {
    if (globalBanner) {
      globalBanner.innerHTML = '';
      globalBanner.classList.add('hidden');
    }
    if (vaultNoticeContainer) vaultNoticeContainer.innerHTML = '';
    return;
  }

  // Render urgent banner
  if (globalBanner) {
    globalBanner.innerHTML = '';
    globalBanner.classList.remove('hidden');

    evictionFiles.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'eviction-alert-card';
      const hostName = f.host.username || f.host.email || 'Friend';
      const fileName = f.encryptedMetaHint || 'Stored File';
      const reason = f.eviction && f.eviction.reason ? `Reason: "${f.eviction.reason}"` : '';

      card.innerHTML = `
        <div class="eviction-alert-left">
          <span class="eviction-alert-icon">⚠️</span>
          <div class="eviction-alert-text">
            <h4>Storage Eviction Notice from ${escapeHtml(hostName)}</h4>
            <p>Friend needs storage space back for <strong>${escapeHtml(fileName)}</strong>. ${escapeHtml(reason)}</p>
            <div style="margin-top: 6px;">
              <span>Time remaining: </span>
              <span class="countdown-clock" data-deadline="${f.eviction.deadline}">Calculating…</span>
            </div>
          </div>
        </div>
        <div class="eviction-alert-actions">
          <button class="primary-btn" onclick="downloadAndDecryptVaultFile('${f.id}')">🔓 Download & Save Now</button>
        </div>
      `;
      globalBanner.appendChild(card);
    });
  }

  tickEvictionTimers();
}

function tickEvictionTimers() {
  const clockElements = document.querySelectorAll('.countdown-clock, .status-pill.eviction-warning');
  const now = Date.now();

  clockElements.forEach((el) => {
    const deadlineStr = el.dataset.deadline;
    if (!deadlineStr) return;

    const deadlineTime = new Date(deadlineStr).getTime();
    const diff = deadlineTime - now;

    if (diff <= 0) {
      el.textContent = '⚠️ Eviction Expired (Ready to Purge)';
      el.style.color = '#ef4444';
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      let text = '';
      if (days > 0) text += `${days}d `;
      if (hours > 0 || days > 0) text += `${hours}h `;
      text += `${minutes}m ${seconds}s remaining`;

      if (el.classList.contains('countdown-clock')) {
        el.textContent = `⏳ ${text}`;
      } else {
        el.textContent = `⚠️ Evicting in ${text}`;
      }
    }
  });
}

function startEvictionTicker() {
  if (evictionTimerInterval) clearInterval(evictionTimerInterval);
  evictionTimerInterval = setInterval(tickEvictionTimers, 1000);
}

// ---------- Search Filter for Vault Files ----------
const vaultSearchInput = document.getElementById('vault-search-input');
if (vaultSearchInput) {
  vaultSearchInput.addEventListener('input', (e) => {
    currentVaultSearchQuery = e.target.value.trim();
    renderVaultFiles(cachedVaultFiles);
  });
}

// ---------- Friends & Storage Hosting Management Module ----------

async function loadFriends() {
  try {
    const res = await fetch(API + '/vault/friends', {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) return logoutForced();
    const data = await res.json();

    myFriendCode = data.myFriendCode || '';
    const myCodeEl = document.getElementById('my-friend-code-val');
    if (myCodeEl) myCodeEl.textContent = myFriendCode;

    cachedFriends = data.acceptedFriends || [];
    const incomingReqs = data.incomingRequests || [];

    // Update Friend Requests Badge
    const reqBadge = document.getElementById('friend-requests-badge');
    if (reqBadge) {
      if (incomingReqs.length > 0) {
        reqBadge.textContent = incomingReqs.length;
        reqBadge.classList.remove('hidden');
      } else {
        reqBadge.classList.add('hidden');
      }
    }

    // Populate Friend Selector in Vault Deposit
    populateFriendSelector();

    // Render Stats
    renderStorageStats(data);

    // Render Incoming Requests
    renderIncomingRequests(incomingReqs);

    // Render Friends List
    renderFriendsList(cachedFriends);
  } catch (err) {
    console.error('Error loading friends:', err);
  }
}

// Render Storage Shared Gauges
function renderStorageStats(data) {
  const hostedFill = document.getElementById('hosted-storage-fill');
  const hostedLabel = document.getElementById('hosted-storage-label');
  const remoteFill = document.getElementById('remote-storage-fill');
  const remoteLabel = document.getElementById('remote-storage-label');

  const friends = data.acceptedFriends || [];

  // Total storage I allocated to all friends
  const totalQuotaIGave = friends.reduce((sum, f) => sum + (f.quotaIGaveBytes || 0), 0);
  const totalSpaceFriendsUse = friends.reduce((sum, f) => sum + (f.spaceFriendUsesOnMyDevice || 0), 0);

  // Total storage all friends gave to me
  const totalQuotaFriendsGave = friends.reduce((sum, f) => sum + (f.quotaOtherGaveBytes || 0), 0);
  const totalSpaceIUse = friends.reduce((sum, f) => sum + (f.spaceIUsesOnFriendDevice || 0), 0);

  if (hostedLabel) hostedLabel.textContent = `${formatSize(totalSpaceFriendsUse)} used / ${formatSize(totalQuotaIGave)} allocated`;
  if (hostedFill) {
    const pct = totalQuotaIGave > 0 ? Math.min(100, Math.round((totalSpaceFriendsUse / totalQuotaIGave) * 100)) : 0;
    hostedFill.style.width = pct + '%';
  }

  if (remoteLabel) remoteLabel.textContent = `${formatSize(totalSpaceIUse)} used / ${formatSize(totalQuotaFriendsGave)} available`;
  if (remoteFill) {
    const pct = totalQuotaFriendsGave > 0 ? Math.min(100, Math.round((totalSpaceIUse / totalQuotaFriendsGave) * 100)) : 0;
    remoteFill.style.width = pct + '%';
  }
}

// Render Incoming Friend Requests
function renderIncomingRequests(requests) {
  const reqSection = document.getElementById('incoming-requests-section');
  const reqCount = document.getElementById('incoming-req-count');
  const reqList = document.getElementById('incoming-requests-list');
  if (!reqSection || !reqList) return;

  if (requests.length === 0) {
    reqSection.classList.add('hidden');
    return;
  }

  reqSection.classList.remove('hidden');
  if (reqCount) reqCount.textContent = requests.length;
  reqList.innerHTML = '';

  requests.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'incoming-req-row';
    const friendName = r.friend.username || r.friend.email || 'User';

    row.innerHTML = `
      <div class="incoming-req-user">
        <div class="user-avatar" id="req-avatar-${r.friendshipId}"></div>
        <div>
          <strong>${escapeHtml(friendName)}</strong>
          <div class="hint">${escapeHtml(r.friend.email)} • Code: ${escapeHtml(r.friend.friendCode || '')}</div>
        </div>
      </div>
      <div class="file-actions">
        <button class="primary-btn" data-action="accept-req">✓ Accept</button>
        <button class="ghost-btn" data-action="reject-req">✕ Decline</button>
      </div>
    `;

    const avatarContainer = row.querySelector(`#req-avatar-${r.friendshipId}`);
    if (avatarContainer) renderAvatar(avatarContainer, r.friend.avatar, friendName);

    row.querySelector('[data-action="accept-req"]').addEventListener('click', async () => {
      await acceptFriendRequest(r.friendshipId);
    });
    row.querySelector('[data-action="reject-req"]').addEventListener('click', async () => {
      await rejectFriendRequest(r.friendshipId);
    });

    reqList.appendChild(row);
  });
}

// Render Friends List
function renderFriendsList(friends) {
  const container = document.getElementById('friends-list-container');
  const emptyState = document.getElementById('friends-empty-state');
  const countPill = document.getElementById('friends-count-pill');
  if (!container) return;

  container.innerHTML = '';
  if (countPill) countPill.textContent = `${friends.length} Friend${friends.length === 1 ? '' : 's'}`;

  if (friends.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  friends.forEach((f) => {
    const card = document.createElement('div');
    card.className = 'friend-item-card';
    const friendName = f.friend.username || f.friend.email || 'Friend';

    card.innerHTML = `
      <div class="friend-card-left">
        <div class="user-avatar" id="friend-avatar-${f.friendshipId}"></div>
        <div class="friend-info-block">
          <h4>${escapeHtml(friendName)}</h4>
          <div class="friend-meta-line">
            <span>Code: <strong>${escapeHtml(f.friend.friendCode || 'FD-XXXX')}</strong></span>
            <span>•</span>
            <span>Allocated Quota: <strong>${formatSize(f.quotaIGaveBytes)}</strong></span>
            <span>•</span>
            <span>Using: <strong>${formatSize(f.spaceFriendUsesOnMyDevice)}</strong></span>
          </div>
        </div>
      </div>
      <div class="friend-card-right">
        <button class="mini-btn" data-action="manage-quota">⚙️ Quota</button>
        <button class="mini-btn danger-text" data-action="remove-friend" title="Disconnect friendship">✕</button>
      </div>
    `;

    const avatarContainer = card.querySelector(`#friend-avatar-${f.friendshipId}`);
    if (avatarContainer) renderAvatar(avatarContainer, f.friend.avatar, friendName);

    card.querySelector('[data-action="manage-quota"]').addEventListener('click', () => {
      openQuotaModal(f);
    });

    card.querySelector('[data-action="remove-friend"]').addEventListener('click', async () => {
      if (confirm(`Remove connection with ${friendName}?`)) {
        await rejectFriendRequest(f.friendshipId);
      }
    });

    container.appendChild(card);
  });
}

// ---------- Hosted Files List (Zero-Knowledge Stored on My Hard Drive) ----------
async function loadHostedFiles() {
  try {
    const res = await fetch(API + '/vault/hosted-files', {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) return logoutForced();
    const data = await res.json();
    cachedHostedFiles = data.files || [];

    const countPill = document.getElementById('hosted-files-count-pill');
    if (countPill) countPill.textContent = `${cachedHostedFiles.length} Blob${cachedHostedFiles.length === 1 ? '' : 's'}`;

    renderHostedFiles(cachedHostedFiles);
  } catch (err) {
    console.error('Error loading hosted files:', err);
  }
}

function renderHostedFiles(files) {
  const container = document.getElementById('hosted-files-list-container');
  const emptyState = document.getElementById('hosted-files-empty-state');
  if (!container) return;

  container.innerHTML = '';
  if (files.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  files.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'hosted-blob-row';
    const ownerName = (f.owner && (f.owner.username || f.owner.email)) || 'Friend';

    let statusPill = '';
    let actionButtons = '';

    if (f.status === 'stored') {
      statusPill = `<span class="status-pill active-stored">🟢 Stored Active</span>`;
      actionButtons = `<button class="mini-btn warning-action-btn" data-action="evict">⚠️ Request Space Back (Evict)</button>`;
    } else if (f.status === 'pending_approval') {
      statusPill = `<span class="status-pill pending-approval">⏳ Pending Approval</span>`;
      actionButtons = `
        <button class="mini-btn" data-action="accept-deposit">✓ Accept</button>
        <button class="mini-btn danger-text" data-action="reject-deposit">✕ Reject</button>
      `;
    } else if (f.status === 'eviction_requested') {
      const deadlineStr = f.eviction ? f.eviction.deadline : '';
      statusPill = `<span class="status-pill eviction-warning" data-deadline="${deadlineStr}">⚠️ Eviction Notice Active</span>`;
      actionButtons = `
        <button class="mini-btn" data-action="cancel-evict">Cancel Notice</button>
        <button class="mini-btn danger-text" data-action="purge-file">🗑️ Purge If Expired</button>
      `;
    } else if (f.status === 'expired') {
      statusPill = `<span class="status-pill expired">⛔ Expired</span>`;
      actionButtons = `<button class="mini-btn danger-btn" data-action="purge-file">🗑️ Purge File</button>`;
    }

    row.innerHTML = `
      <div class="hosted-blob-left">
        <div class="user-avatar" id="hosted-owner-avatar-${f.id}"></div>
        <div>
          <div class="blob-code-tag">🔒 ${escapeHtml(f.blobRef)}</div>
          <div class="file-sub">
            <span>Owner: <strong>${escapeHtml(ownerName)}</strong></span>
            <span>•</span>
            <span>Size: <strong>${formatSize(f.size)}</strong></span>
            <span>•</span>
            <span>${formatDate(f.uploadedAt)}</span>
            <span>•</span>
            ${statusPill}
          </div>
        </div>
      </div>
      <div class="hosted-blob-actions">
        ${actionButtons}
      </div>
    `;

    const avatarContainer = row.querySelector(`#hosted-owner-avatar-${f.id}`);
    if (avatarContainer) renderAvatar(avatarContainer, f.owner.avatar, ownerName);

    // Eviction Action
    const evictBtn = row.querySelector('[data-action="evict"]');
    if (evictBtn) evictBtn.addEventListener('click', () => openEvictionModal(f.id));

    // Cancel Eviction
    const cancelEvictBtn = row.querySelector('[data-action="cancel-evict"]');
    if (cancelEvictBtn) {
      cancelEvictBtn.addEventListener('click', async () => {
        await cancelEvictionNotice(f.id);
      });
    }

    // Purge File Action
    const purgeBtn = row.querySelector('[data-action="purge-file"]');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', async () => {
        await purgeHostedFile(f.id);
      });
    }

    // Respond Deposit Actions
    const acceptDepositBtn = row.querySelector('[data-action="accept-deposit"]');
    if (acceptDepositBtn) {
      acceptDepositBtn.addEventListener('click', async () => {
        await respondToDeposit(f.id, 'accept');
      });
    }

    const rejectDepositBtn = row.querySelector('[data-action="reject-deposit"]');
    if (rejectDepositBtn) {
      rejectDepositBtn.addEventListener('click', async () => {
        await respondToDeposit(f.id, 'reject');
      });
    }

    container.appendChild(row);
  });
}

// ---------- Friend Action Handlers ----------
async function acceptFriendRequest(friendshipId) {
  try {
    const res = await fetch(API + `/vault/friends/${friendshipId}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to accept');
    showToast('Friend request accepted! 🤝');
    loadFriends();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function rejectFriendRequest(friendshipId) {
  try {
    const res = await fetch(API + `/vault/friends/${friendshipId}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reject');
    showToast('Friend request removed.');
    loadFriends();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function cancelEvictionNotice(fileId) {
  try {
    const res = await fetch(API + `/vault/files/${fileId}/cancel-eviction`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel eviction');
    showToast('Eviction notice cancelled.');
    loadHostedFiles();
    loadFriends();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function purgeHostedFile(fileId) {
  try {
    const res = await fetch(API + `/vault/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to purge file');
    showToast('File purged from device storage.');
    loadHostedFiles();
    loadFriends();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function respondToDeposit(fileId, action) {
  try {
    const res = await fetch(API + `/vault/requests/${fileId}/respond`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast(data.message || 'Updated');
    loadHostedFiles();
    loadFriends();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---------- Modals: Add Friend, Manage Quota, Issue Eviction ----------

// 1. Add Friend Modal
const addFriendModal = document.getElementById('add-friend-modal');
const openAddFriendBtn = document.getElementById('open-add-friend-btn');
const closeAddFriendXBtn = document.getElementById('close-add-friend-x-btn');
const closeAddFriendModalBtn = document.getElementById('close-add-friend-modal-btn');
const addFriendForm = document.getElementById('add-friend-form');
const friendSearchInput = document.getElementById('friend-search-input');
const addFriendMsg = document.getElementById('add-friend-msg');
const copyFriendCodeBtn = document.getElementById('copy-friend-code-btn');

if (copyFriendCodeBtn) {
  copyFriendCodeBtn.addEventListener('click', () => {
    if (myFriendCode) {
      navigator.clipboard.writeText(myFriendCode);
      showToast(`Copied Friend Code: ${myFriendCode} 📋`);
    }
  });
}

function openAddFriendModal() {
  if (friendSearchInput) friendSearchInput.value = '';
  if (addFriendMsg) addFriendMsg.classList.add('hidden');
  if (addFriendModal) addFriendModal.classList.remove('hidden');
  if (friendSearchInput) friendSearchInput.focus();
}

function closeAddFriendModal() {
  if (addFriendModal) addFriendModal.classList.add('hidden');
}

const quickConnectFriendBtn = document.getElementById('quick-connect-friend-btn');
if (openAddFriendBtn) openAddFriendBtn.addEventListener('click', openAddFriendModal);
if (quickConnectFriendBtn) quickConnectFriendBtn.addEventListener('click', openAddFriendModal);
if (closeAddFriendXBtn) closeAddFriendXBtn.addEventListener('click', closeAddFriendModal);
if (closeAddFriendModalBtn) closeAddFriendModalBtn.addEventListener('click', closeAddFriendModal);

if (addFriendForm) {
  addFriendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = (friendSearchInput ? friendSearchInput.value : '').trim();
    if (!query) return;

    try {
      const res = await fetch(API + '/vault/friends/request', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send request');

      showToast(data.message || 'Friend request sent! 🚀');
      closeAddFriendModal();
      loadFriends();
    } catch (err) {
      if (addFriendMsg) {
        addFriendMsg.textContent = err.message;
        addFriendMsg.className = 'profile-msg error';
        addFriendMsg.classList.remove('hidden');
      }
    }
  });
}

// 2. Manage Quota Modal
const quotaModal = document.getElementById('quota-modal');
const closeQuotaXBtn = document.getElementById('close-quota-x-btn');
const closeQuotaModalBtn = document.getElementById('close-quota-modal-btn');
const quotaSettingsForm = document.getElementById('quota-settings-form');
const quotaFriendshipIdInput = document.getElementById('quota-friendship-id');
const quotaGbInput = document.getElementById('quota-gb-input');
const quotaAutoAcceptInput = document.getElementById('quota-auto-accept-input');
const quotaTargetFriendName = document.getElementById('quota-target-friend-name');
const quotaMsg = document.getElementById('quota-msg');

function openQuotaModal(friendship) {
  if (quotaFriendshipIdInput) quotaFriendshipIdInput.value = friendship.friendshipId;
  const fName = friendship.friend.username || friendship.friend.email || 'Friend';
  if (quotaTargetFriendName) quotaTargetFriendName.textContent = fName;
  if (quotaGbInput) quotaGbInput.value = (friendship.quotaIGaveBytes / (1024 ** 3)).toFixed(1);
  if (quotaAutoAcceptInput) quotaAutoAcceptInput.checked = Boolean(friendship.autoAcceptIGave);
  if (quotaMsg) quotaMsg.classList.add('hidden');
  if (quotaModal) quotaModal.classList.remove('hidden');
}

function closeQuotaModal() {
  if (quotaModal) quotaModal.classList.add('hidden');
}

if (closeQuotaXBtn) closeQuotaXBtn.addEventListener('click', closeQuotaModal);
if (closeQuotaModalBtn) closeQuotaModalBtn.addEventListener('click', closeQuotaModal);

if (quotaSettingsForm) {
  quotaSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const friendshipId = quotaFriendshipIdInput.value;
    const quotaGb = parseFloat(quotaGbInput.value);
    const autoAccept = quotaAutoAcceptInput.checked;

    try {
      const res = await fetch(API + `/vault/friends/${friendshipId}/settings`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ quotaGb, autoAccept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      showToast('Storage quota updated successfully!');
      closeQuotaModal();
      loadFriends();
    } catch (err) {
      if (quotaMsg) {
        quotaMsg.textContent = err.message;
        quotaMsg.className = 'profile-msg error';
        quotaMsg.classList.remove('hidden');
      }
    }
  });
}

// 3. Issue Eviction Notice Modal
const evictionModal = document.getElementById('eviction-modal');
const closeEvictionXBtn = document.getElementById('close-eviction-x-btn');
const closeEvictionModalBtn = document.getElementById('close-eviction-modal-btn');
const evictionForm = document.getElementById('eviction-form');
const evictionTargetFileId = document.getElementById('eviction-target-file-id');
const evictionGraceSelect = document.getElementById('eviction-grace-period-select');
const evictionReasonInput = document.getElementById('eviction-reason-input');
const evictionMsg = document.getElementById('eviction-msg');

function openEvictionModal(fileId) {
  if (evictionTargetFileId) evictionTargetFileId.value = fileId;
  if (evictionReasonInput) evictionReasonInput.value = '';
  if (evictionMsg) evictionMsg.classList.add('hidden');
  if (evictionModal) evictionModal.classList.remove('hidden');
}

function closeEvictionModal() {
  if (evictionModal) evictionModal.classList.add('hidden');
}

if (closeEvictionXBtn) closeEvictionXBtn.addEventListener('click', closeEvictionModal);
if (closeEvictionModalBtn) closeEvictionModalBtn.addEventListener('click', closeEvictionModal);

if (evictionForm) {
  evictionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileId = evictionTargetFileId.value;
    const graceVal = evictionGraceSelect ? evictionGraceSelect.value : '7d';
    const reason = evictionReasonInput ? evictionReasonInput.value.trim() : '';

    const payload = { reason };
    if (graceVal === '2m') payload.gracePeriodMinutes = 2;
    else if (graceVal === '24h') payload.gracePeriodHours = 24;
    else if (graceVal === '3d') payload.gracePeriodDays = 3;
    else payload.gracePeriodDays = 7;

    try {
      const res = await fetch(API + `/vault/files/${fileId}/evict`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue eviction');

      showToast(data.message || 'Eviction notice issued successfully!');
      closeEvictionModal();
      loadHostedFiles();
      loadFriends();
    } catch (err) {
      if (evictionMsg) {
        evictionMsg.textContent = err.message;
        evictionMsg.className = 'profile-msg error';
        evictionMsg.classList.remove('hidden');
      }
    }
  });
}

// ---------- 4. Device Binding & Management Module ----------
const deviceBtn = document.getElementById('device-btn');
const deviceDisplayName = document.getElementById('device-display-name');
const deviceIndicatorDot = document.getElementById('device-indicator-dot');
const deviceModal = document.getElementById('device-modal');
const closeDeviceXBtn = document.getElementById('close-device-x-btn');
const closeDeviceModalBtn = document.getElementById('close-device-modal-btn');
const modalLinkedDeviceName = document.getElementById('modal-linked-device-name');
const modalDeviceStatusSub = document.getElementById('modal-device-status-sub');
const modalDeviceBadge = document.getElementById('modal-device-badge');
const deviceNameInput = document.getElementById('device-name-input');
const renameDeviceForm = document.getElementById('rename-device-form');
const renameDeviceMsg = document.getElementById('rename-device-msg');
const transferDeviceForm = document.getElementById('transfer-device-form');
const transferDeviceNameInput = document.getElementById('transfer-device-name-input');
const transferPasswordInput = document.getElementById('transfer-password-input');
const transferDeviceMsg = document.getElementById('transfer-device-msg');
const openTransferDeviceBtn = document.getElementById('open-transfer-device-btn');
const vaultDeviceBlockedBanner = document.getElementById('vault-device-blocked-banner');
const blockedLinkedDeviceName = document.getElementById('blocked-linked-device-name');

async function checkDeviceStatus() {
  if (!token) return;
  try {
    const res = await fetch(API + '/auth/device-info', {
      headers: getAuthHeaders(),
    });
    if (res.status === 401) return logoutForced();
    const data = await res.json();

    linkedDeviceId = data.deviceId;
    linkedDeviceName = data.deviceName || 'Primary Device';
    isDeviceAuthorized = Boolean(data.isLinkedDevice);

    if (deviceDisplayName) {
      deviceDisplayName.textContent = clientDeviceName + (!isDeviceAuthorized ? ' (Blocked)' : '');
    }

    if (deviceIndicatorDot) {
      deviceIndicatorDot.className = 'device-indicator-dot' + (!isDeviceAuthorized ? ' mismatch' : '');
    }

    if (vaultDeviceBlockedBanner) {
      vaultDeviceBlockedBanner.classList.toggle('hidden', isDeviceAuthorized);
      if (blockedLinkedDeviceName) blockedLinkedDeviceName.textContent = linkedDeviceName;
    }
  } catch (err) {
    console.warn('Could not check device status:', err);
  }
}

function openDeviceModal() {
  if (!deviceModal) return;
  if (modalLinkedDeviceName) modalLinkedDeviceName.textContent = linkedDeviceName;
  if (deviceNameInput) deviceNameInput.value = clientDeviceName;
  if (transferDeviceNameInput) transferDeviceNameInput.value = clientDeviceName;
  if (transferPasswordInput) transferPasswordInput.value = '';
  if (renameDeviceMsg) renameDeviceMsg.classList.add('hidden');
  if (transferDeviceMsg) transferDeviceMsg.classList.add('hidden');

  if (modalDeviceBadge && modalDeviceStatusSub) {
    if (isDeviceAuthorized) {
      modalDeviceBadge.className = 'device-match-badge match-yes';
      modalDeviceBadge.textContent = '✓ Linked & Active';
      modalDeviceStatusSub.textContent = `This "${clientDeviceName}" is your authorized Friend Vault device.`;
    } else {
      modalDeviceBadge.className = 'device-match-badge match-no';
      modalDeviceBadge.textContent = '⛔ Mismatch / Blocked';
      modalDeviceStatusSub.textContent = `Storage Vault is locked to "${linkedDeviceName}". Transfer binding below to use this device.`;
    }
  }

  deviceModal.classList.remove('hidden');
}

function closeDeviceModal() {
  if (deviceModal) deviceModal.classList.add('hidden');
}

if (deviceBtn) deviceBtn.addEventListener('click', openDeviceModal);
if (closeDeviceXBtn) closeDeviceXBtn.addEventListener('click', closeDeviceModal);
if (closeDeviceModalBtn) closeDeviceModalBtn.addEventListener('click', closeDeviceModal);
if (openTransferDeviceBtn) openTransferDeviceBtn.addEventListener('click', openDeviceModal);

if (renameDeviceForm) {
  renameDeviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = (deviceNameInput.value || '').trim();
    if (!newName) return;

    try {
      const res = await fetch(API + '/auth/device-name', {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ deviceName: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rename device');

      clientDeviceName = newName;
      localStorage.setItem('filedrop_device_name', newName);
      linkedDeviceName = newName;
      if (deviceDisplayName) deviceDisplayName.textContent = newName;

      showToast('Device name updated! 💻');
      if (renameDeviceMsg) {
        renameDeviceMsg.textContent = 'Device name updated successfully.';
        renameDeviceMsg.className = 'profile-msg success';
        renameDeviceMsg.classList.remove('hidden');
      }
      setTimeout(closeDeviceModal, 1200);
    } catch (err) {
      if (renameDeviceMsg) {
        renameDeviceMsg.textContent = err.message;
        renameDeviceMsg.className = 'profile-msg error';
        renameDeviceMsg.classList.remove('hidden');
      }
    }
  });
}

if (transferDeviceForm) {
  transferDeviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newDeviceName = (transferDeviceNameInput.value || '').trim() || clientDeviceName;
    const password = transferPasswordInput.value;

    try {
      const res = await fetch(API + '/auth/transfer-device', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          newDeviceId: clientDeviceId,
          newDeviceName,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to transfer device binding');

      clientDeviceName = data.deviceName || newDeviceName;
      localStorage.setItem('filedrop_device_name', clientDeviceName);
      linkedDeviceId = data.deviceId;
      linkedDeviceName = clientDeviceName;
      isDeviceAuthorized = true;

      if (deviceDisplayName) deviceDisplayName.textContent = clientDeviceName;
      if (deviceIndicatorDot) deviceIndicatorDot.className = 'device-indicator-dot';
      if (vaultDeviceBlockedBanner) vaultDeviceBlockedBanner.classList.add('hidden');

      showToast(data.message || 'Vault successfully linked to this device! 🎉');
      closeDeviceModal();
      loadVaultFiles();
      loadFriends();
      loadHostedFiles();
    } catch (err) {
      if (transferDeviceMsg) {
        transferDeviceMsg.textContent = err.message;
        transferDeviceMsg.className = 'profile-msg error';
        transferDeviceMsg.classList.remove('hidden');
      }
    }
  });
}

// ---------- Google Sign-In Integration ----------
let googleClientId = null;

async function initGoogleAuth() {
  try {
    const res = await fetch(API + '/auth/google/config');
    const data = await res.json();
    googleClientId = data.clientId;

    const btnSlot = document.getElementById('google-signin-btn');
    const fallbackBtn = document.getElementById('google-fallback-btn');

    if (googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
      if (fallbackBtn) fallbackBtn.classList.add('hidden');
      if (btnSlot) btnSlot.classList.remove('hidden');

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      if (btnSlot) {
        btnSlot.innerHTML = '';
        window.google.accounts.id.renderButton(btnSlot, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          width: 320,
          text: 'continue_with',
          logo_alignment: 'left',
        });
      }
    } else {
      // Show styled custom button
      if (btnSlot) btnSlot.classList.add('hidden');
      if (fallbackBtn) {
        fallbackBtn.classList.remove('hidden');
        fallbackBtn.onclick = () => {
          if (!googleClientId) {
            showError('Google Sign-In is configured! Please add GOOGLE_CLIENT_ID to your .env or Render/Railway settings to enable one-click login.');
          } else if (window.google && window.google.accounts && window.google.accounts.id) {
            window.google.accounts.id.prompt();
          }
        };
      }
    }
  } catch (err) {
    console.warn('Could not initialize Google Auth:', err);
  }
}

async function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) {
    showError('Google authentication failed. Please try again.');
    return;
  }
  showToast('Signing in with Google...', 'info');
  await authRequest('/auth/google', { credential: response.credential });
}

// Retry Google init if SDK loaded after app script
window.addEventListener('load', () => {
  initGoogleAuth();
  // Double check after 1s in case Google script loaded slowly
  setTimeout(initGoogleAuth, 1000);
});

// ---------- Init ----------
if (token) {
  enterDashboard();
} else {
  initGoogleAuth();
}
