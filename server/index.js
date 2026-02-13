import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import db from './db.js';
import routes, { CRYPTO_SECRET } from './routes.js';
import { verifyToken } from './auth.js';
import { encrypt, decrypt } from './crypto-util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

app.use('/api', routes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const userSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const payload = verifyToken(token);
  if (!payload) return next(new Error('Unauthorized'));
  socket.userId = payload.userId;
  socket.username = payload.username;
  next();
});

io.on('connection', (socket) => {
  userSockets.set(socket.userId, socket.id);

  socket.on('chat:join', (chatId) => {
    const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, socket.userId);
    if (member) socket.join(`chat:${chatId}`);
  });

  socket.on('chat:leave', (chatId) => {
    socket.leave(`chat:${chatId}`);
  });

  socket.on('message:send', (data, callback) => {
    const { chat_id, text, attachment, topic_id } = data || {};
    if (!chat_id) return callback?.({ error: 'chat_id required' });

    const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chat_id, socket.userId);
    if (!member) return callback?.({ error: 'Not in chat' });

    let body_encrypted = null;
    let body_plain = null;
    if (text && text.trim()) {
      try {
        const { encrypted, iv, tag } = encrypt(text.trim(), CRYPTO_SECRET);
        body_encrypted = `${encrypted}|${iv}|${tag}`;
      } catch {
        body_plain = text.trim();
      }
    }

    const stmt = db.prepare(`
      INSERT INTO messages (chat_id, sender_id, body_encrypted, body_plain, attachment_name, attachment_path, attachment_mime, attachment_size, topic_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const r = stmt.run(
      chat_id,
      socket.userId,
      body_encrypted,
      body_plain,
      attachment?.name || null,
      attachment?.path || null,
      attachment?.mime || null,
      attachment?.size ?? null,
      topic_id ?? null
    );
    const msgId = r.lastInsertRowid;
    const row = db.prepare('SELECT id, chat_id, sender_id, body_encrypted, body_plain, attachment_name, attachment_path, attachment_mime, attachment_size, created_at FROM messages WHERE id = ?').get(msgId);
    const sender = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(socket.userId);

    let textOut = row.body_plain;
    if (row.body_encrypted) {
      try {
        const parts = row.body_encrypted.split('|');
        textOut = decrypt(parts[0], parts[1], parts[2], CRYPTO_SECRET);
      } catch {
        textOut = '[Encrypted]';
      }
    }

    const message = {
      id: row.id,
      chat_id: row.chat_id,
      sender_id: row.sender_id,
      text: textOut,
      attachment: row.attachment_path ? { name: row.attachment_name, path: row.attachment_path, mime: row.attachment_mime, size: row.attachment_size } : null,
      created_at: row.created_at,
      sender_username: sender?.username,
      sender_display_name: sender?.display_name || sender?.username,
    };

    io.to(`chat:${chat_id}`).emit('message:new', message);
    callback?.({ ok: true, message });
  });

  socket.on('disconnect', () => {
    userSockets.delete(socket.userId);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server http+ws on port ${PORT}`);
});
