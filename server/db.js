import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'data', 'messenger.db');
const dataDir = dirname(dbPath);

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'direct',
    name TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body_encrypted TEXT,
    body_plain TEXT,
    attachment_name TEXT,
    attachment_path TEXT,
    attachment_mime TEXT,
    attachment_size INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

// Дополнительные структуры для групп и тем
// topic_id в сообщениях (игнорируем ошибку, если колонка уже есть)
try {
  db.exec(`
    ALTER TABLE messages ADD COLUMN topic_id INTEGER REFERENCES topics(id);
  `);
} catch (e) {
  // колонка уже существует — ничего не делаем
}

// Темы внутри чатов (как «topics» в Telegram)
db.exec(`
  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id)
  );

  CREATE INDEX IF NOT EXISTS idx_topics_chat ON topics(chat_id);
`);

// ——— Миграции для новых фич ———
function addColumnIfNotExists(table, column, def) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    if (info.some((c) => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch (_) {}
}

addColumnIfNotExists('users', 'is_superadmin', 'INTEGER DEFAULT 0');
addColumnIfNotExists('chat_members', 'pinned_at', 'INTEGER');
addColumnIfNotExists('chat_members', 'archived', 'INTEGER DEFAULT 0');
addColumnIfNotExists('chats', 'description', 'TEXT');
addColumnIfNotExists('chats', 'avatar_path', 'TEXT');
addColumnIfNotExists('messages', 'reply_to_id', 'INTEGER');
addColumnIfNotExists('messages', 'edited_at', 'INTEGER');
addColumnIfNotExists('messages', 'deleted_at', 'INTEGER');

db.exec(`
  CREATE TABLE IF NOT EXISTS message_reads (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS chat_invites (
    id TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    expires_at INTEGER,
    use_count INTEGER DEFAULT 0,
    max_uses INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS message_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    reporter_id INTEGER NOT NULL,
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (reporter_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_reports_message ON message_reports(message_id);
`);

// Выдать суперадмина: задай в .env SUPERADMIN_USER_IDS=1 или SUPERADMIN_USERNAME=admin и перезапусти сервер
if (process.env.SUPERADMIN_USER_IDS) {
  process.env.SUPERADMIN_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean).forEach((id) => {
    try { db.prepare('UPDATE users SET is_superadmin=1 WHERE id=?').run(id); } catch (_) {}
  });
}
if (process.env.SUPERADMIN_USERNAME) {
  try { db.prepare('UPDATE users SET is_superadmin=1 WHERE username=?').run(process.env.SUPERADMIN_USERNAME.trim().toLowerCase()); } catch (_) {}
}

export default db;
