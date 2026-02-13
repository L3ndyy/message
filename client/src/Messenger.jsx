import React, { useState, useEffect } from 'react';
import { getChats } from './api';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import AdminPanel from './AdminPanel';

const MOBILE_BREAKPOINT = 768;

export default function Messenger({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  const [showAdmin, setShowAdmin] = useState(false);
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'dark');

  const setTheme = (v) => {
    setThemeState(v);
    localStorage.setItem('theme', v);
    document.documentElement.setAttribute('data-theme', v);
  };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const showSidebar = !isMobile || !selectedChatId;
  const showMain = !isMobile || selectedChatId;
  const selectedChat = chats.find((c) => c.id === selectedChatId);

  if (showAdmin && user.is_superadmin) {
    return <AdminPanel user={user} onBack={() => setShowAdmin(false)} />;
  }

  return (
    <div style={styles.layout} className="messenger-layout">
      <aside
        style={styles.sidebar}
        className={`sidebar ${showSidebar ? '' : 'mobile-hidden'}`}
        aria-hidden={!showSidebar}
      >
        <div style={styles.sidebarHeader} className="messenger-sidebar-header">
          <span style={styles.logo}>✉</span>
          <span style={styles.logoText}>Мессенджер</span>
          <button type="button" onClick={toggleTheme} style={styles.themeBtn} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          {user.is_superadmin && (
            <button type="button" onClick={() => setShowAdmin(true)} style={styles.logoutBtn}>Админ</button>
          )}
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
          onPinArchive={loadChats}
          loading={loading}
          currentUserId={user.id}
        />
      </aside>
      <main
        style={styles.main}
        className={`main ${showMain ? '' : 'mobile-hidden'}`}
        aria-hidden={!showMain}
      >
        {selectedChatId ? (
          <ChatWindow
            chatId={selectedChatId}
            chatType={selectedChat?.type}
            currentUser={user}
            onMessage={onMessageInChat}
            onChatsRefresh={loadChats}
            onBack={isMobile ? () => setSelectedChatId(null) : undefined}
          />
        ) : (
          <div style={styles.placeholder} className="messenger-placeholder">
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
  themeBtn: { padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 },
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
