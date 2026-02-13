import React, { useState, useEffect } from 'react';
import { getAdminUsers, setSuperadmin, getAdminChats, getAdminReports } from './api';

export default function AdminPanel({ user, onBack }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      getAdminUsers().then(setUsers).catch(() => setUsers([])),
      getAdminChats().then(setChats).catch(() => setChats([])),
      getAdminReports().then(setReports).catch(() => setReports([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSetSuperadmin = async (userId, value) => {
    try {
      await setSuperadmin(userId, value);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_superadmin: value } : u)));
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div style={s.page}><p>Загрузка...</p></div>;
  return (
    <div style={s.page}>
      <div style={s.header}>
        <button type="button" onClick={onBack} style={s.backBtn}>← Назад</button>
        <h2 style={s.title}>Админ-панель</h2>
      </div>
      {error && <p style={s.error}>{error}</p>}
      <div style={s.tabs}>
        {['users', 'chats', 'reports'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === 'users' ? 'Пользователи' : t === 'chats' ? 'Чаты' : 'Жалобы'}
          </button>
        ))}
      </div>
      {tab === 'users' && (
        <ul style={s.list}>
          {users.map((u) => (
            <li key={u.id} style={s.row}>
              <span>#{u.id} {u.display_name || u.username} @{u.username}</span>
              <label style={s.checkLabel}>
                <input type="checkbox" checked={!!u.is_superadmin} onChange={(e) => handleSetSuperadmin(u.id, e.target.checked)} />
                суперадмин
              </label>
            </li>
          ))}
        </ul>
      )}
      {tab === 'chats' && (
        <ul style={s.list}>
          {chats.map((c) => (
            <li key={c.id} style={s.row}>#{c.id} {c.type} {c.name || '(без названия)'} — {c.members} участн.</li>
          ))}
        </ul>
      )}
      {tab === 'reports' && (
        <ul style={s.list}>
          {reports.map((r) => (
            <li key={r.id} style={s.row}>
              Жалоба #{r.id}: сообщение {r.message_id}, от @{r.reporter_username}, причина: {r.reason || '—'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s = {
  page: { padding: 20, maxWidth: 600 },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { padding: '8px 12px', border: '1px solid var(--tg-border)', borderRadius: 8, background: 'var(--tg-surface)', color: 'var(--tg-text)', cursor: 'pointer' },
  title: { margin: 0, fontSize: 20 },
  error: { color: 'var(--tg-red)', marginBottom: 12 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: { padding: '8px 16px', border: '1px solid var(--tg-border)', background: 'transparent', color: 'var(--tg-text-muted)', borderRadius: 8, cursor: 'pointer' },
  tabActive: { background: 'var(--tg-accent)', color: '#fff', borderColor: 'var(--tg-accent)' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: { padding: '10px 0', borderBottom: '1px solid var(--tg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
};
