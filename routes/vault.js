const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const VAULT_DIR = path.join(__dirname, '..', 'uploads', 'vault');
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

const vaultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VAULT_DIR),
  filename: (req, file, cb) => {
    const blobName = 'vault_' + uuidv4() + '.enc';
    cb(null, blobName);
  },
});

const upload = multer({
  storage: vaultStorage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB per encrypted vault chunk
});

// Helper: Ensure user has a friendCode
function getFriendCode(user) {
  if (user.friendCode) return user.friendCode;
  const cleanId = (user.id || '').replace(/-/g, '').substring(0, 6).toUpperCase();
  return 'FD-' + (cleanId || Math.random().toString(36).substring(2, 8).toUpperCase());
}

// Helper: Get user public info
function getUserSummary(user) {
  if (!user) return { id: null, username: 'Unknown', email: '', avatar: null, friendCode: '', deviceName: '' };
  return {
    id: user.id,
    username: user.username || user.email.split('@')[0],
    email: user.email,
    avatar: user.avatar || null,
    friendCode: getFriendCode(user),
    deviceName: user.deviceName || 'Primary Device',
  };
}

// Middleware: Verify that user is operating from their linked authorized device
function requireLinkedDevice(req, res, next) {
  const users = db.getUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const clientDeviceId = req.headers['x-device-id'] || req.query.deviceId;

  // Auto-link if first device
  if (!user.deviceId && clientDeviceId) {
    user.deviceId = clientDeviceId;
    user.deviceName = req.headers['x-device-name'] || 'Primary Device';
    user.deviceLinkedAt = new Date().toISOString();
    db.saveUsers(users);
    return next();
  }

  // Enforce device match
  if (user.deviceId && clientDeviceId && user.deviceId !== clientDeviceId) {
    return res.status(403).json({
      error: `Device Restriction: This account's storage vault is linked to "${user.deviceName || 'Primary Device'}". You can only manage and host friend files from that specific device.`,
      isDeviceBlocked: true,
      linkedDeviceName: user.deviceName || 'Primary Device',
    });
  }

  next();
}

router.use(requireAuth);
router.use(requireLinkedDevice);

// -------------------------------------------------------------
// 1. FRIEND MANAGEMENT
// -------------------------------------------------------------

// List friends, pending requests, and storage quotas
router.get('/friends', requireAuth, (req, res) => {
  const currentUserId = req.user.id;
  const users = db.getUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const friends = db.getFriends();
  const vaultFiles = db.getVaultFiles();

  // Ensure current user has friendCode saved
  const currentUser = userMap.get(currentUserId);
  if (currentUser && !currentUser.friendCode) {
    currentUser.friendCode = getFriendCode(currentUser);
    db.saveUsers(users);
  }

  const acceptedFriends = [];
  const incomingRequests = [];
  const outgoingRequests = [];

  friends.forEach((f) => {
    const isUserA = f.userA === currentUserId;
    const isUserB = f.userB === currentUserId;
    if (!isUserA && !isUserB) return;

    const otherUserId = isUserA ? f.userB : f.userA;
    const otherUser = userMap.get(otherUserId);
    const otherUserSummary = getUserSummary(otherUser);

    if (f.status === 'accepted') {
      // Storage limits:
      // Quota I gave to other user:
      const quotaIGaveBytes = isUserA ? (f.storageQuotaBytes_A ?? 5 * 1024 * 1024 * 1024) : (f.storageQuotaBytes_B ?? 5 * 1024 * 1024 * 1024);
      const autoAcceptIGave = isUserA ? (f.autoAccept_A ?? true) : (f.autoAccept_B ?? true);

      // Quota other user gave to me:
      const quotaOtherGaveBytes = isUserA ? (f.storageQuotaBytes_B ?? 5 * 1024 * 1024 * 1024) : (f.storageQuotaBytes_A ?? 5 * 1024 * 1024 * 1024);
      const autoAcceptOtherGave = isUserA ? (f.autoAccept_B ?? true) : (f.autoAccept_A ?? true);

      // How much space friend is consuming on my drive:
      const spaceFriendUsesOnMyDevice = vaultFiles
        .filter((v) => v.ownerId === otherUserId && v.hostId === currentUserId && v.status !== 'expired')
        .reduce((sum, v) => sum + (v.size || 0), 0);

      // How much space I am consuming on friend's drive:
      const spaceIUsesOnFriendDevice = vaultFiles
        .filter((v) => v.ownerId === currentUserId && v.hostId === otherUserId && v.status !== 'expired')
        .reduce((sum, v) => sum + (v.size || 0), 0);

      acceptedFriends.push({
        friendshipId: f.id,
        friend: otherUserSummary,
        quotaIGaveBytes,
        spaceFriendUsesOnMyDevice,
        autoAcceptIGave,
        quotaOtherGaveBytes,
        spaceIUsesOnFriendDevice,
        autoAcceptOtherGave,
        createdAt: f.createdAt,
      });
    } else if (f.status === 'pending') {
      if (f.initiatedBy === currentUserId) {
        outgoingRequests.push({
          friendshipId: f.id,
          friend: otherUserSummary,
          createdAt: f.createdAt,
        });
      } else {
        incomingRequests.push({
          friendshipId: f.id,
          friend: otherUserSummary,
          createdAt: f.createdAt,
        });
      }
    }
  });

  res.json({
    myFriendCode: currentUser ? getFriendCode(currentUser) : '',
    acceptedFriends,
    incomingRequests,
    outgoingRequests,
  });
});

