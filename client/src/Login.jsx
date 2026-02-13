import React, { useState } from 'react';
import { login } from './api';

export default function Login({ onLogin, onSwitch }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      localStorage.setItem('token', data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Вход</h1>
        <p style={styles.subtitle}>Мессенджер с шифрованием</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <button type="button" onClick={onSwitch} style={styles.linkBtn}>
          Нет аккаунта? Зарегистрироваться
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'radial-gradient(ellipse at 50% 0%, var(--tg-surface) 0%, transparent 60%)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    background: 'var(--tg-panel)',
    borderRadius: 'var(--radius)',
    padding: 32,
    boxShadow: 'var(--shadow)',
    border: '1px solid var(--tg-border)',
  },
  title: { margin: '0 0 4px', fontSize: 24, fontWeight: 700 },
  subtitle: { margin: '0 0 24px', color: 'var(--tg-text-muted)', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--tg-border)',
    background: 'var(--tg-surface)',
    color: 'var(--tg-text)',
    fontSize: 16,
  },
  error: { margin: 0, color: 'var(--tg-red)', fontSize: 14 },
  btn: {
    padding: '12px 24px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--tg-accent)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 16,
    marginTop: 8,
  },
  linkBtn: {
    marginTop: 16,
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--tg-accent)',
    fontSize: 14,
    cursor: 'pointer',
  },
};
