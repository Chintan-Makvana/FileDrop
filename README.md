# FileDrop

A modern, self-hosted file storage & sharing web application:
- **Sign up & Login**: Secure email + password authentication and Google Sign-In.
- **Drag & Drop Upload**: Upload any file seamlessly with fast progress feedback.
- **Manage Files**: Search, filter, preview, download, and delete stored files.
- **Shareable Links**: Generate public download links with optional auto-destruct (burn-on-download).
- **Profile & Device Security**: Customizable user avatars and sleek responsive design across all devices.

Files are stored as plain files on disk (in `/uploads`), and accounts/file metadata are stored
in small JSON files (in `/data`) — no external database required. This keeps setup simple and
means it will run on almost any machine, including your own computer.

---

## 1. Run it on your computer (fastest way to try it)

**Requirements:** [Node.js](https://nodejs.org) version 18 or later.

```bash
# 1. Unzip the project, then open a terminal in that folder
cd filedrop

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Open .env and change JWT_SECRET to a long random string
# (this is what signs login sessions — keep it secret)

# 4. Start the server
npm start
```

Now open **http://localhost:3000** in your browser. Sign up, drag a file in, and try
downloading/sharing it.

Everything is saved in the `data/` and `uploads/` folders next to the code — so your files live
directly on your own computer, exactly as you asked.

### Letting other people reach it over the internet

If you want to keep it running on your own machine but let other people (or your phone, away
from home) reach it:

- **Easiest: a tunnel service** like [ngrok](https://ngrok.com) or
  [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):
  run `ngrok http 3000` and it gives you a public HTTPS URL that forwards to your computer. No
  router configuration needed. Good for testing/sharing with a few people; the free tier URL
  changes each time you restart it.
- **Port forwarding**: forward port 3000 (or better, 443 with a reverse proxy — see below) on
  your router to your computer, and use a free dynamic DNS service (e.g. DuckDNS) if your home IP
  changes. This keeps things fully on your own hardware but exposes your home network, so it's
  worth adding HTTPS (see below) and keeping your computer's OS updated.
- Either way, your computer needs to stay on and the terminal window needs to keep running (or
  use a process manager — see below).

---

## 2. Deploy it to the cloud (so it's always online)

If you'd rather not keep your own computer running 24/7, deploy the same code to a small cloud
host. A few good beginner-friendly options that support persistent file storage:

- **[Railway](https://railway.app)** or **[Render](https://render.com)** — connect your GitHub
  repo, add a persistent volume mounted at `/uploads` (and `/data` if you want metadata to
  survive restarts too), set the `JWT_SECRET` environment variable, and deploy. Both have a
  free/low-cost tier.
- **A cheap VPS** (e.g. DigitalOcean, Hetzner, Linode) — full control, ~$4-6/month. Steps below.

### Deploying to a VPS (Ubuntu example)

```bash
# On the server
sudo apt update && sudo apt install -y nodejs npm
git clone <your-repo-url> filedrop && cd filedrop
npm install
cp .env.example .env   # edit JWT_SECRET
npm install -g pm2     # keeps the app running & restarts it on crash/reboot
pm2 start server.js --name filedrop
pm2 save && pm2 startup
```

Then put a reverse proxy in front of it for HTTPS (strongly recommended — otherwise passwords
travel in plain text):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Point an A record for your domain at the server's IP, then create an Nginx site that proxies to
`http://localhost:3000`, and run `sudo certbot --nginx` to get a free HTTPS certificate.

### Using real cloud storage instead of local disk

This project stores uploaded files on the server's local disk, which is simplest to set up. If
you outgrow that (very large files, want files stored on S3/Backblaze/Google Cloud Storage
instead), swap the `multer.diskStorage` in `routes/files.js` for a cloud-storage `multer` adapter
(e.g. `multer-s3`) — the rest of the app (auth, share links, database) stays the same.

---

## Notes on security

This is a solid starting point, not a hardened production system. Before exposing it publicly,
consider:
- Always run it behind HTTPS (see above) — otherwise passwords are sent unencrypted.
- Set a strong, random `JWT_SECRET` in `.env` and never commit `.env` to git.
- Add file-size/type limits appropriate to your use (see `limits` in `routes/files.js`).
- The JSON-file database is fine for personal/small-team use; for many concurrent users, swap
  in a real database (e.g. PostgreSQL with `pg`, or SQLite with `better-sqlite3`).
- Consider adding rate limiting on `/api/auth/login` to slow down password-guessing attempts.

## Project structure

```
filedrop/
├── server.js           # Express app entry point
├── db.js                # tiny JSON-file "database"
├── middleware/auth.js    # JWT auth check
├── routes/auth.js        # register / login
├── routes/files.js       # upload / list / download / delete / share
├── public/                # frontend (HTML/CSS/JS)
├── data/                  # users.json, files.json (created on first run)
└── uploads/                # uploaded files live here
```
