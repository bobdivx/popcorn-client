import { useState, useEffect } from 'preact/hooks';
import { serverApi, type LibraryItem } from '../lib/client/server-api';
import { UserKeyManager, decryptMetadata } from '../lib/encryption/e2e';

interface LibraryProps {
  onItemClick?: (item: LibraryItem) => void;
}

export default function Library({ onItemClick }: LibraryProps) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decryptedItems, setDecryptedItems] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!serverApi.isAuthenticated()) {
        setError('Vous devez être connecté pour voir votre bibliothèque');
        setLoading(false);
        return;
      }

      const response = await serverApi.getLibrary();

      if (!response.success) {
        setError(response.message || 'Erreur lors du chargement de la bibliothèque');
        return;
      }

      if (response.data) {
        setItems(response.data);
        
        // Déchiffrer les métadonnées si disponibles
        if (UserKeyManager.hasKey()) {
          try {
            const key = await UserKeyManager.getOrCreateKey();
            const decrypted = new Map<string, any>();
            
            for (const item of response.data) {
              if (item.encryptedData) {
                try {
                  const metadata = await decryptMetadata(item.encryptedData, key.key);
                  decrypted.set(item.id, metadata);
                } catch (err) {
                  console.error(`Erreur lors du déchiffrement de l'item ${item.id}:`, err);
                }
              }
            }
            
            setDecryptedItems(decrypted);
          } catch (err) {
            console.error('Erreur lors du déchiffrement:', err);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élément de votre bibliothèque ?')) {
      return;
    }

    const response = await serverApi.removeFromLibrary(itemId);
    
    if (response.success) {
      setItems(items.filter(item => item.id !== itemId));
      decryptedItems.delete(itemId);
      setDecryptedItems(new Map(decryptedItems));
    } else {
      alert(response.message || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center p-8">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="alert alert-error">
        <span>{error}</span>
        <button class="btn btn-sm" onClick={loadLibrary}>
          Réessayer
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="text-center p-8">
        <p class="text-gray-500">Votre bibliothèque est vide</p>
        <p class="text-sm text-gray-400 mt-2">Recherchez du contenu pour l'ajouter à votre bibliothèque</p>
      </div>
    );
  }

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
      {items.map((item) => {
        const metadata = decryptedItems.get(item.id);
        const displayTitle = metadata?.title || item.title;

        return (
          <div
            key={item.id}
            class="card bg-base-200 shadow-md hover:shadow-xl transition-shadow cursor-pointer"
            onClick={() => onItemClick?.(item)}
          >
            <figure class="aspect-[2/3] bg-base-300">
              {item.poster ? (
                <img
                  src={item.poster}
                  alt={displayTitle}
                  class="w-full h-full object-cover"
                />
              ) : (
                <div class="flex items-center justify-center w-full h-full">
                  <span class="text-4xl">🎬</span>
                </div>
              )}
            </figure>
            <div class="card-body p-3">
              <h3 class="card-title text-sm line-clamp-2">{displayTitle}</h3>
              <div class="flex items-center justify-between mt-2">
                <span class="badge badge-outline text-xs">
                  {item.type === 'movie' ? 'Film' : 'Série'}
                </span>
                <button
                  class="btn btn-ghost btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
