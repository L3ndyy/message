import React, { useState } from 'react';
import { register } from './api';

export default function Register({ onRegister, onSwitch }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(username.trim(), password, displayName.trim() || undefined);
      localStorage.setItem('token', data.token);
      onRegister(data.user);
    } catch (err) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Регистрация</h1>
        <p style={styles.subtitle}>Создайте аккаунт для общения</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Имя пользователя (от 3 символов)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            autoComplete="username"
            minLength={3}
            required
          />
          <input
            type="text"
            placeholder="Отображаемое имя (необязательно)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={styles.input}
            autoComplete="name"
          />
          <input
            type="password"
            placeholder="Пароль (от 6 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="new-password"
            minLength={6}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        <button type="button" onClick={onSwitch} style={styles.linkBtn}>
          Уже есть аккаунт? Войти
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
