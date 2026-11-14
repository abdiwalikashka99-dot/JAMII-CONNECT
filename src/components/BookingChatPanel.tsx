import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ChatMessage } from '../types';

interface Props {
  bookingId: number;
  bookingCode: string;
  currentUserId: number;
  incomingMessage: ChatMessage | null;
}

export const BookingChatPanel: React.FC<Props> = ({
  bookingId,
  bookingCode,
  currentUserId,
  incomingMessage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<ChatMessage[]>(`/api/bookings/${bookingId}/messages`)
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load messages');
        setLoading(false);
      });
  }, [bookingId]);

  useEffect(() => {
    if (incomingMessage && incomingMessage.bookingId === bookingId) {
      setMessages((prev) =>
        prev.some((m) => m.id === incomingMessage.id) ? prev : [...prev, incomingMessage]
      );
    }
  }, [incomingMessage, bookingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await apiFetch<ChatMessage>(`/api/bookings/${bookingId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: draft.trim() }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created]
      );
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50 flex flex-col h-72">
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white rounded-t-lg flex items-center justify-between">
        <span className="text-xs font-semibold text-navy-900">
          Direct Chat · <span className="font-mono">{bookingCode}</span>
        </span>
        <span className="text-xs text-slate-500">Live updates enabled</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">
            Start a conversation about arrival time, access instructions, or scope.
          </p>
        ) : (
          messages.map((m) => {
            const isMine = m.senderUserId === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[82%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                    isMine
                      ? 'bg-navy-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  <p className="font-semibold text-[11px] opacity-80 mb-0.5">
                    {m.senderName}
                  </p>
                  <p>{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="px-3 py-1 text-xs text-rose-600 bg-rose-50 border-t border-rose-200">
          {error}
        </p>
      )}

      <form onSubmit={handleSend} className="p-2 bg-white border-t border-slate-200 rounded-b-lg flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message..."
          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-md flex items-center gap-1 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
