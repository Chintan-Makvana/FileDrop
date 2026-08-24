const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const FILES_FILE = path.join(DB_DIR, 'files.json');
const FRIENDS_FILE = path.join(DB_DIR, 'friends.json');
const VAULT_FILES_FILE = path.join(DB_DIR, 'vault_files.json');

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  if (!fs.existsSync(FILES_FILE)) fs.writeFileSync(FILES_FILE, '[]');
  if (!fs.existsSync(FRIENDS_FILE)) fs.writeFileSync(FRIENDS_FILE, '[]');
  if (!fs.existsSync(VAULT_FILES_FILE)) fs.writeFileSync(VAULT_FILES_FILE, '[]');
}

function readJson(file) {
  ensureDb();
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  getUsers: () => readJson(USERS_FILE),
  saveUsers: (users) => writeJson(USERS_FILE, users),
  getFiles: () => readJson(FILES_FILE),
  saveFiles: (files) => writeJson(FILES_FILE, files),
  getFriends: () => readJson(FRIENDS_FILE),
  saveFriends: (friends) => writeJson(FRIENDS_FILE, friends),
  getVaultFiles: () => readJson(VAULT_FILES_FILE),
  saveVaultFiles: (vaultFiles) => writeJson(VAULT_FILES_FILE, vaultFiles),
};
