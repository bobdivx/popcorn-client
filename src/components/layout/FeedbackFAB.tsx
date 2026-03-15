import { useState, useEffect } from 'preact/hooks';
import { MessageCircle } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { TokenManager } from '../../lib/client/storage';
import { getFeedbackUnreadCount } from '../../lib/api/popcorn-web';
import { Modal } from '../ui/Modal';
import FloatingActionButton from '../ui/FloatingActionButton';
import FeedbackChat from '../settings/FeedbackChat';
import { isTVPlatform } from '../../lib/utils/device-detection';

/**
 * Bouton flottant Feedback à intégrer dans le layout.
 * Visible uniquement si l'utilisateur est connecté avec un compte cloud.
 * Masqué sur Android TV / TV (télécommande, pas d’usage du FAB).
 */
export default function FeedbackFAB() {
  const { t } = useI18n();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const isTV = typeof window !== 'undefined' && isTVPlatform();

  useEffect(() => {
    if (!serverApi.isAuthenticated()) {
      setUser(null);
      return;
    }
    (async () => {
      try {
        const response = await serverApi.getMe();
        if (response.success && response.data) setUser(response.data);
        else setUser(null);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  const hasCloud = user != null && !!TokenManager.getCloudAccessToken();
  const visible = hasCloud && !isTV;

  useEffect(() => {
    if (!hasCloud) {
      setFeedbackUnreadCount(0);
      return;
    }
    const fetchUnread = async () => {
      try {
        const count = await getFeedbackUnreadCount();
        setFeedbackUnreadCount(count ?? 0);
      } catch {
        setFeedbackUnreadCount(0);
      }
    };
    fetchUnread();
    const POLL_MS = 45000;
    const interval = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(interval);
  }, [hasCloud]);

  const handleClose = async () => {
    setFeedbackOpen(false);
    if (hasCloud) {
      try {
        const count = await getFeedbackUnreadCount();
        setFeedbackUnreadCount(count ?? 0);
      } catch {
        setFeedbackUnreadCount(0);
      }
    }
  };

  return (
    <>
      <FloatingActionButton
        icon={MessageCircle}
        ariaLabel={feedbackUnreadCount > 0 ? `${t('nav.feedback')} (${feedbackUnreadCount} ${t('feedback.unread') || 'non lu(s)'})` : t('nav.feedback')}
        onClick={() => setFeedbackOpen(true)}
        badge={feedbackUnreadCount}
        position="bottom-right"
        visible={visible}
      />
      <Modal
        isOpen={feedbackOpen}
        onClose={handleClose}
        title={t('settingsPages.feedback.title') || t('nav.feedback')}
        size="xl"
        closeOnBackdropClick
        closeOnEscape
        className="max-h-[90vh]"
      >
        <div className="min-h-[400px]">
          <FeedbackChat />
        </div>
      </Modal>
    </>
  );
}
