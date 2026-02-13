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

function requireSuperadmin(req, res, next) {
  const row = db.prepare('SELECT is_superadmin FROM users WHERE id = ?').get(req.user.userId);
  if (!row?.is_superadmin) return res.status(403).json({ error: 'Forbidden: superadmin only' });
  next();
}

router.get('/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, username, display_name, is_superadmin FROM users WHERE id = ?').get(req.user.userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    is_superadmin: !!row.is_superadmin,
  });
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
  const includeArchived = req.query.archived === '1';
  const archivedCond = includeArchived ? 'm.archived = 1' : '(m.archived = 0 OR m.archived IS NULL)';
  const chats = db.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
           m.pinned_at, m.archived,
           (SELECT body_plain FROM messages WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_msg,
           (SELECT created_at FROM messages WHERE chat_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_at
    FROM chats c
    INNER JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
    WHERE ${archivedCond}
    ORDER BY m.pinned_at DESC, COALESCE(last_at, 0) DESC, c.id DESC
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
      const lastRow = db.prepare('SELECT body_encrypted, body_plain, attachment_name FROM messages WHERE chat_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1').get(chat.id);
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
      pinned_at: chat.pinned_at || null,
      archived: !!chat.archived,
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
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const beforeId = req.query.before_id ? Number(req.query.before_id) : null;
  const searchQ = (req.query.q || '').trim().slice(0, 100);

  let rows;
  const topicCond = topicId ? 'AND m.topic_id = ' + topicId : 'AND (m.topic_id IS NULL OR m.topic_id = 0)';
  const beforeCond = beforeId ? 'AND m.id < ' + beforeId : '';
  const searchCond = searchQ ? 'AND m.body_plain LIKE ?' : '';
  const searchParams = searchQ ? ['%' + searchQ + '%'] : [];

  rows = db.prepare(`
    SELECT m.id, m.chat_id, m.sender_id, m.body_encrypted, m.body_plain, m.attachment_name, m.attachment_path, m.attachment_mime, m.attachment_size, m.created_at, m.reply_to_id, m.edited_at,
           u.username, u.display_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ? AND m.deleted_at IS NULL ${topicCond} ${beforeCond} ${searchCond}
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(req.params.id, ...searchParams, limit);

  rows = rows.reverse();

  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];
  const replyMap = {};
  if (replyIds.length) {
    const replyRows = db.prepare('SELECT m.id, m.body_plain, m.body_encrypted, u.display_name, u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id IN (' + replyIds.join(',') + ')').all();
    replyRows.forEach((r) => {
      let t = r.body_plain;
      if (r.body_encrypted) try { const p = r.body_encrypted.split('|'); t = decrypt(p[0], p[1], p[2], CRYPTO_SECRET); } catch { t = '[Encrypted]'; }
      replyMap[r.id] = { text: (t || '').slice(0, 100), sender_name: r.display_name || r.username };
    });
  }

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
      reply_to_id: row.reply_to_id || null,
      reply_to: row.reply_to_id ? replyMap[row.reply_to_id] : null,
      edited_at: row.edited_at || null,
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

// Закрепить / открепить чат
router.patch('/chats/:id/pin', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const pinned_at = req.body.pin ? Math.floor(Date.now() / 1000) : null;
  db.prepare('UPDATE chat_members SET pinned_at = ? WHERE chat_id = ? AND user_id = ?').run(pinned_at, req.params.id, req.user.userId);
  res.json({ pinned_at });
});

// Архив
router.patch('/chats/:id/archive', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const archived = req.body.archive ? 1 : 0;
  db.prepare('UPDATE chat_members SET archived = ? WHERE chat_id = ? AND user_id = ?').run(archived, req.params.id, req.user.userId);
  res.json({ archived: !!archived });
});

// Редактирование сообщения
router.patch('/messages/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, chat_id, sender_id, body_encrypted, body_plain FROM messages WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  if (row.sender_id !== req.user.userId) return res.status(403).json({ error: 'Not your message' });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  let body_encrypted = null;
  let body_plain = null;
  try {
    const { encrypted, iv, tag } = encrypt(text.trim(), CRYPTO_SECRET);
    body_encrypted = `${encrypted}|${iv}|${tag}`;
  } catch {
    body_plain = text.trim();
  }
  const edited_at = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE messages SET body_encrypted = ?, body_plain = ?, edited_at = ? WHERE id = ?').run(body_encrypted, body_plain, edited_at, req.params.id);
  const io = req.app.get('io');
  if (io) io.to(`chat:${row.chat_id}`).emit('message:updated', { id: Number(req.params.id), text: text.trim(), edited_at });
  res.json({ ok: true, edited_at });
});

// Удаление сообщения (мягкое)
router.delete('/messages/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, chat_id, sender_id FROM messages WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(row.chat_id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const canDelete = row.sender_id === req.user.userId || member.role === 'owner' || member.role === 'admin';
  if (!canDelete) return res.status(403).json({ error: 'Cannot delete' });
  const deleted_at = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE messages SET deleted_at = ?, body_encrypted = NULL, body_plain = NULL, attachment_path = NULL WHERE id = ?').run(deleted_at, req.params.id);
  const io = req.app.get('io');
  if (io) io.to(`chat:${row.chat_id}`).emit('message:deleted', { id: Number(req.params.id) });
  res.json({ ok: true });
});

// Отметить сообщения прочитанными
router.post('/chats/:id/read', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const { message_ids } = req.body || {};
  const ids = Array.isArray(message_ids) ? message_ids.map(Number).filter(Boolean) : [];
  const read_at = Math.floor(Date.now() / 1000);
  const insert = db.prepare('INSERT OR REPLACE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)');
  ids.forEach((mid) => { try { insert.run(mid, req.user.userId, read_at); } catch (_) {} });
  res.json({ ok: true });
});

// Инвайт-ссылка для беседы
router.post('/chats/:id/invite', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  if (member.role !== 'owner' && member.role !== 'admin') return res.status(403).json({ error: 'Only owner/admin' });
  const token = uuidv4().replace(/-/g, '');
  const max_uses = req.body.max_uses ? Number(req.body.max_uses) : null;
  const expires_hours = req.body.expires_hours ? Number(req.body.expires_hours) : 24;
  const expires_at = Math.floor(Date.now() / 1000) + expires_hours * 3600;
  db.prepare('INSERT INTO chat_invites (id, chat_id, created_by, expires_at, max_uses) VALUES (?, ?, ?, ?, ?)').run(token, req.params.id, req.user.userId, expires_at, max_uses);
  res.json({ token, invite_path: `/join/${token}`, expires_at });
});

// Вступить по инвайту
router.post('/chats/join/:token', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, chat_id, expires_at, use_count, max_uses FROM chat_invites WHERE id = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Invalid or expired link' });
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'Link expired' });
  if (row.max_uses != null && row.use_count >= row.max_uses) return res.status(400).json({ error: 'Link limit reached' });
  const already = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(row.chat_id, req.user.userId);
  if (already) return res.json({ chat_id: row.chat_id });
  db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(row.chat_id, req.user.userId);
  db.prepare('UPDATE chat_invites SET use_count = use_count + 1 WHERE id = ?').run(req.params.token);
  res.json({ chat_id: row.chat_id });
});

// Жалоба на сообщение
router.post('/messages/:id/report', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT id, chat_id FROM messages WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(row.chat_id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const reason = (req.body?.reason || '').slice(0, 500);
  db.prepare('INSERT INTO message_reports (message_id, reporter_id, reason) VALUES (?, ?, ?)').run(req.params.id, req.user.userId, reason);
  res.json({ ok: true });
});

// Админ: список пользователей
router.get('/admin/users', authMiddleware, requireSuperadmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, display_name, is_superadmin, created_at FROM users ORDER BY id').all();
  res.json(rows.map(r => ({ id: r.id, username: r.username, display_name: r.display_name, is_superadmin: !!r.is_superadmin, created_at: r.created_at })));
});

// Админ: выдать суперадмина (по id)
router.patch('/admin/users/:id/superadmin', authMiddleware, requireSuperadmin, (req, res) => {
  const set = req.body.superadmin ? 1 : 0;
  db.prepare('UPDATE users SET is_superadmin = ? WHERE id = ?').run(set, req.params.id);
  res.json({ ok: true });
});

// Админ: список чатов
router.get('/admin/chats', authMiddleware, requireSuperadmin, (req, res) => {
  const rows = db.prepare('SELECT c.id, c.type, c.name, c.created_at, (SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) as members FROM chats c ORDER BY c.id DESC').all();
  res.json(rows);
});

// Админ: список жалоб
router.get('/admin/reports', authMiddleware, requireSuperadmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.message_id, r.reporter_id, r.reason, r.created_at, u.username as reporter_username
    FROM message_reports r JOIN users u ON u.id = r.reporter_id ORDER BY r.created_at DESC
  `).all();
  res.json(rows);
});

// Экспорт чата (текст)
router.get('/chats/:id/export', authMiddleware, (req, res) => {
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!member) return res.status(403).json({ error: 'Not in chat' });
  const rows = db.prepare(`
    SELECT m.id, m.sender_id, m.body_plain, m.body_encrypted, m.attachment_name, m.created_at, u.display_name, u.username
    FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.chat_id = ? AND m.deleted_at IS NULL ORDER BY m.created_at ASC
  `).all(req.params.id);
  const lines = rows.map((r) => {
    let text = r.body_plain;
    if (r.body_encrypted) try { const parts = r.body_encrypted.split('|'); text = decrypt(parts[0], parts[1], parts[2], CRYPTO_SECRET); } catch { text = '[Encrypted]'; }
    const name = r.display_name || r.username;
    const date = new Date(r.created_at * 1000).toISOString();
    return `[${date}] ${name}: ${text || (r.attachment_name ? `[${r.attachment_name}]` : '')}`;
  });
  res.type('text/plain').send(lines.join('\n'));
});

export { authMiddleware, requireSuperadmin, getOrCreateDirectChat, CRYPTO_SECRET };
export default router;
