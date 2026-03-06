import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { TokenManager } from '../../lib/client/storage';
import {
  getFeedbackThreads,
  getFeedbackThread,
  sendFeedbackMessage,
  getFeedbackUnreadCount,
  type FeedbackThread,
  type FeedbackMessage,
} from '../../lib/api/popcorn-web';
import { notificationService } from '../../lib/services/notification-service';

const POLL_INTERVAL_MS = 45000;
const NOTIFICATION_TAG = 'feedback-reply';

function formatDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackChat() {
  const { t } = useI18n();
  const [threads, setThreads] = useState<FeedbackThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<FeedbackThread | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [lastUnreadCount, setLastUnreadCount] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasCloudToken = !!TokenManager.getCloudAccessToken();

  const loadThreads = useCallback(async () => {
    const list = await getFeedbackThreads();
    setThreads(list || []);
    return list;
  }, []);

  const loadThread = useCallback(async (thread: FeedbackThread) => {
    const data = await getFeedbackThread(thread.id);
    if (data) {
      setMessages(data.messages);
      setSelectedThread(data.thread);
    }
  }, []);

  const checkUnreadAndNotify = useCallback(async () => {
    if (!hasCloudToken) return;
    const count = await getFeedbackUnreadCount();
    if (count === null) return;
    if (lastUnreadCount !== null && count > lastUnreadCount) {
      notificationService.notify({
        title: t('feedback.newReply') || 'Nouvelle réponse',
        body: t('feedback.newReplyBody') || 'Vous avez reçu une nouvelle réponse à votre feedback',
        channel: 'feedback',
        tag: NOTIFICATION_TAG,
      });
    }
    setLastUnreadCount(count);
  }, [hasCloudToken, lastUnreadCount, t]);

  useEffect(() => {
    if (!hasCloudToken) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      await loadThreads();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [hasCloudToken, loadThreads]);

  useEffect(() => {
    if (!hasCloudToken) return;
    const run = async () => {
      const count = await getFeedbackUnreadCount();
      setLastUnreadCount(count ?? 0);
    };
    run();
    pollRef.current = setInterval(checkUnreadAndNotify, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [hasCloudToken, checkUnreadAndNotify]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateThread = async () => {
    if (!newSubject.trim() || !newContent.trim()) return;
    const subject = newSubject.trim();
    const content = newContent.trim();
    setSending(true);
    setError(null);
    const res = await sendFeedbackMessage({ subject, content });
    setSending(false);
    if (res.success && res.threadId) {
      setNewSubject('');
      setNewContent('');
      const list = await loadThreads();
      const thread = (list || []).find((t) => t.id === res.threadId) || {
        id: res.threadId,
        subject,
        status: 'open',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
        userId: '',
      };
      setSelectedThread(thread as FeedbackThread);
      await loadThread(thread as FeedbackThread);
    } else {
      setError(res.message || 'Erreur');
    }
  };

  const handleReply = async () => {
    if (!selectedThread || !replyContent.trim()) return;
    setSending(true);
    setError(null);
    const res = await sendFeedbackMessage({ threadId: selectedThread.id, content: replyContent.trim() });
    setSending(false);
    if (res.success) {
      setReplyContent('');
      await loadThread(selectedThread);
    } else {
      setError(res.message || 'Erreur');
    }
  };

  if (!hasCloudToken) {
    return (
      <div class="rounded-xl bg-white/5 border border-white/10 p-6">
        <p class="text-gray-400">{t('feedback.requireCloud') || 'Connectez-vous avec un compte cloud pour envoyer un feedback.'}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[300px]">
        <span class="loading loading-spinner loading-lg text-white"></span>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 rounded-xl bg-white/5 border border-white/10 p-4">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold">{t('feedback.conversations') || 'Conversations'}</h3>
            {threads.length > 0 && (
              <button
                onClick={() => setSelectedThread(null)}
                class="text-xs text-primary-400 hover:text-primary-300"
              >
                + {t('feedback.newThread') || 'Nouvelle conversation'}
              </button>
            )}
          </div>
          {threads.length === 0 ? (
            <p class="text-gray-400 text-sm">{t('feedback.noThreads') || 'Aucune conversation'}</p>
          ) : (
            <div class="space-y-2 max-h-[300px] overflow-y-auto">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadThread(t)}
                  class={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedThread?.id === t.id ? 'bg-primary/30 border border-primary/50' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div class="font-medium truncate text-sm">{t.subject}</div>
                  <div class="text-xs text-gray-400">{formatDate(t.lastMessageAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="lg:col-span-2 rounded-xl bg-white/5 border border-white/10 p-4">
          {selectedThread ? (
            <>
              <div class="flex justify-between items-start mb-4">
                <h3 class="font-bold">{selectedThread.subject}</h3>
                <span class="text-xs text-gray-400">{formatDate(selectedThread.lastMessageAt)}</span>
              </div>
              <div class="space-y-3 max-h-[280px] overflow-y-auto mb-4 p-3 bg-black/20 rounded-lg">
                {messages.map((m) => (
                  <div key={m.id} class={`flex ${m.senderType === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div class={`max-w-[85%] rounded-lg px-4 py-2 ${m.senderType === 'admin' ? 'bg-primary/30' : 'bg-white/10'}`}>
                      <div class="text-xs text-gray-400 mb-1">{m.senderType === 'admin' ? (t('feedback.admin') || 'Admin') : (t('feedback.you') || 'Vous')}</div>
                      <div class="whitespace-pre-wrap text-sm">{m.content}</div>
                      <div class="text-xs text-gray-500 mt-1">{formatDate(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div class="flex gap-2">
                <textarea
                  value={replyContent}
                  onInput={(e) => setReplyContent((e.target as HTMLTextAreaElement).value)}
                  placeholder={t('feedback.replyPlaceholder') || 'Votre réponse...'}
                  class="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 min-h-[70px] resize-y text-sm"
                  rows={2}
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyContent.trim()}
                  class="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-50 text-white font-medium self-end"
                >
                  {sending ? '...' : (t('feedback.send') || 'Envoyer')}
                </button>
              </div>
            </>
          ) : (
            <div class="py-8">
              <h3 class="font-bold mb-4">{t('feedback.newMessage') || 'Nouveau message'}</h3>
              <p class="text-gray-400 text-sm mb-4">{t('feedback.newMessageDesc') || 'Envoyez un message à l\'équipe pour signaler un problème ou une suggestion.'}</p>
              <div class="space-y-3">
                <input
                  type="text"
                  value={newSubject}
                  onInput={(e) => setNewSubject((e.target as HTMLInputElement).value)}
                  placeholder={t('feedback.subjectPlaceholder') || 'Sujet'}
                  class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500"
                />
                <textarea
                  value={newContent}
                  onInput={(e) => setNewContent((e.target as HTMLTextAreaElement).value)}
                  placeholder={t('feedback.contentPlaceholder') || 'Votre message...'}
                  class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 min-h-[100px] resize-y"
                  rows={4}
                />
                <button
                  onClick={handleCreateThread}
                  disabled={sending || !newSubject.trim() || !newContent.trim()}
                  class="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-50 text-white font-medium"
                >
                  {sending ? '...' : (t('feedback.send') || 'Envoyer')}
                </button>
              </div>
            </div>
          )}
          {error && <p class="text-red-400 text-sm mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