// Send Friend Request (by Friend Code, Username, or Email)
router.post('/friends/request', requireAuth, (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Please provide a Friend Code, Username, or Email' });
  }

  const cleanQuery = query.trim().toLowerCase();
  const users = db.getUsers();
  const currentUserId = req.user.id;

  const targetUser = users.find((u) => {
    if (u.id === currentUserId) return false;
    const fCode = (u.friendCode || getFriendCode(u)).toLowerCase();
    const email = (u.email || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    return fCode === cleanQuery || email === cleanQuery || username === cleanQuery;
  });

  if (!targetUser) {
    return res.status(404).json({ error: 'No user found with that Friend Code, Username, or Email' });
  }

  const friends = db.getFriends();
  const existing = friends.find(
    (f) =>
      (f.userA === currentUserId && f.userB === targetUser.id) ||
      (f.userB === currentUserId && f.userA === targetUser.id)
  );

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(400).json({ error: 'You are already connected as friends with this user' });
    }
    if (existing.status === 'pending') {
      if (existing.initiatedBy === currentUserId) {
        return res.status(400).json({ error: 'Friend request already sent and awaiting approval' });
      } else {
        // Auto-accept if target already sent a request
        existing.status = 'accepted';
        existing.acceptedAt = new Date().toISOString();
        db.saveFriends(friends);
        return res.json({ success: true, message: 'Friend request accepted!', friendship: existing });
      }
    }
  }

  const newFriendship = {
    id: uuidv4(),
    userA: currentUserId,
    userB: targetUser.id,
    initiatedBy: currentUserId,
    status: 'pending',
    storageQuotaBytes_A: 5 * 1024 * 1024 * 1024, // 5GB default
    storageQuotaBytes_B: 5 * 1024 * 1024 * 1024,
    autoAccept_A: true,
    autoAccept_B: true,
    createdAt: new Date().toISOString(),
  };

  friends.push(newFriendship);
  db.saveFriends(friends);

  res.json({
    success: true,
    message: `Friend request sent to ${targetUser.username || targetUser.email}!`,
  });
});

// Accept Friend Request
router.post('/friends/:id/accept', requireAuth, (req, res) => {
  const friends = db.getFriends();
  const friendship = friends.find(
    (f) => f.id === req.params.id && (f.userA === req.user.id || f.userB === req.user.id)
  );

  if (!friendship) return res.status(404).json({ error: 'Friendship request not found' });
  if (friendship.status === 'accepted') return res.json({ success: true, message: 'Already accepted' });

  friendship.status = 'accepted';
  friendship.acceptedAt = new Date().toISOString();
  db.saveFriends(friends);

  res.json({ success: true, message: 'Friend request accepted!' });
});

