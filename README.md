# Velora — Real-Time Chat Application

A full-stack, premium real-time chat application (**Velora**) built with **React**, **Node.js**, **Express**, **Socket.io**, and **MongoDB**. Multiple users can connect at the same time, chat live, make voice/video calls, and see message history after refresh.

## Live Demo (Deployed on Render)

| Resource | URL |
|----------|-----|
| **Live Application** | [https://velora-web-6sxg.onrender.com](https://velora-web-6sxg.onrender.com)|
| **GitHub Repository** | [https://github.com/pratistha9903/Velora-Realtime-Chat-App-With-Calling-Feature](https://github.com/pratistha9903/Velora-Realtime-Chat-App-With-Calling-Feature) |
| **Backend API (Render)** | Web Service — health check at `/api/health` on your Render backend URL |


---
## Demo Video

https://github.com/user-attachments/assets/48420d37-e4e8-47c1-88f0-c5e05e4edd42

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Project Setup](#project-setup)
7. [Running the Backend](#running-the-backend)
8. [Running the Frontend](#running-the-frontend)
9. [Environment Variables](#environment-variables)
10. [How to Use the Application](#how-to-use-the-application)
11. [REST API Endpoints](#rest-api-endpoints)
12. [Socket.io Events](#socketio-events)
13. [Design Decisions](#design-decisions)
14. [Assumptions](#assumptions)
15. [Deployment (Render)](#deployment-render)
16. [Submission Notes](#submission-notes)
17. [Troubleshooting](#troubleshooting)
18. [License](#license)

---

## Project Overview

Velora is a real-time messaging platform where users can:

- Register and log in securely (username/password or Google)
- Reset password via **email link** (SMTP)
- Start **private (1-to-1)** chats
- Create **group chats** with multiple members
- Send and receive messages **instantly** without page refresh
- Make **voice & video calls** (WebRTC) with call history
- View **contact profiles**, set **custom names** (local only), and **delete chats**
- View **previous chat history** stored in MongoDB
- See **online/offline status**, **typing indicators**, and **read/delivered receipts**
- Hear **message chimes** and **call ringtones** for incoming activity (respects muted chats)

The application follows the assignment requirement of using **Socket.io** for real-time communication (not polling or third-party realtime services).

---

## Features

### Core Requirements (Assignment)

| Feature | Status | Details |
|---------|--------|---------|
| React frontend | ✅ | React 18 + Vite |
| Clean chat UI | ✅ | WhatsApp-style 3-panel layout |
| Send messages | ✅ | Text + image support |
| Receive messages instantly | ✅ | Socket.io real-time delivery |
| Chat history after refresh | ✅ | Persisted in MongoDB |
| Message timestamps | ✅ | Per message + date separators |
| Node.js + Express backend | ✅ | REST + Socket.io server |
| REST API: send messages | ✅ | `POST /api/messages/:roomId` |
| REST API: fetch history | ✅ | `GET /api/messages/:roomId` |
| Socket.io (mandatory) | ✅ | Primary real-time transport |
| Broadcast to connected users | ✅ | Room-based socket broadcasting |
| Graceful connect/disconnect | ✅ | Reconnect + room re-join |
| Organized code structure | ✅ | Separate routes, models, sockets |
| Error handling | ✅ | API + socket + UI toasts |

### Bonus Features (Implemented)

| Feature | Status |
|---------|--------|
| User authentication (JWT + refresh tokens) | ✅ |
| Forgot password + reset | ✅ |
| Email verification (demo / optional SMTP) | ✅ |
| Google Login (via `VITE_GOOGLE_CLIENT_ID`) | ✅ |
| Profile picture + bio | ✅ |
| Last seen | ✅ |
| Typing indicator | ✅ |
| Online / offline status | ✅ |
| Message delivered status | ✅ |
| Message read receipts | ✅ |
| Reply / edit / copy message | ✅ |
| Delete for me + delete for everyone | ✅ |
| Message reactions | ✅ |
| Star message | ✅ |
| Pin / mute / archive chat | ✅ |
| Image + PDF/document upload | ✅ |
| Voice notes | ✅ |
| Cloudinary (optional env) | ✅ |
| MongoDB storage | ✅ |
| Private chats | ✅ |
| Group chats | ✅ |
| In-app + browser notifications | ✅ |
| **Message sound alerts** (other chats / background tab) | ✅ |
| **Incoming call ringtone** (Web Audio API) | ✅ |
| Emoji picker | ✅ |
| Rate limiting, Helmet, request logging | ✅ |
| **Voice & video calls (WebRTC)** | ✅ |
| **Call history tab** | ✅ |
| **Contact profile** (username, custom local nickname) | ✅ |
| **Delete chat** (per-user soft delete) | ✅ |
| **Real-time UI updates** (no page refresh) | ✅ |
| **Premium dark UI** (Velora theme) | ✅ |
| **Show/hide password** on auth forms | ✅ |
| **Secure password reset via email link** | ✅ |
| **Optimistic UI** (pin / mute / archive) | ✅ |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Socket.io Client, Lucide Icons |
| Backend | Node.js, Express, Socket.io |
| Database | MongoDB (Mongoose ODM) |
| Authentication | JWT + bcrypt |
| File Upload | Multer |
| Security | Helmet, express-rate-limit, CORS |

---

## Project Structure

```
realtime-chat-app/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── connect.js          # MongoDB connection
│   │   │   └── services.js         # Database operations
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT auth (REST + Socket)
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimiter.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Conversation.js     # Private & group chats
│   │   │   └── Message.js
│   │   ├── routes/
│   │   │   ├── auth.js             # Register, login, me
│   │   │   ├── rooms.js            # Conversations API
│   │   │   ├── messages.js         # Messages API
│   │   │   └── upload.js           # Image upload
│   │   ├── sockets/
│   │   │   ├── chatSocket.js       # Real-time events
│   │   │   └── socketHelpers.js    # Broadcast helpers
│   │   ├── utils/
│   │   │   └── mailer.js           # SMTP password-reset emails
│   │   └── server.js               # App entry point
│   ├── uploads/                    # Uploaded images
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── config/
│   │   │   └── brand.js            # App name & tagline (Velora)
│   │   ├── components/
│   │   │   ├── auth/               # Login / register / forgot password
│   │   │   ├── chat/               # Chat UI, calls, contact profile
│   │   │   └── ui/                 # Avatar, Modal, Toast, BrandMark
│   │   ├── context/                # Auth, Toast, Notification state
│   │   ├── hooks/
│   │   │   └── useSocket.js        # Socket.io client hook
│   │   ├── utils/
│   │   │   ├── audio.js            # Message chimes + call ringtones (autoplay unlock)
│   │   │   └── conversations.js    # Chat list sorting helpers
│   │   ├── services/
│   │   │   └── api.js              # REST API client
│   │   └── App.jsx
│   ├── .env.example
│   └── package.json
│
├── docker-compose.yml              # Local MongoDB via Docker
└── README.md
```

---

## Prerequisites

Before running the project, install:

- **Node.js** v18 or higher — [https://nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js)
- **MongoDB** — choose one:
  - **MongoDB Atlas** (free cloud — recommended for deployment)
  - **Docker** (local MongoDB)
  - Or use the dev in-memory fallback (data resets on restart)

---

## Project Setup

### 1. Clone the repository

```bash
git clone https://github.com/pratistha9903/chat_app.git
cd chat_app
```

### 2. Set up MongoDB

**Option A — MongoDB Atlas (recommended for persistence & deployment)**

1. Create a free cluster at [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a database user and allow your IP in **Network Access**
3. Copy the connection string and set it in `backend/.env`
4. URL-encode special characters in the password (e.g. `@` → `%40`)

**Option B — Docker (local)**

```bash
docker compose up -d
```

Uses `mongodb://127.0.0.1:27017/pulsechat` by default.

**Option C — Dev fallback (no setup)**

If local MongoDB is unavailable and you are **not** using Atlas, the backend starts an in-memory MongoDB automatically. Data is lost when the server restarts.

### 3. Configure environment variables

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your values

# Frontend
cd ../frontend
cp .env.example .env
# Default values work for local development
```

### 4. Install dependencies

```bash
# From project root
cd backend && npm install
cd ../frontend && npm install
```

---

## Running the Backend

```bash
cd backend
npm run dev
```

**Production:**

```bash
cd backend
npm start
```

The server starts on **http://localhost:3001** by default.

**Verify it is running:**

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Server is running",
  "database": {
    "status": "connected",
    "name": "pulsechat",
    "type": "atlas"
  }
}
```

---

## Running the Frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

If port 5173 is busy, Vite may use **5174** — check the terminal output.

**Build for production:**

```bash
cd frontend
npm run build
npm run preview
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | `3001` |
| `CLIENT_URL` | Yes | Frontend URL for CORS | `http://localhost:5173` |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/pulsechat` |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens | `your-long-random-secret` |
| `JWT_EXPIRES_IN` | No | Token expiry | `7d` |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token expiry | `30d` |
| `APP_NAME` | No | Display name in emails | `Velora` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth (backend) | — |
| `SMTP_HOST` | For email reset | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | No | SMTP port | `587` |
| `SMTP_SECURE` | No | Use TLS on connect | `false` |
| `SMTP_USER` | For email reset | SMTP login email | `you@gmail.com` |
| `SMTP_PASS` | For email reset | App password (no spaces) | `16-char-app-password` |
| `SMTP_FROM` | No | From header | `Velora <you@gmail.com>` |
| `UPLOAD_DIR` | No | Image upload folder | `./uploads` |
| `MAX_FILE_SIZE` | No | Max upload size in bytes | `10485760` (10 MB) |
| `AUTO_VERIFY_EMAIL` | No | Skip email verify in dev | `true` |

**Example `backend/.env`:**

```env
PORT=3001
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/pulsechat?retryWrites=true&w=majority
JWT_SECRET=your-long-random-secret-here
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
APP_NAME=Velora

# Gmail SMTP (for forgot-password emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your16charapppassword
SMTP_FROM="Velora <your-gmail@gmail.com>"

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
AUTO_VERIFY_EMAIL=true
```

#### SMTP setup (forgot password emails)

1. Enable **2-Step Verification** on your Google account
2. Create an **App Password** at [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Add SMTP variables to `backend/.env` (password **without spaces**)
4. Restart the backend — you should see: `[email] SMTP connection verified`
5. Without SMTP, forgot-password runs in **demo mode** (reset link shown on screen only)

> **Important:** Never commit `.env` to GitHub. Use `.env.example` as a template only.

### Frontend (`frontend/.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | No | Backend REST API URL | `http://localhost:3001` |
| `VITE_SOCKET_URL` | No | Socket.io server URL | `http://localhost:3001` |
| `VITE_GOOGLE_CLIENT_ID` | No | Google Sign-In client ID | — |

**Example `frontend/.env` (local):**

```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```

**Production (Render)** — frontend is deployed at [https://pulsechat-web.onrender.com](https://pulsechat-web.onrender.com). Set these in the Render **Static Site** environment before build:

```env
VITE_API_URL=https://<your-backend-service>.onrender.com
VITE_SOCKET_URL=https://<your-backend-service>.onrender.com
```

On the backend Render service, set:

```env
CLIENT_URL=https://pulsechat-web.onrender.com
```

---

## How to Use the Application

### Single-user flow

1. Open **http://localhost:5173**
2. Click **Sign Up** (top-right) and create an account
3. Sign in and explore the chat interface

### Multi-user live chat (recommended demo)

1. **Browser 1:** Register as `alice` / sign in
2. **Browser 2 (incognito):** Register as `bob` / sign in
3. **Alice:** Click **+** (New Chat) → select **Bob**
4. **Alice:** Send a message
5. **Bob:** The conversation appears in the sidebar → open it → message appears **live**
6. **Bob:** Reply → Alice sees it instantly
7. **Refresh either browser** → chat history is still there (MongoDB)

### Group chat

1. Click the **group icon** in the sidebar
2. Enter a group name and select members
3. All members receive the group and can chat in real time

### Other features to demo

- **Typing indicator** — start typing in an open chat
- **Online status** — green dot on avatars when users are connected
- **Read receipts** — checkmarks: sent → delivered → read
- **Notifications & sounds** — receive a message in another conversation or with the tab in the background: in-app banner + two-tone chime (muted chats stay silent)
- **Voice/video call** — call button in a DM chat header; incoming calls play a ringtone until you accept or decline
- **Calls tab** — sidebar tab showing call history
- **Contact profile** — click a name/avatar → view username, set custom name, delete chat
- **Forgot password** — email reset link (requires SMTP)
- **Pin / mute / archive** — right-click or use chat header actions; mute disables sound for that chat
- **Image upload** — attach an image in the message input
- **Sign out** — top-right button

### Sound notifications

Velora plays sounds for:

| Event | When it plays |
|-------|----------------|
| **New message** | Message arrives in a chat you are **not** viewing, or while the browser tab is **in the background** |
| **Incoming call** | Someone starts a voice/video call to you |
| **Outgoing call** | You place a call (ringback while waiting) |

**Browser requirement:** Modern browsers block audio until you interact with the page (click, tap, or key press). After you sign in or click anywhere once, sounds work for the rest of the session.

**Tips:**

- Keep system and browser volume unmuted
- Muted conversations do not play message sounds
- Messages in the **currently open chat** (tab visible) do not chime — you already see them live

---

## REST API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/register` | Create account | No |
| `POST` | `/api/auth/login` | Sign in | No |
| `POST` | `/api/auth/forgot-password` | Send password reset email | No |
| `GET` | `/api/auth/verify-reset-token?token=` | Validate reset link | No |
| `POST` | `/api/auth/reset-password` | Set new password from link | No |
| `POST` | `/api/auth/google` | Google Sign-In | No |
| `GET` | `/api/auth/me` | Get current user | Yes |

### Conversations (Rooms)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/rooms` | List user's conversations | Yes |
| `GET` | `/api/rooms/:roomId` | Get conversation details | Yes |
| `GET` | `/api/rooms/:roomId/members` | List members | Yes |
| `POST` | `/api/rooms/dm/:userId` | Start or get private chat | Yes |
| `POST` | `/api/rooms/group` | Create group chat | Yes |
| `GET` | `/api/rooms/users` | List all users | Yes |
| `GET` | `/api/rooms/users/search?q=` | Search users | Yes |
| `GET` | `/api/rooms/calls/history` | Call history | Yes |
| `DELETE` | `/api/rooms/:roomId` | Delete chat for current user | Yes |
| `PATCH` | `/api/rooms/:roomId/prefs` | Pin / mute / archive | Yes |

### Messages

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/messages/:roomId` | Fetch chat history | Yes |
| `POST` | `/api/messages/:roomId` | Send message (REST) | Yes |
| `PUT` | `/api/messages/:messageId` | Edit message | Yes |
| `DELETE` | `/api/messages/:messageId` | Delete message | Yes |
| `POST` | `/api/messages/:roomId/read` | Mark messages as read | Yes |
| `GET` | `/api/messages/search?q=` | Search messages | Yes |

### Other

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/upload` | Upload image | Yes |
| `GET` | `/api/health` | Server & database health | No |

> **Note:** The UI sends messages primarily via **Socket.io** for real-time delivery. REST `POST /api/messages` is also available.

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ roomId }` | Join a conversation room |
| `room:leave` | `{ roomId }` | Leave a conversation room |
| `message:send` | `{ roomId, content, type?, imageUrl?, replyTo? }` | Send a message |
| `message:edit` | `{ messageId, content }` | Edit own message |
| `message:delete` | `{ messageId }` | Delete own message |
| `message:read` | `{ roomId, messageId }` | Mark messages as read |
| `typing:start` | `{ roomId }` | User started typing |
| `typing:stop` | `{ roomId }` | User stopped typing |
| `call:invite` | `{ toUserId, roomId, callType, offer }` | Start voice/video call |
| `call:answer` | `{ toUserId, answer }` | Accept call |
| `call:reject` | `{ toUserId }` | Decline call |
| `call:ice` | `{ toUserId, candidate }` | WebRTC ICE candidate |
| `call:end` | `{ toUserId }` | End call |

### Server → Client

| Event | Description |
|-------|-------------|
| `connection:ready` | Socket connected; includes online users |
| `message:new` | New message in a joined room |
| `message:updated` | Message edited or deleted |
| `message:status` | Delivery/read status update |
| `message:read` | Messages marked as read |
| `room:updated` | Conversation metadata updated |
| `room:new` | New conversation added for user |
| `users:online` | Online users list changed |
| `typing:start` / `typing:stop` | Typing indicators |
| `call:incoming` / `call:answered` / `call:rejected` / `call:ended` | WebRTC call signaling |
| `calls:updated` | Call history changed (refresh Calls tab) |
| `room:member-removed` | User removed from a group |
| `room:removed` | Conversation removed for user |
| `error` | Socket-level error message |

> **Note:** In-app notifications and sounds are triggered **client-side** when `message:new` or call events arrive. Muted chats are respected; the UI uses `frontend/src/utils/audio.js` for chimes and ringtones.

### Authentication

Socket.io connections require a JWT token:

```javascript
io(url, { auth: { token: 'your-jwt-token' } })
```

---

## Design Decisions

### 1. React (Web) instead of React Native

The assignment allows **React Native (preferred) or React**. React was chosen for faster web development, easier local testing in the browser, and no APK build toolchain. A screen recording is provided instead of an APK.

### 2. Socket.io for real-time messaging

Socket.io was chosen because the assignment **requires** it. It provides:

- Instant bidirectional communication
- Automatic reconnection
- Room-based broadcasting for conversations
- JWT authentication on the socket handshake

Polling and third-party realtime services were intentionally not used.

### 3. MongoDB for persistence

MongoDB stores users, conversations, and messages. It fits the document model for chat (nested members, flexible message types) and works with **MongoDB Atlas** for free cloud hosting and deployment.

### 4. JWT authentication

JWT tokens secure both REST APIs and Socket.io connections. This is stateless, scales easily, and is standard for modern web apps. Passwords are hashed with **bcrypt** before storage.

### 5. Conversation-based architecture (not one global chat)

Instead of a single global chat room, the app uses **private** and **group** conversations (WhatsApp-style). Each conversation maps to a Socket.io room (`room:<conversationId>`), so messages only go to members.

### 6. REST + Socket.io hybrid

| Operation | Transport | Reason |
|-----------|-----------|--------|
| Login, register, fetch history | REST | Standard request/response |
| Send/receive live messages | Socket.io | Real-time, no refresh |
| Load chat on open | REST | Reliable history fetch |
| Typing, online status | Socket.io | Low-latency ephemeral events |

### 7. Auto-join socket rooms on connect

When a user connects, the server joins their socket to **all** conversations they belong to. This ensures live message delivery and sidebar updates even when the user is viewing a different chat.

### 8. Layered backend structure

Code is split into **routes** (HTTP), **sockets** (real-time), **models** (schema), **services** (business logic), and **middleware** (auth, errors). This keeps the codebase maintainable and testable.

### 9. Shared audio with autoplay unlock

Browsers require a user gesture before playing sound. Velora uses a **single shared `AudioContext`** (`frontend/src/utils/audio.js`) that unlocks on the first click, tap, or key press after load. Message chimes and call ringtones reuse this context so notifications work reliably after sign-in.

---

## Assumptions

1. **Web-first application** — Users access the app through a modern browser (Chrome, Firefox, Edge). No mobile APK is provided.

2. **Users must register before chatting** — There is no anonymous/guest mode. Each user needs an account.

3. **Internet connection required** — Both REST and Socket.io need network access to the backend.

4. **MongoDB is available** — For production and persistent data, a MongoDB Atlas URI is expected. Local dev can use Docker or the in-memory fallback.

5. **Single backend instance** — Online user tracking and socket state are in-memory on one server. Horizontal scaling would require Redis adapter (out of scope).

6. **Trusted clients** — The app is a portfolio/assignment project, not hardened for production abuse (no CAPTCHA, email verification, or token revocation).

7. **CORS** — Backend allows `localhost` origins and the URL set in `CLIENT_URL`. For deployment, `CLIENT_URL` must match the deployed frontend URL.

8. **Image uploads stored locally** — Uploaded images are saved in `backend/uploads/`. On Render, use persistent disk or cloud storage for production.

9. **Two users demo** — Live chat is demonstrated with two browsers (normal + incognito) or two machines pointing at the same backend.

10. **No end-to-end encryption** — Messages are stored in MongoDB in plain text (standard for this assignment scope).

---

## Deployment (Render)

### Deployed URLs

| Service | Platform | URL | Status |
|---------|----------|-----|--------|
| Frontend (Static Site) | Render | [https://pulsechat-web.onrender.com](https://pulsechat-web.onrender.com) | ✅ Live |
| Backend (Web Service) | Render | Your `pulsechat-api` (or similar) service URL | ✅ Deployed |
| Database | MongoDB Atlas | `pulsechat` database | ✅ Connected |

**Render dashboard:** [https://dashboard.render.com](https://dashboard.render.com)

### Deploy backend on Render

1. Push code to GitHub
2. Go to [https://render.com](https://render.com) → **New Web Service**
3. Connect repository `pratistha9903/chat_app`
4. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

5. Add environment variables:

| Key | Value |
|-----|-------|
| `PORT` | `3001` (or leave Render default) |
| `MONGODB_URI` | Your Atlas connection string |
| `JWT_SECRET` | A long random secret |
| `CLIENT_URL` | `https://pulsechat-web.onrender.com` |
| `NODE_ENV` | `production` |

6. Deploy and copy the live backend URL (e.g. `https://pulsechat-api.onrender.com`)

7. Set frontend Render environment variables and redeploy:

```env
VITE_API_URL=https://pulsechat-api.onrender.com
VITE_SOCKET_URL=https://pulsechat-api.onrender.com
```

### Deploy frontend on Render (Static Site) — ✅ Done

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |
| **Live URL** | [https://velora-web-6sxg.onrender.com](https://velora-web-6sxg.onrender.com) |

```bash
cd frontend
npm run build
```

The production build is served from the `dist` folder on Render.

---

## Submission Notes

This project is submitted as a **React web application** (not React Native).

| Deliverable | Status |
|-------------|--------|
| GitHub repository | [https://github.com/pratistha9903/chat_app](https://github.com/pratistha9903/chat_app) |
| README with setup | This file |
| **Live website (Render)** | [https://velora-web-6sxg.onrender.com](https://velora-web-6sxg.onrender.com)|
| APK | Not applicable (React web app) |
| Screen recording | To be uploaded to Google Drive |
| Live API (bonus) | Backend deployed on Render |

### Suggested screen recording flow

1. Show GitHub repo
2. Open live app: [https://pulsechat-web.onrender.com](https://pulsechat-web.onrender.com)
3. Register two users (incognito)
4. Start private chat and send messages live
5. Show typing indicator and online status
6. Refresh page and show history persists
7. (Optional) Show group chat, message sound in another tab, and an incoming call ringtone

---

## Troubleshooting

### `EADDRINUSE: port 3001 already in use`

Another backend process is running. Stop it:

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 3001 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### MongoDB connection failed

- Check `MONGODB_URI` in `backend/.env`
- URL-encode special characters in password (`@` → `%40`)
- In Atlas: **Network Access** → allow your IP (or `0.0.0.0/0` for dev)
- Verify cluster is running

### Password reset email not arriving

- Restart backend after editing `backend/.env`
- Look for `[email] SMTP connection verified` on startup (or `FAILED` with error)
- Use a **Gmail App Password** (not your normal password); remove spaces from `SMTP_PASS`
- No leading spaces in `SMTP_USER=your@gmail.com`
- Check **Spam** folder
- Without SMTP, use the **demo reset link** shown on screen or copy link from backend logs: `[password-reset] ... link=...`
- Use the **same email** you registered with

### Messages not appearing live

- Confirm **Live** badge is green in chat header
- Both users must be signed in
- Open the same conversation on both sides
- Check browser console for socket errors

### No sound for messages or calls

- **Click anywhere** on the page once after load (sign-in counts) — browsers block audio until you interact
- Check **system volume** and that the browser tab is not muted
- Confirm the chat is **not muted** (muted chats suppress message chimes)
- Message sounds only play for **other conversations** or when the tab is **in the background** — not for the chat you are actively viewing
- For calls, allow **microphone/camera** permissions when prompted
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### Google Sign-In popup still shows "Pulse Chat"

The name in Google’s OAuth popup is set in **Google Cloud Console**, not in this repo:

1. Open [Google Cloud Console](https://console.cloud.google.com/) → your project
2. **APIs & Services** → **OAuth consent screen**
3. Set **App name** to **Velora** and save
4. Use the same **OAuth client ID** in `frontend/.env` as `VITE_GOOGLE_CLIENT_ID`

### CORS errors

- Set `CLIENT_URL` on the Render backend to `https://pulsechat-web.onrender.com` (no trailing slash)
- Redeploy backend after changing environment variables

### Session expired on load

- Token may be invalid; sign in again
- Ensure `JWT_SECRET` has not changed between restarts

### `git push` error: `src refspec main does not match any`

Your local branch may be `master`. Rename and push:

```bash
git branch -M main
git push -u origin main
```

---
## 📝 License & Attribution

This project was built by **Pratistha Srivastava** as a portfolio project.

If you use this code, please provide attribution by linking back to this repository.

📧 Contact: pratistha9903@gmail.com
🔗 GitHub: https://github.com/pratistha9903
