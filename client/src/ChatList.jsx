import React, { useState } from 'react';
import { getUsers, createDirectChat, createGroupChat } from './api';

export default function ChatList({ chats, selectedId, onSelect, onNewChat, loading }) {
  const [showNew, setShowNew] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);

  const openNewChat = (nextMode) => {
    setMode(nextMode);
    setShowNew(true);
    setGroupName('');
    setSelectedUsers([]);
    setLoadingUsers(true);
    getUsers()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoadingUsers(false));
  };

  const startDirectChat = async (userId) => {
    try {
      const { chat_id } = await createDirectChat(userId);
      onNewChat({
        id: chat_id,
        type: 'direct',
        title: users.find((u) => u.id === userId)?.display_name || 'Чат',
        last_message: '',
        last_at: Date.now() / 1000,
      });
      setShowNew(false);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleUserInGroup = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const startGroup = async () => {
    if (!groupName.trim()) {
      alert('Введите название беседы');
      return;
    }
    if (selectedUsers.length === 0) {
      alert('Выберите хотя бы одного участника');
      return;
    }
    try {
      const { chat_id } = await createGroupChat(groupName.trim(), selectedUsers);
      onNewChat({
        id: chat_id,
        type: 'group',
        title: groupName.trim(),
        last_message: '',
        last_at: Date.now() / 1000,
      });
      setShowNew(false);
    } catch (e) {
      alert(e.message || 'Ошибка создания беседы');
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <button type="button" onClick={() => openNewChat('direct')} style={styles.newBtn}>
          Новый диалог
        </button>
        <button type="button" onClick={() => openNewChat('group')} style={{ ...styles.newBtn, marginTop: 8 }}>
          Новая беседа
        </button>
      </div>

      {showNew && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <span>{mode === 'direct' ? 'Выберите пользователя' : 'Создание беседы'}</span>
              <button type="button" onClick={() => setShowNew(false)} style={styles.closeBtn}>
                ×
              </button>
            </div>
            {mode === 'group' && (
              <div style={styles.groupHeader}>
                <input
                  type="text"
                  placeholder="Название беседы"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  style={styles.groupInput}
                />
              </div>
            )}
            {loadingUsers ? (
              <p style={styles.muted}>Загрузка...</p>
            ) : (
              <ul style={styles.userList}>
                {users.map((u) => (
                  <li key={u.id}>
                    {mode === 'direct' ? (
                      <button type="button" onClick={() => startDirectChat(u.id)} style={styles.userItem}>
                        <span>{u.display_name || u.username}</span>
                        <span style={styles.userLogin}>@{u.username}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleUserInGroup(u.id)}
                        style={{
                          ...styles.userItem,
                          ...(selectedUsers.includes(u.id) ? styles.userItemSelected : {}),
                        }}
                      >
                        <span>{u.display_name || u.username}</span>
                        <span style={styles.userLogin}>@{u.username}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mode === 'group' && (
              <div style={styles.groupFooter}>
                <button type="button" onClick={startGroup} style={styles.createGroupBtn}>
                  Создать беседу
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ul style={styles.list}>
        {loading ? (
          <li style={styles.muted}>Загрузка чатов...</li>
        ) : chats.length === 0 ? (
          <li style={styles.muted}>Нет чатов. Создайте новый.</li>
        ) : (
          chats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                onClick={() => onSelect(chat.id)}
                style={{
                  ...styles.chatItem,
                  ...(selectedId === chat.id ? styles.chatItemActive : {}),
                }}
              >
                <div style={styles.chatAvatar}>{chat.title?.slice(0, 1).toUpperCase() || '?'}</div>
                <div style={styles.chatBody}>
                  <div style={styles.chatRow}>
                    <span style={styles.chatTitle}>
                      {chat.title}
                      {chat.type === 'group' && <span style={styles.chatBadge}>Беседа</span>}
                    </span>
                    <span style={styles.chatTime}>{formatTime(chat.last_at)}</span>
                  </div>
                  <span style={styles.chatPreview}>{chat.last_message || 'Нет сообщений'}</span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

const styles = {
  wrap: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  toolbar: { padding: 12, borderBottom: '1px solid var(--tg-border)' },
  newBtn: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px dashed var(--tg-border)',
    background: 'transparent',
    color: 'var(--tg-text-muted)',
    fontSize: 14,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', flex: 1 },
  chatItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    borderBottom: '1px solid var(--tg-border)',
  },
  chatItemActive: { background: 'var(--tg-surface)' },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--tg-accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  },
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  chatTitle: { fontWeight: 600, fontSize: 15 },
  chatTime: { fontSize: 12, color: 'var(--tg-text-muted)' },
  chatPreview: { fontSize: 13, color: 'var(--tg-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
  modal: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalContent: {
    background: 'var(--tg-panel)',
    borderRadius: 'var(--radius)',
    width: '90%',
    maxWidth: 360,
    maxHeight: '70%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--tg-border)',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--tg-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: { background: 'none', border: 'none', color: 'var(--tg-text-muted)', fontSize: 24, cursor: 'pointer', padding: '0 4px' },
  userList: { listStyle: 'none', margin: 0, padding: 0, overflow: 'auto' },
  userItem: {
    width: '100%',
    padding: '12px 20px',
    border: 'none',
    background: 'none',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    borderBottom: '1px solid var(--tg-border)',
  },
  userItemSelected: {
    background: 'var(--tg-surface)',
  },
  userLogin: { fontSize: 12, color: 'var(--tg-text-muted)' },
  muted: { padding: 20, color: 'var(--tg-text-muted)', fontSize: 14 },
  groupHeader: { padding: '10px 20px', borderBottom: '1px solid var(--tg-border)' },
  groupInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--tg-border)',
    background: 'var(--tg-surface)',
    color: 'var(--tg-text)',
    fontSize: 14,
  },
  groupFooter: {
    padding: '10px 20px',
    borderTop: '1px solid var(--tg-border)',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  createGroupBtn: {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--tg-accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
  },
  chatBadge: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--tg-text-muted)',
  },
};
