// На GitHub Pages бэкенд на другом домене — задай VITE_API_URL (например https://твой-сервер.onrender.com)
const BASE = import.meta.env.VITE_API_URL || '';
const API = BASE ? `${BASE.replace(/\/$/, '')}/api` : '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export async function register(username, password, display_name) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password, display_name: display_name || username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка входа');
  return data;
}

export async function getMe() {
  const res = await fetch(`${API}/me`, { headers: getHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function getUsers() {
  const res = await fetch(`${API}/users`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return res.json();
}

export async function getChats() {
  const res = await fetch(`${API}/chats`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить чаты');
  return res.json();
}

export async function createDirectChat(user_id) {
  const res = await fetch(`${API}/chats/direct`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ user_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания чата');
  return data;
}

export async function createGroupChat(name, member_ids) {
  const res = await fetch(`${API}/chats/group`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, member_ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания беседы');
  return data;
}

export async function getMessages(chatId, topicId) {
  const path = topicId ? `?topic_id=${topicId}` : '';
  const res = await fetch(`${API}/chats/${chatId}/messages${path}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить сообщения');
  return res.json();
}

export async function getTopics(chatId) {
  const res = await fetch(`${API}/chats/${chatId}/topics`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить темы');
  return res.json();
}

export async function createTopic(chatId, title) {
  const res = await fetch(`${API}/chats/${chatId}/topics`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не удалось создать тему');
  return data;
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export function fileUrl(path) {
  if (!path) return '';
  const uploadsBase = BASE ? `${BASE.replace(/\/$/, '')}/uploads` : '';
  return uploadsBase ? `${uploadsBase}/${path}` : `/uploads/${path}`;
}

export { getToken };
