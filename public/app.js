const API = '/api';
let token = localStorage.getItem('filedrop_token');
let userEmail = localStorage.getItem('filedrop_email');
let userName = localStorage.getItem('filedrop_username');
let userRole = localStorage.getItem('filedrop_role') || 'user';
let userAvatar = localStorage.getItem('filedrop_avatar') || null;
let cachedFiles = [];
let currentAdminView = 'all';
let currentSearchQuery = '';

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
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

function enterDashboard() {
  authScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  updateUserDisplay(userName, userAvatar, userRole);
  loadFiles();
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
  }
});

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
