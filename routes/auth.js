const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

// Setup multer for avatar image uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const filename = 'avatar_' + uuidv4() + ext;
    cb(null, filename);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, WebP, GIF) are allowed'));
    }
  },
});

// Ensure default Admin user exists
async function ensureAdminUser() {
  const users = db.getUsers();
  const adminEmail = 'admin@filedrop.com';
  const existingAdmin = users.find((u) => u.email.toLowerCase() === adminEmail.toLowerCase());
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const adminUser = {
      id: uuidv4(),
      email: adminEmail,
      username: 'Admin',
      role: 'admin',
      avatar: '👑',
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.unshift(adminUser);
    db.saveUsers(users);
    console.log(`[FileDrop] Default Admin account created: ${adminEmail} (password: admin123)`);
  } else if (!existingAdmin.role || existingAdmin.role !== 'admin') {
    existingAdmin.role = 'admin';
    db.saveUsers(users);
  }
}
ensureAdminUser();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUsername(username, fallbackEmail) {
  if (username && typeof username === 'string' && username.trim().length > 0) {
    return username.trim();
  }
  return fallbackEmail ? fallbackEmail.split('@')[0] : 'user';
}

router.post('/register', async (req, res) => {
  const { email, password, username, avatar } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const finalUsername = sanitizeUsername(username, email);
  if (finalUsername.length < 2 || finalUsername.length > 30) {
    return res.status(400).json({ error: 'Username must be between 2 and 30 characters' });
  }

  const users = db.getUsers();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  // Check if username is already taken by another user
  if (users.find((u) => (u.username || u.email.split('@')[0]).toLowerCase() === finalUsername.toLowerCase())) {
    return res.status(409).json({ error: 'That username is already taken. Please choose another one.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email,
    username: finalUsername,
    role: 'user',
    avatar: avatar || null,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  db.saveUsers(users);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({
    token,
    email: user.email,
    username: user.username,
    role: user.role,
    avatar: user.avatar,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = db.getUsers();
  const user = users.find(
    (u) =>
      u.email.toLowerCase() === email.toLowerCase() ||
      (u.username && u.username.toLowerCase() === email.toLowerCase())
  );
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const username = user.username || user.email.split('@')[0];
  const role = user.role || (user.email === 'admin@filedrop.com' ? 'admin' : 'user');
  const avatar = user.avatar || null;

  const token = jwt.sign(
    { id: user.id, email: user.email, role, username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, email: user.email, username, role, avatar });
});

// GET profile
router.get('/profile', requireAuth, (req, res) => {
  const users = db.getUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const username = user.username || user.email.split('@')[0];
  const role = user.role || (user.email === 'admin@filedrop.com' ? 'admin' : 'user');
  const avatar = user.avatar || null;

  res.json({
    id: user.id,
    email: user.email,
    username,
    role,
    avatar,
    createdAt: user.createdAt,
  });
});

// UPDATE profile (edit username and/or preset avatar)
router.put('/profile', requireAuth, (req, res) => {
  const { username, avatar } = req.body;

  const users = db.getUsers();
  const userIndex = users.findIndex((u) => u.id === req.user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (username !== undefined) {
    if (typeof username !== 'string') {
      return res.status(400).json({ error: 'Username must be a string' });
    }
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be between 2 and 30 characters' });
    }

    // Check if chosen username is already taken by another user
    const duplicate = users.find(
      (u) =>
        u.id !== req.user.id &&
        (u.username || u.email.split('@')[0]).toLowerCase() === trimmedUsername.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ error: 'Username is already in use by another user' });
    }
    users[userIndex].username = trimmedUsername;
  }

  if (avatar !== undefined) {
    users[userIndex].avatar = avatar;
  }

  db.saveUsers(users);

  res.json({
    success: true,
    user: {
      id: users[userIndex].id,
      email: users[userIndex].email,
      username: users[userIndex].username,
      role: users[userIndex].role || 'user',
      avatar: users[userIndex].avatar || null,
      createdAt: users[userIndex].createdAt,
    },
  });
});

// UPLOAD profile photo
router.post('/profile/avatar', requireAuth, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Avatar upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No avatar image received' });
    }

    const users = db.getUsers();
    const userIndex = users.findIndex((u) => u.id === req.user.id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user already had an uploaded avatar file, try to delete old file
    const oldAvatar = users[userIndex].avatar;
    if (oldAvatar && oldAvatar.startsWith('/avatars/')) {
      const oldFilename = path.basename(oldAvatar);
      const oldPath = path.join(AVATAR_DIR, oldFilename);
      if (fs.existsSync(oldPath)) {
        fs.unlink(oldPath, () => {});
      }
    }

    const avatarUrl = '/avatars/' + req.file.filename;
    users[userIndex].avatar = avatarUrl;
    db.saveUsers(users);

    res.json({ success: true, avatar: avatarUrl });
  });
});

