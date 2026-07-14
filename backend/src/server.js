import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from './db/connect.js';
import authRouter from './routes/auth.js';
import roomsRouter from './routes/rooms.js';
import messagesRouter from './routes/messages.js';
import uploadRouter from './routes/upload.js';
import { setupChatSocket } from './sockets/chatSocket.js';
import { socketAuthenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/logger.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  return origin === CLIENT_URL || CLIENT_URL.split(',').map((s) => s.trim()).includes(origin);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadDir));
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }[dbState] || 'unknown';

  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      name: mongoose.connection.name || null,
      host: mongoose.connection.host || null,
      type: mongoose.connection.host?.includes('127.0.0.1') ? 'local' : 'atlas',
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/upload', uploadRouter);

app.use(notFoundHandler);
app.use(errorHandler);

io.use(socketAuthenticate);
setupChatSocket(io);
app.set('io', io);

async function start() {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Socket.io ready — CORS origin: ${CLIENT_URL}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
