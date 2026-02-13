import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-messenger';
const SALT_ROUNDS = 10;

export function register(username, password, displayName) {
  if (!username || !password) {
    throw new Error('Username and password required');
  }
  if (username.length < 3) {
    throw new Error('Username at least 3 characters');
  }
  if (password.length < 6) {
    throw new Error('Password at least 6 characters');
  }
  const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
  try {
    const stmt = db.prepare(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
    );
    const result = stmt.run(username.toLowerCase().trim(), password_hash, displayName || username);
    return { id: result.lastInsertRowid, username, display_name: displayName || username };
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Username already taken');
    }
    throw e;
  }
}

export function login(username, password) {
  const row = db.prepare('SELECT id, username, password_hash, display_name FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (!row) {
    throw new Error('User not found');
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    throw new Error('Wrong password');
  }
  const token = jwt.sign(
    { userId: row.id, username: row.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  return {
    token,
    user: {
      id: row.id,
      username: row.username,
      display_name: row.display_name || row.username,
    },
  };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
