require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

// Public share link — no login required, works for anyone with the link
app.get('/s/:token', (req, res) => {
  const file = db.getFiles().find((f) => f.shareToken === req.params.token);
  if (!file) return res.status(404).send('This link is invalid or has been revoked.');
  res.download(path.join(UPLOAD_DIR, file.storedName), file.originalName);
});

app.listen(PORT, () => {
  console.log(`FileDrop server running at http://localhost:${PORT}`);
});
