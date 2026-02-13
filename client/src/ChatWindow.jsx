import React, { useState, useEffect, useRef } from 'react';
import { getMessages, uploadFile, fileUrl, getTopics, createTopic, editMessage, deleteMessage, exportChat, createInvite } from './api';
import { getSocket, connectSocket } from './socket';

const BEEP = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUvvT18=';
const playBeep = () => {
  try {
    const a = new Audio(BEEP);
    a.volume = 0.3;
    a.play().catch(() => {});
  } catch (_) {}
};

export default function ChatWindow({ chatId, chatType, currentUser, onMessage, onChatsRefresh, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const listRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const socket = getSocket() || connectSocket();

  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }, []);

  useEffect(() => {
    setMessages([]);
    setAttachment(null);
    setReplyTo(null);
    getMessages(chatId, selectedTopicId).then(setMessages);
    if (socket) {
      socket.emit('chat:join', chatId);
      return () => socket.emit('chat:leave', chatId);
    }
  }, [chatId, selectedTopicId, socket]);

  useEffect(() => {
    setLoadingTopics(true);
    getTopics(chatId)
      .then(setTopics)
      .catch(() => setTopics([]))
      .finally(() => setLoadingTopics(false));
    setSelectedTopicId(null);
  }, [chatId]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      if (msg.chat_id === chatId && ((selectedTopicId && msg.topic_id === selectedTopicId) || (!selectedTopicId && !msg.topic_id))) {
        setMessages((prev) => [...prev, msg]);
        onMessage(chatId, msg);
        if (msg.sender_id !== currentUser.id) {
          playBeep();
          if (document.hidden && Notification.permission === 'granted') {
            new Notification('Новое сообщение', { body: (msg.sender_display_name || msg.sender_username) + ': ' + (msg.text || '[файл]').slice(0, 50) });
          }
        }
      }
    };
    const onTyping = (data) => {
      if (data.chat_id !== chatId || data.user_id === currentUser.id) return;
      setTypingUser(data.username);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
    };
    const onUpdated = (data) => {
      if (data.id) setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, text: data.text, edited_at: data.edited_at } : m)));
    };
    const onDeleted = (data) => {
      if (data.id) setMessages((prev) => prev.filter((m) => m.id !== data.id));
    };
    socket.on('message:new', onNew);
    socket.on('typing', onTyping);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    return () => {
      socket.off('message:new', onNew);
      socket.off('typing', onTyping);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
    };
  }, [chatId, socket, onMessage, currentUser.id]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      alert('Файл не более 100 МБ');
      return;
    }
    setAttachment({ file, name: file.name, size: file.size, mime: file.type });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && !attachment) return;

    setSending(true);
    let att = null;
    if (attachment?.file) {
      setUploading(true);
      try {
        const up = await uploadFile(attachment.file);
        att = { path: up.path, name: up.name, mime: up.mime, size: up.size };
      } catch (err) {
        alert(err.message || 'Ошибка загрузки файла');
        setUploading(false);
        setSending(false);
        return;
      }
      setUploading(false);
      setAttachment(null);
    }

    socket?.emit(
      'message:send',
      {
        chat_id: chatId,
        text: text || undefined,
        attachment: att || undefined,
        topic_id: selectedTopicId || undefined,
        reply_to_id: replyTo?.id || undefined,
      },
      (res) => {
        setSending(false);
        if (res?.error) alert(res.error);
        if (res?.ok && res.message) {
          setMessages((prev) => [...prev, res.message]);
          setInput('');
          setReplyTo(null);
        }
      }
    );
    if (!socket) {
      setSending(false);
      setInput('');
      setReplyTo(null);
    }
  };

  const onInputChange = (e) => {
    setInput(e.target.value);
    if (socket) {
      socket.emit('typing', { chat_id: chatId });
    }
  };

  const handleExport = async () => {
    try {
      const text = await exportChat(chatId);
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chat-${chatId}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message || 'Ошибка экспорта');
    }
  };

  const handleCreateInvite = async () => {
    try {
      const { invite_path, token } = await createInvite(chatId);
      const full = window.location.origin + (window.location.pathname || '') + (invite_path || `/join/${token}`);
      setInviteLink(full);
      if (navigator.clipboard) navigator.clipboard.writeText(full).then(() => alert('Ссылка скопирована'));
    } catch (e) {
      alert(e.message || 'Ошибка');
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const isImage = (mime) => /^image\//.test(mime || '');

  const handleCreateTopic = async () => {
    const title = window.prompt('Название темы');
    if (!title) return;
    try {
      const t = await createTopic(chatId, title);
      setTopics((prev) => [...prev, t]);
      setSelectedTopicId(t.id);
    } catch (e) {
      alert(e.message || 'Не удалось создать тему');
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header} className="messenger-header chat-header-safe">
        {onBack && (
          <button type="button" onClick={onBack} style={styles.backBtn} aria-label="Назад к чатам">
            ←
          </button>
        )}
        <span style={styles.headerTitle}>Чат</span>
        {typingUser && <span style={styles.typing}>{typingUser} печатает...</span>}
        <span style={styles.encrypted}>🔒</span>
        <button type="button" onClick={handleExport} style={styles.iconBtn} title="Экспорт">📄</button>
        {chatType === 'group' && (
          <button type="button" onClick={handleCreateInvite} style={styles.iconBtn} title="Пригласить">🔗</button>
        )}
      </div>
      {inviteLink && (
        <div style={styles.inviteBar}>
          <span style={styles.inviteText}>{inviteLink}</span>
          <button type="button" onClick={() => setInviteLink('')}>×</button>
        </div>
      )}

      <div style={styles.topicBar} className="topic-bar-scroll">
        <button
          type="button"
          onClick={() => setSelectedTopicId(null)}
          style={{
            ...styles.topicBtn,
            ...(selectedTopicId === null ? styles.topicBtnActive : {}),
          }}
        >
          Общий
        </button>
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTopicId(t.id)}
            style={{
              ...styles.topicBtn,
              ...(selectedTopicId === t.id ? styles.topicBtnActive : {}),
            }}
          >
            {t.title}
          </button>
        ))}
        <button type="button" onClick={handleCreateTopic} style={styles.topicAddBtn}>
          +
        </button>
      </div>

      <div ref={listRef} style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.msgWrap,
              ...(msg.sender_id === currentUser.id ? styles.msgOwn : {}),
            }}
          >
            <div style={{ ...styles.msgBubble, ...(msg.sender_id === currentUser.id ? styles.msgOwnBubble : {}) }}>
              {msg.reply_to && (
                <div style={styles.replyQuote}>
                  <span style={styles.replyName}>{msg.reply_to.sender_name}</span>
                  <span style={styles.replyText}>{msg.reply_to.text?.slice(0, 80) || '…'}</span>
                </div>
              )}
              {msg.sender_id !== currentUser.id && (
                <span style={styles.msgSender}>{msg.sender_display_name || msg.sender_username}</span>
              )}
              {msg.attachment && (
                <div style={styles.attachment}>
                  {isImage(msg.attachment.mime) ? (
                    <a href={fileUrl(msg.attachment.path)} target="_blank" rel="noopener noreferrer">
                      <img src={fileUrl(msg.attachment.path)} alt={msg.attachment.name} style={styles.thumb} />
                    </a>
                  ) : (
                    <a href={fileUrl(msg.attachment.path)} download={msg.attachment.name} style={styles.fileLink}>
                      📎 {msg.attachment.name}
                    </a>
                  )}
                </div>
              )}
              {msg.text && <p style={styles.msgText}>{msg.text}</p>}
              <div style={styles.msgMeta}>
                <span style={styles.msgTime}>{formatTime(msg.created_at)}{msg.edited_at ? ' (ред.)' : ''}</span>
                {msg.sender_id === currentUser.id && (
                  <>
                    <button type="button" onClick={() => setReplyTo(msg)} style={styles.msgActionBtn} title="Ответить">↩</button>
                    <button type="button" onClick={() => { const t = prompt('Новый текст', msg.text); if (t != null) editMessage(msg.id, t).then(() => setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, text: t, edited_at: Date.now() / 1000 } : m)))); }} style={styles.msgActionBtn} title="Изменить">✎</button>
                    <button type="button" onClick={() => { if (confirm('Удалить?')) deleteMessage(msg.id).then(() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))); }} style={styles.msgActionBtn} title="Удалить">🗑</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer} className="messenger-chat-footer chat-footer-safe">
        {replyTo && (
          <div style={styles.replyPreview}>
            <span>Ответ на: {(replyTo.text || replyTo.sender_display_name || 'сообщение').slice(0, 40)}</span>
            <button type="button" onClick={() => setReplyTo(null)} style={styles.removeAttach}>×</button>
          </div>
        )}
        {attachment && (
          <div style={styles.attachPreview}>
            <span>📎 {attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} style={styles.removeAttach}>
              ×
            </button>
          </div>
        )}
        <div style={styles.inputRow} className="messenger-chat-input-row">
          <label style={styles.fileLabel}>
            <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
            📎
          </label>
          <input
            type="text"
            placeholder="Сообщение..."
            value={input}
            onChange={onInputChange}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            style={styles.input}
            disabled={uploading || sending}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={(!input.trim() && !attachment) || uploading || sending}
            style={styles.sendBtn}
          >
            {uploading ? '...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  header: {
    padding: '12px 16px 12px 20px',
    borderBottom: '1px solid var(--tg-border)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--tg-border)',
    background: 'var(--tg-surface)',
    color: 'var(--tg-text)',
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  headerTitle: { fontWeight: 600, fontSize: 16, flex: 1 },
  typing: { fontSize: 12, color: 'var(--tg-text-muted)', fontStyle: 'italic' },
  encrypted: { fontSize: 12, color: 'var(--tg-green)' },
  iconBtn: { padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 },
  inviteBar: { padding: '8px 12px', background: 'var(--tg-surface)', borderBottom: '1px solid var(--tg-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 },
  inviteText: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  replyQuote: { marginBottom: 6, paddingLeft: 8, borderLeft: '3px solid var(--tg-accent)', fontSize: 12, color: 'var(--tg-text-muted)' },
  replyName: { display: 'block', fontWeight: 600, color: 'var(--tg-accent)' },
  replyText: { display: 'block' },
  replyPreview: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 8, background: 'var(--tg-surface)', borderRadius: 8, fontSize: 14 },
  msgMeta: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  msgActionBtn: { padding: 2, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, opacity: 0.7 },
  topicBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px 4px',
    borderBottom: '1px solid var(--tg-border)',
    overflowX: 'auto',
  },
  topicBtn: {
    borderRadius: 999,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--tg-text-muted)',
    padding: '4px 10px',
    fontSize: 12,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  topicBtnActive: {
    background: 'var(--tg-surface)',
    borderColor: 'var(--tg-border)',
    color: 'var(--tg-text)',
  },
  topicAddBtn: {
    borderRadius: '50%',
    width: 22,
    height: 22,
    border: '1px solid var(--tg-border)',
    background: 'transparent',
    color: 'var(--tg-text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  msgWrap: { display: 'flex', justifyContent: 'flex-start' },
  msgOwn: { justifyContent: 'flex-end' },
  msgBubble: {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    background: 'var(--tg-surface)',
    border: '1px solid var(--tg-border)',
  },
  msgOwnBubble: { background: 'var(--tg-accent)', borderColor: 'var(--tg-accent)' },
  msgSender: { fontSize: 12, color: 'var(--tg-accent)', display: 'block', marginBottom: 4 },
  msgText: { margin: '0 0 4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  attachment: { marginBottom: 6 },
  thumb: { maxWidth: '100%', maxHeight: 200, borderRadius: 'var(--radius-sm)', display: 'block' },
  fileLink: { color: 'var(--tg-accent)', fontSize: 14 },
  msgTime: { fontSize: 11, color: 'var(--tg-text-muted)' },
  footer: {
    padding: 12,
    borderTop: '1px solid var(--tg-border)',
    background: 'var(--tg-panel)',
  },
  attachPreview: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    marginBottom: 8,
    background: 'var(--tg-surface)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 14,
  },
  removeAttach: { background: 'none', border: 'none', color: 'var(--tg-red)', cursor: 'pointer', fontSize: 18 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  fileLabel: { cursor: 'pointer', fontSize: 20 },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--tg-border)',
    background: 'var(--tg-surface)',
    color: 'var(--tg-text)',
    fontSize: 15,
  },
  sendBtn: {
    padding: '12px 20px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--tg-accent)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
  },
};