// DELETE / REMOVE profile photo
router.delete('/profile/avatar', requireAuth, (req, res) => {
  const users = db.getUsers();
  const userIndex = users.findIndex((u) => u.id === req.user.id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const oldAvatar = users[userIndex].avatar;
  if (oldAvatar && oldAvatar.startsWith('/avatars/')) {
    const oldFilename = path.basename(oldAvatar);
    const oldPath = path.join(AVATAR_DIR, oldFilename);
    if (fs.existsSync(oldPath)) {
      fs.unlink(oldPath, () => {});
    }
  }

  users[userIndex].avatar = null;
  db.saveUsers(users);

  res.json({ success: true, avatar: null });
});

// ---------- ADMIN USER MANAGEMENT ENDPOINTS ----------

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// GET all users with file stats (Admin only)
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.getUsers();
  const files = db.getFiles();

  const usersWithStats = users.map((u) => {
    const userFiles = files.filter((f) => f.ownerId === u.id);
    const totalStorage = userFiles.reduce((acc, f) => acc + (f.size || 0), 0);

    return {
      id: u.id,
      email: u.email,
      username: u.username || u.email.split('@')[0],
      role: u.role || (u.email === 'admin@filedrop.com' ? 'admin' : 'user'),
      avatar: u.avatar || null,
      createdAt: u.createdAt,
      fileCount: userFiles.length,
      storageUsed: totalStorage,
      isSelf: u.id === req.user.id,
    };
  });

  res.json({ users: usersWithStats });
});

// DELETE a user account and cleanup their files (Admin only)
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own active admin account.' });
  }

  const users = db.getUsers();
  const userToDelete = users.find((u) => u.id === targetId);
  if (!userToDelete) {
    return res.status(404).json({ error: 'User account not found' });
  }

  // 1. Remove all files uploaded by this user
  const files = db.getFiles();
  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
  const userFiles = files.filter((f) => f.ownerId === targetId);

  userFiles.forEach((f) => {
    const filePath = path.join(UPLOAD_DIR, f.storedName);
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  });

  // Save remaining files
  const remainingFiles = files.filter((f) => f.ownerId !== targetId);
  db.saveFiles(remainingFiles);

  // 2. Remove avatar if uploaded file
  if (userToDelete.avatar && userToDelete.avatar.startsWith('/avatars/')) {
    const avatarPath = path.join(AVATAR_DIR, path.basename(userToDelete.avatar));
    if (fs.existsSync(avatarPath)) {
      fs.unlink(avatarPath, () => {});
    }
  }

  // 3. Remove user from users database
  const remainingUsers = users.filter((u) => u.id !== targetId);
  db.saveUsers(remainingUsers);

  res.json({
    success: true,
    message: `Account for ${userToDelete.email} and all their ${userFiles.length} file(s) were successfully deleted.`,
  });
});

// RESET / CHANGE password for a user account (Admin only)
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const users = db.getUsers();
  const userIndex = users.findIndex((u) => u.id === targetId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User account not found' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  users[userIndex].passwordHash = newHash;
  db.saveUsers(users);

  res.json({
    success: true,
    message: `Password for ${users[userIndex].email} was updated successfully.`,
  });
});

module.exports = router;

