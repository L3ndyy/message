import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'fs';
import db from './db.js';
import * as auth from './auth.js';
import { encrypt, decrypt } from './crypto-util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

const router = express.Router();
const CRYPTO_SECRET = process.env.CRYPTO_SECRET || 'default-secret-change-in-production-32chars!!';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || path.extname(file.originalname) || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true),
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query?.token;
  const payload = auth.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = payload;
  next();
}

router.post('/auth/register', (req, res) => {
  try {
    const { username, password, display_name } = req.body;
    const user = auth.register(username, password, display_name);
    const { token, user: u } = auth.login(username, password);
    res.json({ token, user: u });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const result = auth.login(username, password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.user.userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name || row.username });
});

router.get('/users', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id, username, display_name FROM users WHERE id != ? ORDER BY username').all(req.user.userId);
  res.json(rows.map(r => ({ id: r.id, username: r.username, display_name: r.display_name || r.username })));
});

function getOrCreateDirectChat(userId, otherUserId) {
  const members = [userId, otherUserId].sort((a, b) => a - b);
  let chat = db.prepare(`
    SELECT c.id FROM chats c
    INNER JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
    INNER JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
    WHERE c.type = 'direct'
  `).get(members[0], members[1]);
  if (chat) return chat.id;
  const insertChat = db.prepare('INSERT INTO chats (type) VALUES (?)');
  const r = insertChat.run('direct');
  const chatId = r.lastInsertRowid;
  db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?), (?, ?)').run(chatId, members[0], chatId, members[1]);
  return chatId;
}

router.get('/chats', authMiddleware, (req, res) => {
  const chats = db.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
           (SELECT body_plain FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_msg,
           (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_at
    FROM chats c
    INNER JOIN chat_members m ON m.chat_id = c.id
    WHERE m.user_id = ?
    ORDER BY COALESCE(last_at, 0) DESC, c.id DESC
  `).all(req.user.userId);

  const result = chats.map(chat => {
    const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chat.id);
    const otherId = members.find(m => m.user_id !== req.user.userId)?.user_id;
    let title = chat.name;
    if (chat.type === 'direct' && otherId) {
      const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(otherId);
      title = u?.display_name || u?.username || 'User';
    }
    let lastMsg = chat.last_msg;
    if (chat.last_msg === null && chat.id) {
      const lastRow = db.prepare('SELECT body_encrypted, body_plain, attachment_name FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1').get(chat.id);
      if (lastRow?.body_encrypted) {
        try {
          const parts = lastRow.body_encrypted.split('|');
          lastMsg = decrypt(parts[0], parts[1], parts[2], CRYPTO_SECRET) || '[Encrypted]';
        } catch {
          lastMsg = '[Message]';
        }
      } else {
        lastMsg = lastRow?.attachment_name ? `📎 ${lastRow.attachment_name}` : (lastRow?.body_plain || '');
      }
    }
    return {
      id: chat.id,
      type: chat.type,
      title,
      last_message: lastMsg,
      last_at: chat.last_at,
    };
  });
  res.json(result);
});

// Создание группового чата (беседы)
router.post('/chats/group', authMiddleware, (req, res) => {
  const { name, member_ids } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название беседы обязательно' });
  }
  let ids = Array.isArray(member_ids) ? member_ids.map(Number).filter(Boolean) : [];
  // всегда добавляем создателя
  ids.push(req.user.userId);
  // убираем дубли
  ids = Array.from(new Set(ids));
  if (ids.length < 2) {
    return res.status(400).json({ error: 'Нужно минимум два участника для беседы' });
  }

  const insertChat = db.prepare('INSERT INTO chats (type, name) VALUES (?, ?)');
  const r = insertChat.run('group', name.trim());
  const chatId = r.lastInsertRowid;

  const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    ids.forEach((uid) => {
      const role = uid === req.user.userId ? 'owner' : 'member';
      insertMember.run(chatId, uid, role);
    });
  });
  tx();

  res.json({ chat_id: chatId });
});

router.post('/chats/direct', authMiddleware, (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const chatId = getOrCreateDirectChat(req.user.userId, user_id);
  res.json({ chat_id: chatId });
});

router.get('/chats/:id/messages', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });

  const topicId = req.query.topic_id ? Number(req.query.topic_id) : null;

  const rows = db.prepare(`
    SELECT m.id, m.chat_id, m.sender_id, m.body_encrypted, m.body_plain, m.attachment_name, m.attachment_path, m.attachment_mime, m.attachment_size, m.created_at,
           u.username, u.display_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ?
      AND (
        (${topicId ? 1 : 0} = 0 AND (m.topic_id IS NULL OR m.topic_id = 0))
        OR (${topicId ? 1 : 0} = 1 AND m.topic_id = @topicId)
      )
    ORDER BY m.created_at ASC
  `).all({ '@topicId': topicId, 0: req.params.id });

  const messages = rows.map(row => {
    let text = row.body_plain;
    if (row.body_encrypted) {
      try {
        const parts = row.body_encrypted.split('|');
        text = decrypt(parts[0], parts[1], parts[2], CRYPTO_SECRET);
      } catch {
        text = '[Encrypted]';
      }
    }
    return {
      id: row.id,
      chat_id: row.chat_id,
      sender_id: row.sender_id,
      text,
      attachment: row.attachment_path ? {
        name: row.attachment_name,
        path: row.attachment_path,
        mime: row.attachment_mime,
        size: row.attachment_size,
      } : null,
      created_at: row.created_at,
      sender_username: row.username,
      sender_display_name: row.display_name || row.username,
    };
  });
  res.json(messages);
});

// Темы (topics) внутри беседы
router.get('/chats/:id/topics', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });

  const rows = db.prepare(`
    SELECT id, chat_id, title, created_at
    FROM topics
    WHERE chat_id = ?
    ORDER BY created_at ASC
  `).all(req.params.id);

  res.json(rows);
});

router.post('/chats/:id/topics', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });

  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Название темы обязательно' });
  }

  const stmt = db.prepare('INSERT INTO topics (chat_id, title) VALUES (?, ?)');
  const r = stmt.run(req.params.id, title.trim());
  res.json({ id: r.lastInsertRowid, chat_id: Number(req.params.id), title: title.trim() });
});

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({
    path: req.file.filename,
    name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
  });
});

export { authMiddleware, getOrCreateDirectChat, CRYPTO_SECRET };
export default router;