// Reject / Cancel / Remove Friendship
router.post('/friends/:id/reject', requireAuth, (req, res) => {
  const friends = db.getFriends();
  const index = friends.findIndex(
    (f) => f.id === req.params.id && (f.userA === req.user.id || f.userB === req.user.id)
  );

  if (index === -1) return res.status(404).json({ error: 'Friendship not found' });

  friends.splice(index, 1);
  db.saveFriends(friends);

  res.json({ success: true, message: 'Friendship removed' });
});

// Update Storage Quota & Preferences for a Friend
router.put('/friends/:id/settings', requireAuth, (req, res) => {
  const { quotaGb, autoAccept } = req.body;
  const friends = db.getFriends();
  const friendship = friends.find(
    (f) => f.id === req.params.id && (f.userA === req.user.id || f.userB === req.user.id)
  );

  if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

  const isUserA = friendship.userA === req.user.id;
  if (quotaGb !== undefined && !isNaN(Number(quotaGb))) {
    const bytes = Math.max(0.1, Number(quotaGb)) * 1024 * 1024 * 1024;
    if (isUserA) friendship.storageQuotaBytes_A = bytes;
    else friendship.storageQuotaBytes_B = bytes;
  }

  if (autoAccept !== undefined) {
    if (isUserA) friendship.autoAccept_A = Boolean(autoAccept);
    else friendship.autoAccept_B = Boolean(autoAccept);
  }

  db.saveFriends(friends);
  res.json({ success: true, message: 'Storage settings updated successfully' });
});

// -------------------------------------------------------------
// 2. ENCRYPTED VAULT STORAGE (UPLOAD & REMOTE ACCESS)
// -------------------------------------------------------------

// Upload encrypted blob to friend's storage
router.post('/upload', requireAuth, upload.single('vaultFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No encrypted file payload received' });
  }

  const { hostFriendId, encryptedMetaHint } = req.body;
  if (!hostFriendId) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Please select a friend host to store this file' });
  }

  const currentUserId = req.user.id;
  const friends = db.getFriends();
  const friendship = friends.find(
    (f) =>
      f.status === 'accepted' &&
      ((f.userA === currentUserId && f.userB === hostFriendId) ||
        (f.userB === currentUserId && f.userA === hostFriendId))
  );

  if (!friendship) {
    fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'You are not connected as friends with this host' });
  }

  // Verify host's allocated quota for this user
  const isHostUserA = friendship.userA === hostFriendId;
  const hostAllocatedQuota = isHostUserA
    ? (friendship.storageQuotaBytes_A ?? 5 * 1024 * 1024 * 1024)
    : (friendship.storageQuotaBytes_B ?? 5 * 1024 * 1024 * 1024);
  const hostAutoAccept = isHostUserA
    ? (friendship.autoAccept_A ?? true)
    : (friendship.autoAccept_B ?? true);

  const vaultFiles = db.getVaultFiles();
  const currentUsageOnHost = vaultFiles
    .filter((v) => v.ownerId === currentUserId && v.hostId === hostFriendId && v.status !== 'expired')
    .reduce((sum, v) => sum + (v.size || 0), 0);

  if (currentUsageOnHost + req.file.size > hostAllocatedQuota) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({
      error: `Storage quota exceeded. Friend has allocated ${(hostAllocatedQuota / (1024 ** 3)).toFixed(1)} GB. (Currently used: ${(currentUsageOnHost / (1024 ** 3)).toFixed(2)} GB)`,
    });
  }

  const vaultRecord = {
    id: uuidv4(),
    ownerId: currentUserId,
    hostId: hostFriendId,
    storedBlobName: req.file.filename,
    size: req.file.size,
    encryptedMetaHint: encryptedMetaHint || 'Encrypted Vault Object',
    status: hostAutoAccept ? 'stored' : 'pending_approval',
    uploadedAt: new Date().toISOString(),
    eviction: null,
  };

  vaultFiles.push(vaultRecord);
  db.saveVaultFiles(vaultFiles);

  res.json({
    success: true,
    file: vaultRecord,
    message: hostAutoAccept
      ? 'File encrypted and stored safely in your friend\'s vault!'
      : 'File uploaded! Waiting for friend host approval.',
  });
});

