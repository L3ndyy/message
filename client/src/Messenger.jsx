import React, { useState, useEffect } from 'react';
import { getChats } from './api';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';

export default function Messenger({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadChats = () => {
    getChats()
      .then(setChats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChats();
  }, []);

  const onNewChat = (chat) => {
    setChats((prev) => {
      const exists = prev.some((c) => c.id === chat.id);
      if (exists) return prev;
      return [{ ...chat, last_at: Date.now() / 1000 }, ...prev];
    });
    setSelectedChatId(chat.id);
  };

  const onMessageInChat = (chatId, lastMessage) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, last_message: lastMessage?.text || lastMessage?.attachment?.name || '[Файл]', last_at: lastMessage?.created_at || c.last_at }
          : c
      )
    );
  };

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.logo}>✉</span>
          <span style={styles.logoText}>Мессенджер</span>
          <button type="button" onClick={onLogout} style={styles.logoutBtn} title="Выйти">
            Выход
          </button>
        </div>
        <div style={styles.userBar}>
          <span style={styles.userName}>{user.display_name || user.username}</span>
        </div>
        <ChatList
          chats={chats}
          selectedId={selectedChatId}
          onSelect={setSelectedChatId}
          onNewChat={onNewChat}
          loading={loading}
          currentUserId={user.id}
        />
      </aside>
      <main style={styles.main}>
        {selectedChatId ? (
          <ChatWindow
            chatId={selectedChatId}
            currentUser={user}
            onMessage={onMessageInChat}
            onChatsRefresh={loadChats}
          />
        ) : (
          <div style={styles.placeholder}>
            <p>Выберите чат или начните новый</p>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width: 320,
    minWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--tg-panel)',
    borderRight: '1px solid var(--tg-border)',
  },
  sidebarHeader: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderBottom: '1px solid var(--tg-border)',
  },
  logo: { fontSize: 24 },
  logoText: { fontWeight: 700, fontSize: 18, flex: 1 },
  logoutBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--tg-border)',
    background: 'transparent',
    color: 'var(--tg-text-muted)',
    fontSize: 13,
  },
  userBar: {
    padding: '10px 20px',
    background: 'var(--tg-surface)',
    borderBottom: '1px solid var(--tg-border)',
  },
  userName: { fontSize: 14, color: 'var(--tg-text-muted)' },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    background: 'var(--tg-bg)',
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--tg-text-muted)',
    fontSize: 16,
  },
};
