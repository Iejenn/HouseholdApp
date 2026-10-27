import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import type { ChatMessage, Household, UserProfile } from '../types';

function formatTime(ms: number): string {
  const d = new Date(ms);
  // 24-hour clock, as is usual in Dutch
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

// How long (ms) the user needs to hold a bubble before the delete icon appears
const LONG_PRESS_MS = 450;
// How long the delete icon stays visible before auto-hiding if untapped
const AUTO_HIDE_MS = 3000;

export default function ChatScreen() {
  const { user, profile } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Which message (if any) currently has its delete icon revealed via long-press
  const [longPressId, setLongPressId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const householdId = profile?.householdId;

  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'households', householdId, 'messages'),
        orderBy('createdAt', 'asc')
      ),
      (snap) => {
        const next: ChatMessage[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          next.push({
            id: d.id,
            householdId,
            senderId: data.senderId,
            senderName: data.senderName ?? 'Iemand',
            text: data.text ?? '',
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
          });
        });
        setMessages(next);
      }
    );
    return unsub;
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) setHousehold(snap.data() as Household);
    });
    return unsub;
  }, [householdId]);

  useEffect(() => {
    if (!household) return;
    const unsubs = household.memberIds.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setMemberNames((prev) => ({ ...prev, [uid]: data.displayName }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [household]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Clean up any pending timers if the component unmounts mid-press
  useEffect(() => {
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, []);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !user || !profile || !householdId) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'households', householdId, 'messages'), {
        senderId: user.uid,
        senderName: profile.displayName,
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    } catch {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: string) {
    if (!householdId) return;
    setLongPressId(null);
    try {
      await deleteDoc(doc(db, 'households', householdId, 'messages', messageId));
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  }

  // Starts the hold timer; only called for the current user's own bubbles
  function startPress(messageId: string) {
    pressTimer.current = setTimeout(() => {
      setLongPressId(messageId);
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
      autoHideTimer.current = setTimeout(() => setLongPressId(null), AUTO_HIDE_MS);
    }, LONG_PRESS_MS);
  }

  // Cancels the hold if released/moved-away before LONG_PRESS_MS elapses
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  const otherMembers = household
    ? household.memberIds.filter((uid) => uid !== user?.uid)
    : [];

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">Chat</h2>
          <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 2 }}>
            {otherMembers.length > 0
              ? otherMembers
                  .map((uid) => memberNames[uid] ?? '…')
                  .join(', ')
              : 'Nog alleen jij — nodig je huisgenoot uit!'}
          </p>
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>💬</p>
            <p>Zeg hallo!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.senderId === user?.uid;
            const showAvatar = !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId);
            const showDeleteIcon = isMe && longPressId === msg.id;
            return (
              <div key={msg.id} className={`chat-bubble-row${isMe ? ' me' : ''}`}>
                {!isMe && (
                  <div className="chat-avatar" style={{ opacity: showAvatar ? 1 : 0 }}>
                    {(msg.senderName ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="chat-bubble-wrap">
                  {!isMe && showAvatar && (
                    <span className="chat-sender">{msg.senderName}</span>
                  )}
                  <div
                    className={`chat-bubble${isMe ? ' me' : ''}`}
                    onMouseDown={isMe ? () => startPress(msg.id) : undefined}
                    onMouseUp={isMe ? cancelPress : undefined}
                    onMouseLeave={isMe ? cancelPress : undefined}
                    onTouchStart={isMe ? () => startPress(msg.id) : undefined}
                    onTouchEnd={isMe ? cancelPress : undefined}
                    onTouchCancel={isMe ? cancelPress : undefined}
                    onContextMenu={isMe ? (e) => e.preventDefault() : undefined}
                  >
                    <p className="chat-text">{msg.text}</p>
                    {showDeleteIcon && (
                      <button
                        className="chat-delete-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(msg.id);
                        }}
                        aria-label="Bericht verwijderen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="chat-time">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-input-bar">
        <input
          className="input chat-input"
          placeholder="Typ een bericht…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          aria-label="Versturen"
        >
          ➤
        </button>
      </div>
    </>
  );
}