// Helper: Check and update expired evictions
function updateExpiredFiles(vaultFiles) {
  let changed = false;
  const now = new Date().getTime();

  vaultFiles.forEach((v) => {
    if (v.status === 'eviction_requested' && v.eviction && v.eviction.deadline) {
      const deadlineTime = new Date(v.eviction.deadline).getTime();
      if (now >= deadlineTime) {
        v.status = 'expired';
        changed = true;
        // Purge stored blob to free friend's disk
        const filePath = path.join(VAULT_DIR, v.storedBlobName);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {}
        }
      }
    }
  });

  if (changed) {
    db.saveVaultFiles(vaultFiles);
  }
}

// Get all files I own that are stored on friends' vaults
router.get('/my-vaults', requireAuth, (req, res) => {
  const currentUserId = req.user.id;
  const vaultFiles = db.getVaultFiles();
  updateExpiredFiles(vaultFiles);

  const users = db.getUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const myFiles = vaultFiles
    .filter((v) => v.ownerId === currentUserId)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .map((v) => {
      const hostUser = userMap.get(v.hostId);
      return {
        id: v.id,
        storedBlobName: v.storedBlobName,
        size: v.size,
        encryptedMetaHint: v.encryptedMetaHint,
        status: v.status,
        uploadedAt: v.uploadedAt,
        eviction: v.eviction,
        host: getUserSummary(hostUser),
      };
    });

  res.json({ files: myFiles });
});

// Get all files I am hosting for friends (Zero-Knowledge: Content and original names are not revealed)
router.get('/hosted-files', requireAuth, (req, res) => {
  const currentUserId = req.user.id;
  const vaultFiles = db.getVaultFiles();
  updateExpiredFiles(vaultFiles);

  const users = db.getUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const hostedFiles = vaultFiles
    .filter((v) => v.hostId === currentUserId)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .map((v) => {
      const ownerUser = userMap.get(v.ownerId);
      return {
        id: v.id,
        size: v.size,
        status: v.status,
        uploadedAt: v.uploadedAt,
        eviction: v.eviction,
        // Shows only obfuscated blob reference and owner profile
        blobRef: 'vault_' + v.id.substring(0, 8) + '.enc',
        owner: getUserSummary(ownerUser),
      };
    });

  res.json({ files: hostedFiles });
});

// Download raw encrypted vault blob (owner only)
router.get('/files/:id/download', requireAuth, (req, res) => {
  const vaultFiles = db.getVaultFiles();
  const file = vaultFiles.find((v) => v.id === req.params.id);

  if (!file) return res.status(404).json({ error: 'Vault file not found' });
  if (file.ownerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the file owner can download this vault chunk' });
  }

  const filePath = path.join(VAULT_DIR, file.storedBlobName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Vault blob file is no longer on disk' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${file.storedBlobName}"`);
  res.sendFile(filePath);
});

// Delete vault file (Owner can delete anytime, Host can delete if expired or pending)
router.delete('/files/:id', requireAuth, (req, res) => {
  const vaultFiles = db.getVaultFiles();
  const file = vaultFiles.find((v) => v.id === req.params.id);

  if (!file) return res.status(404).json({ error: 'Vault file not found' });

  const isOwner = file.ownerId === req.user.id;
  const isHost = file.hostId === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isHost && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to delete this file' });
  }

  // If host tries to delete before deadline and not expired/pending
  if (isHost && !isOwner && !isAdmin && file.status !== 'expired' && file.status !== 'pending_approval') {
    return res.status(400).json({
      error: 'Cannot delete active friend file without issuing an Eviction Request and waiting for grace period.',
    });
  }

  const filePath = path.join(VAULT_DIR, file.storedBlobName);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}
  }

  const filtered = vaultFiles.filter((v) => v.id !== file.id);
  db.saveVaultFiles(filtered);

  res.json({ success: true, message: 'Vault file removed successfully' });
});

