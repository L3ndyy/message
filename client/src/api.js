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

async function parseJson(res) {
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      'Сервер не отвечает. Если открываешь сайт на GitHub Pages — задеплой бэкенд на Render и добавь секрет VITE_API_URL в репо, затем заново запусти деплой (Actions → Run workflow).'
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Сервер вернул неверный ответ. Проверь, что бэкенд запущен.');
  }
}

export async function register(username, password, display_name) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password, display_name: display_name || username }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Ошибка входа');
  return data;
}

export async function getMe() {
  const res = await fetch(`${API}/me`, { headers: getHeaders() });
  if (!res.ok) return null;
  return parseJson(res);
}

export async function getUsers() {
  const res = await fetch(`${API}/users`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить пользователей');
  return parseJson(res);
}

export async function getChats(archived = false) {
  const q = archived ? '?archived=1' : '';
  const res = await fetch(`${API}/chats${q}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить чаты');
  return parseJson(res);
}

export async function createDirectChat(user_id) {
  const res = await fetch(`${API}/chats/direct`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ user_id }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Ошибка создания чата');
  return data;
}

export async function createGroupChat(name, member_ids) {
  const res = await fetch(`${API}/chats/group`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, member_ids }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Ошибка создания беседы');
  return data;
}

export async function getMessages(chatId, topicId, opts = {}) {
  const params = new URLSearchParams();
  if (topicId) params.set('topic_id', topicId);
  if (opts.limit) params.set('limit', opts.limit);
  if (opts.before_id) params.set('before_id', opts.before_id);
  if (opts.q) params.set('q', opts.q);
  const qs = params.toString();
  const res = await fetch(`${API}/chats/${chatId}/messages${qs ? '?' + qs : ''}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить сообщения');
  return parseJson(res);
}

export async function getTopics(chatId) {
  const res = await fetch(`${API}/chats/${chatId}/topics`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось загрузить темы');
  return parseJson(res);
}

export async function createTopic(chatId, title) {
  const res = await fetch(`${API}/chats/${chatId}/topics`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ title }),
  });
  const data = await parseJson(res);
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
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export function fileUrl(path) {
  if (!path) return '';
  const uploadsBase = BASE ? `${BASE.replace(/\/$/, '')}/uploads` : '';
  return uploadsBase ? `${uploadsBase}/${path}` : `/uploads/${path}`;
}

export async function pinChat(chatId, pin) {
  const res = await fetch(`${API}/chats/${chatId}/pin`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ pin }) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function archiveChat(chatId, archive) {
  const res = await fetch(`${API}/chats/${chatId}/archive`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ archive }) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function editMessage(messageId, text) {
  const res = await fetch(`${API}/messages/${messageId}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function deleteMessage(messageId) {
  const res = await fetch(`${API}/messages/${messageId}`, { method: 'DELETE', headers: getHeaders() });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function markRead(chatId, messageIds) {
  const res = await fetch(`${API}/chats/${chatId}/read`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ message_ids: messageIds }) });
  if (!res.ok) return;
  return parseJson(res);
}
export async function createInvite(chatId, opts = {}) {
  const res = await fetch(`${API}/chats/${chatId}/invite`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(opts) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function joinInvite(token) {
  const res = await fetch(`${API}/chats/join/${token}`, { method: 'POST', headers: getHeaders() });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function reportMessage(messageId, reason) {
  const res = await fetch(`${API}/messages/${messageId}/report`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ reason }) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function getAdminUsers() {
  const res = await fetch(`${API}/admin/users`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Доступ запрещён');
  return parseJson(res);
}
export async function setSuperadmin(userId, superadmin) {
  const res = await fetch(`${API}/admin/users/${userId}/superadmin`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ superadmin }) });
  if (!res.ok) throw new Error((await parseJson(res).catch(() => ({}))).error || 'Ошибка');
  return parseJson(res);
}
export async function getAdminChats() {
  const res = await fetch(`${API}/admin/chats`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Доступ запрещён');
  return parseJson(res);
}
export async function getAdminReports() {
  const res = await fetch(`${API}/admin/reports`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Доступ запрещён');
  return parseJson(res);
}
export async function exportChat(chatId) {
  const res = await fetch(`${API}/chats/${chatId}/export`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Не удалось экспортировать');
  return res.text();
}

export { getToken };
