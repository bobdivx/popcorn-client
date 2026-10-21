import { useEffect, useMemo, useState } from 'preact/hooks';
import { Users, Mail, Trash2, RefreshCw, UserPlus, Activity as ActivityIcon } from 'lucide-preact';
import { TokenManager } from '../../lib/client/storage';
import { useI18n } from '../../lib/i18n/useI18n';
import {
  deleteFriend,
  getFriends,
  getFriendsActivity,
  getFriendShare,
  inviteFriend,
  updateFriendShare,
  getLocalUsers,
  type Friend,
  type FriendActivity,
  type LocalUser,
} from '../../lib/api/popcorn-web';
import { serverApi } from '../../lib/client/server-api';
import { useConfirmDialog } from '../ui/useConfirmDialog';
import { Modal } from '../ui/Modal';

type ShareType = 'none' | 'all' | 'selected';

function extractLocalMediaIdFromInfoHash(infoHash: string): string | null {
  if (!infoHash) return null;
  if (infoHash.startsWith('local_')) {
    const id = infoHash.slice('local_'.length).trim();
    return id || null;
  }
  return null;
}

export default function FriendsManager() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const hasCloudToken = TokenManager.getCloudAccessToken() !== null;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviting, setInviting] = useState(false);

  const [shareState, setShareState] = useState<Record<string, { shareType: ShareType; mediaIds: string[]; loading: boolean }>>({});
  const [selectingForFriendId, setSelectingForFriendId] = useState<string | null>(null);
  const [libraryChoices, setLibraryChoices] = useState<Array<{ id: string; title: string }>>([]);
  const [librarySelected, setLibrarySelected] = useState<Record<string, boolean>>({});

  const localUserIdByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of localUsers) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    return map;
  }, [localUsers]);

  // Invités (utilisateurs locaux actifs) qui ne sont pas déjà des amis cloud : partage réglable
  // ici aussi. Sans réglage, un invité ne voit rien (« Aucun ») sur le serveur.
  const localGuests = useMemo(() => {
    const friendEmails = new Set(friends.map((f) => (f.email || '').toLowerCase()).filter(Boolean));
    return localUsers.filter((u) => u.isActive && !friendEmails.has((u.email || '').toLowerCase()));
  }, [friends, localUsers]);

  const shareTypeLabel = (st: ShareType) => {
    switch (st) {
      case 'none': return t('friendsManager.shareNone');
      case 'all': return t('friendsManager.shareAll');
      case 'selected': return t('friendsManager.shareSelected');
      default: return st;
    }
  };

  useEffect(() => {
    if (!hasCloudToken) {
      setLoading(false);
      setError(t('friendsManager.pageReservedForMainAccount'));
      return;
    }
    void reloadAll();
  }, [hasCloudToken]);

  const reloadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const [friendsRes, localUsersRes, activityRes] = await Promise.all([
        getFriends(),
        getLocalUsers(),
        getFriendsActivity(),
      ]);

      setFriends(friendsRes || []);
      setLocalUsers(localUsersRes || []);
      setActivity(activityRes || []);

      // Partage des invités : chargé d'emblée (la synchro serveur remplace tout le partage).
      const friendEmails = new Set((friendsRes || []).map((f) => (f.email || '').toLowerCase()).filter(Boolean));
      const guests = (localUsersRes || []).filter(
        (u) => u.isActive && !friendEmails.has((u.email || '').toLowerCase())
      );
      type GuestShare = { shareType: ShareType; mediaIds: string[]; loading: boolean };
      const guestShares: Array<[string, GuestShare]> = await Promise.all(
        guests.map(async (g): Promise<[string, GuestShare]> => {
          try {
            const res = await getFriendShare(g.id);
            if (res.success && res.data) {
              return [g.id, { shareType: res.data.shareType, mediaIds: res.data.mediaIds || [], loading: false }];
            }
          } catch {
            // ignore : « Aucun » par défaut
          }
          return [g.id, { shareType: 'none', mediaIds: [], loading: false }];
        })
      );
      if (guestShares.length > 0) {
        setShareState((s) => {
          const next = { ...s };
          for (const [id, st] of guestShares) next[id] = st;
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('friendsManager.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const loadFriendShare = async (friendId: string) => {
    setShareState((s) => ({ ...s, [friendId]: { shareType: 'none', mediaIds: [], loading: true, ...(s[friendId] || {}) } }));
    const res = await getFriendShare(friendId);
    if (!res.success || !res.data) {
      setShareState((s) => ({ ...s, [friendId]: { shareType: 'none', mediaIds: [], loading: false } }));
      return;
    }
    setShareState((s) => ({ ...s, [friendId]: { shareType: res.data!.shareType, mediaIds: res.data!.mediaIds || [], loading: false } }));
  };

  const syncBackendFriendShares = async (changed?: { id: string; shareType: ShareType; mediaIds: string[] }) => {
    // Réglage qui vient d'être enregistré (l'état React n'est pas encore à jour ici).
    const shareOf = (id: string) =>
      changed && changed.id === id ? { shareType: changed.shareType, mediaIds: changed.mediaIds } : shareState[id];
    // Construire la liste de "mes partages vers mes amis" (local_user_id du backend)
    const payloadFriends = friends
      .map((f) => {
        const friendEmail = (f.email || '').toLowerCase();
        const localUserId = friendEmail ? localUserIdByEmail.get(friendEmail) : undefined;
        if (!localUserId) return null;
        const share = shareOf(f.friendId);
        const shareType = share?.shareType || f.shareType || 'none';
        const mediaIds = share?.mediaIds || [];
        return { local_user_id: localUserId, share_type: shareType, media_ids: shareType === 'selected' ? mediaIds : [] };
      })
      .filter(Boolean) as Array<{ local_user_id: string; share_type: ShareType; media_ids: string[] }>;

    // Invités : même id que sur le serveur ; « none » par défaut.
    for (const g of localGuests) {
      const share = shareOf(g.id);
      const shareType = share?.shareType || 'none';
      payloadFriends.push({
        local_user_id: g.id,
        share_type: shareType,
        media_ids: shareType === 'selected' ? share?.mediaIds || [] : [],
      });
    }

    if (payloadFriends.length === 0) return;

    try {
      await serverApi.syncFriendShares({ replace_all: true, friends: payloadFriends });
    } catch {
      // non bloquant
    }
  };

  const handleInvite = async (e: Event) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('friendsManager.pleaseEnterEmail'));
      return;
    }
    try {
      setInviting(true);
      setError(null);
      setSuccess(null);
      const res = await inviteFriend(email.trim(), displayName.trim() || undefined);
      if (!res.success) {
        setError(res.message || t('friendsManager.errorInvitation'));
        return;
      }
      setSuccess(res.message || t('friendsManager.friendAdded'));
      setEmail('');
      setDisplayName('');
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('friendsManager.errorInvitation'));
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async (friendId: string, friendEmail?: string | null) => {
    const msg = friendEmail
      ? t('friendsManager.confirmDeleteFriendWithEmail', { email: friendEmail })
      : t('friendsManager.confirmDeleteFriend');
    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: msg,
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }
    try {
      setError(null);
      setSuccess(null);
      const res = await deleteFriend(friendId);
      if (!res.success) {
        setError(res.message || t('friendsManager.errorDelete'));
        return;
      }
      setSuccess(res.message || t('friendsManager.friendRemoved'));
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('friendsManager.errorDelete'));
    }
  };

  const handleShareTypeChange = async (friendId: string, next: ShareType) => {
    try {
      setError(null);
      setSuccess(null);
      const current = shareState[friendId];
      const mediaIds = current?.mediaIds || [];

      // « Sélection » sans média : choisir d'abord les médias (popcorn-web exige une sélection).
      if (next === 'selected' && mediaIds.length === 0) {
        setShareState((s) => ({ ...s, [friendId]: { shareType: 'selected', mediaIds: [], loading: false } }));
        await openMediaSelector(friendId);
        return;
      }

      // Si on passe en selected sans sélection, on laisse l'utilisateur choisir ensuite
      const res = await updateFriendShare(friendId, next, next === 'selected' ? mediaIds : undefined);
      if (!res.success) {
        setError(res.message || t('friendsManager.errorUpdateShare'));
        return;
      }
      setSuccess(t('friendsManager.shareUpdated'));
      await loadFriendShare(friendId);
      await syncBackendFriendShares({ id: friendId, shareType: next, mediaIds: next === 'selected' ? mediaIds : [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('friendsManager.errorUpdate'));
    }
  };

  const openMediaSelector = async (friendId: string) => {
    setSelectingForFriendId(friendId);
    setLibraryChoices([]);
    setLibrarySelected({});
    setError(null);

    const libRes = await serverApi.getLibrary();
    if (!libRes.success || !Array.isArray(libRes.data)) {
      setError(libRes.message || t('friendsManager.errorLoadLibrary'));
      return;
    }

    const items = (libRes.data as any[])
      .map((m: any) => {
        const id = extractLocalMediaIdFromInfoHash(String(m?.info_hash || ''));
        const title = String(m?.name || m?.title || m?.slug || m?.download_path || 'Media');
        return id ? { id, title } : null;
      })
      .filter(Boolean) as Array<{ id: string; title: string }>;

    const existing = shareState[friendId]?.mediaIds || [];
    const selected: Record<string, boolean> = {};
    for (const it of items) {
      selected[it.id] = existing.includes(it.id);
    }

    setLibraryChoices(items);
    setLibrarySelected(selected);
  };

  const applyMediaSelection = async () => {
    const friendId = selectingForFriendId;
    if (!friendId) return;
    const ids = Object.entries(librarySelected)
      .filter(([, v]) => v)
      .map(([k]) => k);

    try {
      setError(null);
      setSuccess(null);
      const res = await updateFriendShare(friendId, 'selected', ids);
      if (!res.success) {
        setError(res.message || t('friendsManager.errorUpdateShare'));
        return;
      }
      setSuccess(t('friendsManager.shareUpdated'));
      setSelectingForFriendId(null);
      await loadFriendShare(friendId);
      await syncBackendFriendShares({ id: friendId, shareType: 'selected', mediaIds: ids });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('friendsManager.errorUpdateShare'));
    }
  };

  if (!hasCloudToken) {
    return (
      <div class="bg-red-900/30 border border-red-700 rounded-lg p-6">
        <p class="text-red-300">{t('friendsManager.pageReservedForMainAccountLong')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div class="flex justify-center items-center py-12">
        <div class="loading loading-spinner loading-lg text-primary-600"></div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Users class="w-6 h-6" />
          {t('friendsManager.title')}
        </h2>
        <p class="text-gray-400">{t('friendsManager.subtitle')}</p>
        <p class="text-gray-400 mt-2 text-sm bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          {t('settingsPages.friends.librariesSharedExplanation')}
        </p>
      </div>

      {error && (
        <div class="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p class="text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div class="bg-green-900/30 border border-green-700 rounded-lg p-4">
          <p class="text-green-300">{success}</p>
        </div>
      )}

      {/* Invitation */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <UserPlus class="w-5 h-5" />
          {t('friendsManager.inviteFriend')}
        </h3>
        <form onSubmit={handleInvite} class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-white mb-2">{t('friendsManager.emailRequired')}</label>
            <input
              type="email"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder={t('friendsManager.emailPlaceholder')}
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              required
              disabled={inviting}
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-white mb-2">{t('friendsManager.displayNameOptional')}</label>
            <input
              type="text"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder={t('friendsManager.displayNamePlaceholder')}
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              disabled={inviting}
            />
          </div>
          <button
            type="submit"
            class="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={inviting || !email.trim()}
          >
            {inviting ? (
              <>
                <span class="loading loading-spinner loading-sm"></span>
                {t('friendsManager.sending')}
              </>
            ) : (
              <>
                <Mail class="w-4 h-4" />
                {t('friendsManager.sendInvitation')}
              </>
            )}
          </button>
        </form>
      </div>

      {/* Liste */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">{t('friendsManager.myFriends')}</h3>
          <button
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2"
            onClick={() => reloadAll()}
          >
            <RefreshCw class="w-4 h-4" />
            {t('friendsManager.refresh')}
          </button>
        </div>

        {friends.length === 0 ? (
          <p class="text-gray-400">{t('friendsManager.noFriends')}</p>
        ) : (
          <div class="space-y-3">
            {friends.map((f) => (
              <div key={f.friendId} class="p-4 rounded-lg bg-gray-800/40 border border-gray-700">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div class="text-white font-semibold">{f.email || f.friendId}</div>
                    <div class="text-sm text-gray-400">{t('friendsManager.currentShare')}: {shareTypeLabel(shareState[f.friendId]?.shareType || f.shareType)}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                      onClick={() => loadFriendShare(f.friendId)}
                      disabled={shareState[f.friendId]?.loading}
                    >
                      {shareState[f.friendId]?.loading ? '...' : t('friendsManager.viewShare')}
                    </button>
                    <button
                      class="px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg flex items-center gap-2"
                      onClick={() => handleDelete(f.friendId, f.email)}
                    >
                      <Trash2 class="w-4 h-4" />
                      {t('common.delete')}
                    </button>
                  </div>
                </div>

                {/* Partage */}
                <div class="mt-3 flex flex-col md:flex-row gap-3 md:items-center">
                  <label class="text-sm text-gray-300">{t('friendsManager.shareType')}</label>
                  <select
                    class="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    value={shareState[f.friendId]?.shareType || f.shareType}
                    onChange={(e) => handleShareTypeChange(f.friendId, (e.target as HTMLSelectElement).value as ShareType)}
                  >
                    <option value="none">{t('friendsManager.shareNone')}</option>
                    <option value="all">{t('friendsManager.shareAll')}</option>
                    <option value="selected">{t('friendsManager.shareSelected')}</option>
                  </select>

                  {(shareState[f.friendId]?.shareType || f.shareType) === 'selected' && (
                    <>
                      <button
                        class="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
                        onClick={() => openMediaSelector(f.friendId)}
                      >
                        {t('friendsManager.selectMedia')}
                      </button>
                      <div class="text-sm text-gray-400">
                        {t('friendsManager.mediaSelectedCount', { count: shareState[f.friendId]?.mediaIds?.length || 0 })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invités (utilisateurs locaux) */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-2">{t('friendsManager.localGuestsTitle')}</h3>
        <p class="text-sm text-gray-400 mb-4">{t('friendsManager.localGuestsDescription')}</p>
        {localGuests.length === 0 ? (
          <p class="text-gray-400">{t('friendsManager.noLocalGuests')}</p>
        ) : (
          <div class="space-y-3">
            {localGuests.map((g) => {
              const st: ShareType = shareState[g.id]?.shareType || 'none';
              return (
                <div key={g.id} class="p-4 rounded-lg bg-gray-800/40 border border-gray-700">
                  <div class="text-white font-semibold">{g.displayName ? `${g.displayName} (${g.email})` : g.email}</div>
                  <div class="text-sm text-gray-400">{t('friendsManager.currentShare')}: {shareTypeLabel(st)}</div>
                  <div class="mt-3 flex flex-col md:flex-row gap-3 md:items-center">
                    <label class="text-sm text-gray-300">{t('friendsManager.shareType')}</label>
                    <select
                      class="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      value={st}
                      disabled={shareState[g.id]?.loading}
                      onChange={(e) => handleShareTypeChange(g.id, (e.target as HTMLSelectElement).value as ShareType)}
                    >
                      <option value="none">{t('friendsManager.shareNone')}</option>
                      <option value="all">{t('friendsManager.shareAll')}</option>
                      <option value="selected">{t('friendsManager.shareSelected')}</option>
                    </select>
                    {st === 'selected' && (
                      <>
                        <button
                          class="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
                          onClick={() => openMediaSelector(g.id)}
                        >
                          {t('friendsManager.selectMedia')}
                        </button>
                        <div class="text-sm text-gray-400">
                          {t('friendsManager.mediaSelectedCount', { count: shareState[g.id]?.mediaIds?.length || 0 })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activité */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ActivityIcon class="w-5 h-5" />
          {t('friendsManager.recentActivity')}
        </h3>
        {activity.length === 0 ? (
          <p class="text-gray-400">{t('friendsManager.noActivity')}</p>
        ) : (
          <div class="space-y-2">
            {activity.slice(0, 50).map((a) => (
              <div key={a.id} class="text-sm text-gray-300">
                <span class="text-gray-400">{new Date(a.createdAt).toLocaleString()}</span> — {a.action} — {a.friendId}
                {a.mediaTitle ? ` — ${a.mediaTitle}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!selectingForFriendId}
        onClose={() => setSelectingForFriendId(null)}
        title={t('friendsManager.selectMediaToShare')}
        size="xl"
      >
        {libraryChoices.length === 0 ? (
          <p class="text-gray-400">{t('friendsManager.noMediaSelectable')}</p>
        ) : (
          <div class="space-y-2 max-h-[50vh] overflow-y-auto">
            {libraryChoices.map((m) => (
              <label key={m.id} class="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!librarySelected[m.id]}
                  onChange={(e) => setLibrarySelected((s) => ({ ...s, [m.id]: (e.target as HTMLInputElement).checked }))}
                />
                <span class="text-gray-200">{m.title}</span>
                <span class="text-xs text-gray-500">{m.id}</span>
              </label>
            ))}
          </div>
        )}
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg"
            onClick={() => setSelectingForFriendId(null)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
            onClick={applyMediaSelection}
            data-autofocus
          >
            {t('common.apply')}
          </button>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  );
}

