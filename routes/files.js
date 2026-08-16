const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const storedName = uuidv4() + path.extname(file.originalname);
    cb(null, storedName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
});

// Upload one or more files
router.post('/upload', requireAuth, upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files received' });
  }
  const files = db.getFiles();
  const uploaded = req.files.map((f) => {
    const record = {
      id: uuidv4(),
      ownerId: req.user.id,
      originalName: f.originalname,
      storedName: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      uploadedAt: new Date().toISOString(),
      shareToken: null,
    };
    files.push(record);
    return record;
  });
  db.saveFiles(files);
  res.json({ files: uploaded });
});

// List files (Admin sees all files with owner email, regular users see only their own)
router.get('/', requireAuth, (req, res) => {
  const allFiles = db.getFiles();
  const isAdmin = req.user.role === 'admin';
  const view = req.query.view; // 'all' or 'mine'

  let filteredFiles = [];

  if (isAdmin) {
    const users = db.getUsers();
    const userMap = new Map();
    users.forEach((u) => {
      userMap.set(u.id, {
        email: u.email,
        username: u.username || u.email.split('@')[0],
        avatar: u.avatar || null,
      });
    });

    if (view === 'mine') {
      filteredFiles = allFiles.filter((f) => f.ownerId === req.user.id);
    } else {
      filteredFiles = allFiles;
    }

    const filesWithOwners = filteredFiles
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map((f) => {
        const owner = userMap.get(f.ownerId);
        return {
          ...f,
          ownerEmail: owner ? owner.email : 'Unknown User',
          ownerUsername: owner ? owner.username : 'Unknown',
          ownerAvatar: owner ? owner.avatar : null,
          isMine: f.ownerId === req.user.id,
        };
      });

    return res.json({
      files: filesWithOwners,
      isAdmin: true,
      totalCount: allFiles.length,
    });
  }

  // Regular user: ultra-fast isolated lookup
  filteredFiles = allFiles
    .filter((f) => f.ownerId === req.user.id)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  res.json({ files: filteredFiles, isAdmin: false });
});

// Download a file (owner or admin)
router.get('/:id/download', requireAuth, (req, res) => {
  const file = db
    .getFiles()
    .find((f) => f.id === req.params.id && (req.user.role === 'admin' || f.ownerId === req.user.id));
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.download(path.join(UPLOAD_DIR, file.storedName), file.originalName);
});

// Delete a file (owner or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const files = db.getFiles();
  const file = files.find(
    (f) => f.id === req.params.id && (req.user.role === 'admin' || f.ownerId === req.user.id)
  );
  if (!file) return res.status(404).json({ error: 'File not found' });

  fs.unlink(path.join(UPLOAD_DIR, file.storedName), () => {});
  db.saveFiles(files.filter((f) => f.id !== file.id));
  res.json({ success: true });
});

// Create (or fetch existing) share link for a file (owner or admin)
router.post('/:id/share', requireAuth, (req, res) => {
  const files = db.getFiles();
  const file = files.find(
    (f) => f.id === req.params.id && (req.user.role === 'admin' || f.ownerId === req.user.id)
  );
  if (!file) return res.status(404).json({ error: 'File not found' });

  if (!file.shareToken) file.shareToken = uuidv4();
  db.saveFiles(files);
  res.json({ shareToken: file.shareToken, path: `/s/${file.shareToken}` });
});

// Revoke a share link (owner or admin)
router.post('/:id/unshare', requireAuth, (req, res) => {
  const files = db.getFiles();
  const file = files.find(
    (f) => f.id === req.params.id && (req.user.role === 'admin' || f.ownerId === req.user.id)
  );
  if (!file) return res.status(404).json({ error: 'File not found' });

  file.shareToken = null;
  db.saveFiles(files);
  res.json({ success: true });
});

module.exports = router;
