/**
 * Список пользователей (узнать id для set-superadmin).
 * Запуск: node server/scripts/list-users.js
 */
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'messenger.db');

if (!existsSync(dbPath)) {
  console.error('БД не найдена:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
const rows = db.prepare('SELECT id, username, display_name, is_superadmin FROM users ORDER BY id').all();

const hasCol = rows.length && typeof rows[0].is_superadmin !== 'undefined';
console.log('id\tusername\tdisplay_name\t' + (hasCol ? 'superadmin' : ''));
rows.forEach((r) => {
  console.log([r.id, r.username, r.display_name || '-', hasCol ? (r.is_superadmin ? 'да' : 'нет') : '-'].join('\t'));
});
db.close();
