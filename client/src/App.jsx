import React, { useState, useEffect } from 'react';
import { getMe } from './api';
import { connectSocket, disconnectSocket } from './socket';
import Login from './Login';
import Register from './Register';
import Messenger from './Messenger';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');

  useEffect(() => {
    getMe()
      .then((u) => {
        setUser(u);
        if (u) connectSocket();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const onLogin = (u) => {
    setUser(u);
    connectSocket();
  };

  const onLogout = () => {
    setUser(null);
    disconnectSocket();
    localStorage.removeItem('token');
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <span>Загрузка...</span>
      </div>
    );
  }

  if (!user) {
    return authMode === 'login' ? (
      <Login onLogin={onLogin} onSwitch={() => setAuthMode('register')} />
    ) : (
      <Register onRegister={onLogin} onSwitch={() => setAuthMode('login')} />
    );
  }

  return <Messenger user={user} onLogout={onLogout} />;
}

const styles = {
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: 12,
    color: 'var(--tg-text-muted)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--tg-border)',
    borderTopColor: 'var(--tg-accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