// Respond to pending approval request (Host accept or reject)
router.post('/requests/:id/respond', requireAuth, (req, res) => {
  const { action } = req.body; // 'accept' or 'reject'
  const vaultFiles = db.getVaultFiles();
  const file = vaultFiles.find((v) => v.id === req.params.id && v.hostId === req.user.id);

  if (!file) return res.status(404).json({ error: 'Pending vault request not found' });

  if (action === 'accept') {
    file.status = 'stored';
    db.saveVaultFiles(vaultFiles);
    return res.json({ success: true, message: 'Storage request accepted!' });
  } else {
    // Reject & remove blob
    const filePath = path.join(VAULT_DIR, file.storedBlobName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }
    const filtered = vaultFiles.filter((v) => v.id !== file.id);
    db.saveVaultFiles(filtered);
    return res.json({ success: true, message: 'Storage request rejected and discarded.' });
  }
});

// -------------------------------------------------------------
// 3. STORAGE RECLAIM & EVICTION MANAGEMENT (GRACE PERIOD)
// -------------------------------------------------------------

// Host initiates Eviction Request
router.post('/files/:id/evict', requireAuth, (req, res) => {
  const { gracePeriodDays, gracePeriodHours, gracePeriodMinutes, reason } = req.body;
  const vaultFiles = db.getVaultFiles();
  const file = vaultFiles.find((v) => v.id === req.params.id && v.hostId === req.user.id);

  if (!file) return res.status(404).json({ error: 'Hosted file not found' });

  let durationMs = 7 * 24 * 60 * 60 * 1000; // Default 7 days
  let graceText = '7 Days';

  if (gracePeriodMinutes && !isNaN(Number(gracePeriodMinutes))) {
    const mins = Math.max(1, Number(gracePeriodMinutes));
    durationMs = mins * 60 * 1000;
    graceText = `${mins} Minute${mins > 1 ? 's' : ''}`;
  } else if (gracePeriodHours && !isNaN(Number(gracePeriodHours))) {
    const hrs = Math.max(1, Number(gracePeriodHours));
    durationMs = hrs * 60 * 60 * 1000;
    graceText = `${hrs} Hour${hrs > 1 ? 's' : ''}`;
  } else if (gracePeriodDays && !isNaN(Number(gracePeriodDays))) {
    const days = Math.max(1, Number(gracePeriodDays));
    durationMs = days * 24 * 60 * 60 * 1000;
    graceText = `${days} Day${days > 1 ? 's' : ''}`;
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + durationMs);

  file.status = 'eviction_requested';
  file.eviction = {
    requestedAt: now.toISOString(),
    deadline: deadline.toISOString(),
    gracePeriodText: graceText,
    reason: reason || 'Host device requires free storage space',
  };

  db.saveVaultFiles(vaultFiles);

  res.json({
    success: true,
    message: `Eviction notice issued. The owner has ${graceText} to download or relocate the file.`,
    eviction: file.eviction,
  });
});

// Host cancels Eviction Notice
router.post('/files/:id/cancel-eviction', requireAuth, (req, res) => {
  const vaultFiles = db.getVaultFiles();
  const file = vaultFiles.find((v) => v.id === req.params.id && v.hostId === req.user.id);

  if (!file) return res.status(404).json({ error: 'Hosted file not found' });
  if (file.status !== 'eviction_requested') {
    return res.status(400).json({ error: 'No active eviction request on this file' });
  }

  file.status = 'stored';
  file.eviction = null;
  db.saveVaultFiles(vaultFiles);

  res.json({ success: true, message: 'Eviction notice cancelled successfully' });
});

module.exports = router;
