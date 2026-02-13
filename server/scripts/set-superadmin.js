/**
 * Выдать суперадмина через БД (без установки sqlite3).
 * Запуск из корня проекта:
 *   node server/scripts/set-superadmin.js 1
 *   node server/scripts/set-superadmin.js admin
 * (1 — id пользователя, admin — логин)
 */
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'messenger.db');

const arg = process.argv[2];
if (!arg) {
  console.log('Использование: node server/scripts/set-superadmin.js <id или логин>');
  console.log('Пример: node server/scripts/set-superadmin.js 1');
  console.log('Пример: node server/scripts/set-superadmin.js admin');
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error('БД не найдена:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

// Добавить колонку is_superadmin, если её ещё нет (миграция)
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some((c) => c.name === 'is_superadmin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER DEFAULT 0');
    console.log('Колонка is_superadmin добавлена в таблицу users.');
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const isId = /^\d+$/.test(arg);
let row;
if (isId) {
  row = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(parseInt(arg, 10));
} else {
  const login = arg.trim().toLowerCase();
  row = db.prepare('SELECT id, username, display_name FROM users WHERE LOWER(username) = ?').get(login);
  if (!row) row = db.prepare('SELECT id, username, display_name FROM users WHERE username = ?').get(arg.trim());
}
if (!row) {
  console.error('Пользователь не найден:', arg);
  process.exit(1);
}

db.prepare('UPDATE users SET is_superadmin = 1 WHERE id = ?').run(row.id);
console.log('Суперадмин выдан:', row.display_name || row.username, '(@' + row.username + ', id=' + row.id + ')');

db.close();
