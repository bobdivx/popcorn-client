import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import Avatar from '../ui/Avatar';
import { getLocalProfile, updateLocalProfile, type LocalProfile } from '../../lib/client/profile';

export default function AccountSettings() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const p = getLocalProfile();
    setProfile(p);
    setDisplayName(p.displayName || '');
    setAvatarUrl(p.avatarDataUrl || '');
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getMe();
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        setError(response.message || 'Erreur lors du chargement des informations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[400px]">
        <span class="loading loading-spinner loading-lg text-white"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
        <span>{error}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div class="text-center py-12">
        <p class="text-gray-400">Aucune information utilisateur disponible</p>
      </div>
    );
  }

  const persist = (next: Partial<LocalProfile>) => {
    const merged = { ...profile, ...next };
    setProfile(merged);
    updateLocalProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handlePickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image (PNG/JPG/WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setError(null);
      setAvatarUrl(result);
      persist({ avatarDataUrl: result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div class="space-y-6 sm:space-y-8">
      {/* Profil local (UI) */}
      <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
        <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-6 sm:mb-8">Profil</h2>

        {saved && (
          <div class="alert alert-success mb-6">
            <span>Profil mis à jour</span>
          </div>
        )}

        {error && (
          <div class="alert alert-error mb-6">
            <span>{error}</span>
          </div>
        )}

        <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
          <div class="flex items-center gap-4">
            <Avatar
              email={user.email}
              displayName={displayName}
              profile={profile}
              sizeClassName="w-20 h-20 sm:w-24 sm:h-24 tv:w-28 tv:h-28"
              className="rounded-2xl"
            />
            <div class="text-sm text-gray-400">
              <div class="font-semibold text-white">Avatar</div>
              <div>Affiché dans le header et la navigation</div>
            </div>
          </div>

          <div class="flex-1 w-full space-y-4">
            <div class="form-control">
              <label class="label">
                <span class="label-text text-white font-semibold">Nom affiché</span>
              </label>
              <input
                type="text"
                class="input input-bordered bg-black/30 border-white/10 text-white"
                placeholder="Ex: Alex"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                onBlur={() => persist({ displayName: displayName.trim() || undefined })}
              />
              <label class="label">
                <span class="label-text-alt text-gray-400">Optionnel. Sinon, l’email est utilisé.</span>
              </label>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text text-white font-semibold">Image d’avatar</span>
              </label>

              <div class="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  class="input input-bordered bg-black/30 border-white/10 text-white flex-1"
                  placeholder="Collez une URL d’image (https://...)"
                  value={avatarUrl}
                  onInput={(e) => setAvatarUrl((e.target as HTMLInputElement).value)}
                  onBlur={() => persist({ avatarDataUrl: avatarUrl.trim() || undefined })}
                />
                <label class="btn btn-ghost glass-panel hover:bg-white/10 border border-white/10">
                  Importer…
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    onChange={(e) => handlePickFile((e.target as HTMLInputElement).files?.[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  class="btn btn-ghost border border-white/10 hover:bg-white/10"
                  onClick={() => {
                    setAvatarUrl('');
                    persist({ avatarDataUrl: undefined });
                  }}
                >
                  Supprimer
                </button>
              </div>
              <label class="label">
                <span class="label-text-alt text-gray-400">
                  Conseil TV: privilégiez une image carrée (≥ 256×256).
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Informations serveur */}
      <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
        <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-6 sm:mb-8">Informations du compte</h2>
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-semibold text-gray-400 mb-2">Email</label>
            <p class="text-white text-lg">{user.email}</p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-400 mb-2">ID</label>
            <p class="text-gray-300 font-mono text-sm break-all">{user.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
