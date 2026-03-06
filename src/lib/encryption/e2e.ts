/**
 * Système de chiffrement End-to-End (E2E) pour les métadonnées sensibles
 * Utilise WebCrypto API pour le chiffrement côté client
 * Les clés ne sont jamais envoyées au serveur
 */

export interface EncryptionKey {
  key: CryptoKey;
  keyId: string;
}

/**
 * Génère une nouvelle paire de clés de chiffrement pour l'utilisateur
 * À appeler une seule fois lors de la première utilisation
 */
export async function generateUserKey(): Promise<EncryptionKey> {
  const keyId = crypto.randomUUID();
  
  const key = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  return { key, keyId };
}

/**
 * Exporte une clé de chiffrement pour le stockage
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const exportedArrayBuffer = new Uint8Array(exported);
  return btoa(String.fromCharCode(...exportedArrayBuffer));
}

/**
 * Importe une clé de chiffrement depuis le stockage
 */
export async function importKey(keyData: string): Promise<CryptoKey> {
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Chiffre des données avec la clé utilisateur
 */
export async function encryptData(
  data: any,
  key: CryptoKey
): Promise<string> {
  // Convertir les données en JSON puis en ArrayBuffer
  const dataString = JSON.stringify(data);
  const dataBuffer = new TextEncoder().encode(dataString);

  // Générer un IV (Initialization Vector) aléatoire
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Chiffrer les données
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    dataBuffer
  );

  // Combiner IV et données chiffrées
  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv);
  combined.set(encryptedArray, iv.length);

  // Encoder en base64 pour le stockage/transmission
  return btoa(String.fromCharCode(...combined));
}

/**
 * Déchiffre des données avec la clé utilisateur
 */
export async function decryptData(
  encryptedData: string,
  key: CryptoKey
): Promise<any> {
  // Décoder depuis base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // Extraire l'IV (12 premiers octets)
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // Déchiffrer les données
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encrypted
  );

  // Convertir en JSON puis en objet
  const decryptedString = new TextDecoder().decode(decrypted);
  return JSON.parse(decryptedString);
}

/**
 * Chiffre des métadonnées sensibles (bibliothèque, favoris)
 */
export async function encryptMetadata(
  metadata: {
    title?: string;
    notes?: string;
    tags?: string[];
    [key: string]: any;
  },
  key: CryptoKey
): Promise<string> {
  return encryptData(metadata, key);
}

/**
 * Déchiffre des métadonnées sensibles
 */
export async function decryptMetadata(
  encryptedMetadata: string,
  key: CryptoKey
): Promise<{
  title?: string;
  notes?: string;
  tags?: string[];
  [key: string]: any;
}> {
  return decryptData(encryptedMetadata, key);
}

/**
 * Gestionnaire de clés utilisateur avec stockage sécurisé
 */
export class UserKeyManager {
  private static readonly STORAGE_KEY = 'user_encryption_key';
  private static readonly STORAGE_KEY_ID = 'user_encryption_key_id';

  /**
   * Charge ou génère la clé utilisateur
   */
  static async getOrCreateKey(): Promise<EncryptionKey> {
    if (typeof window === 'undefined') {
      throw new Error('UserKeyManager ne peut être utilisé que côté client');
    }

    // Essayer de charger la clé existante
    const storedKeyData = localStorage.getItem(this.STORAGE_KEY);
    const storedKeyId = localStorage.getItem(this.STORAGE_KEY_ID);

    if (storedKeyData && storedKeyId) {
      try {
        const key = await importKey(storedKeyData);
        return { key, keyId: storedKeyId };
      } catch (error) {
        console.error('Erreur lors du chargement de la clé:', error);
        // Si erreur, générer une nouvelle clé
      }
    }

    // Générer une nouvelle clé
    const newKey = await generateUserKey();
    await this.saveKey(newKey);
    return newKey;
  }

  /**
   * Sauvegarde la clé utilisateur
   */
  static async saveKey(encryptionKey: EncryptionKey): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('UserKeyManager ne peut être utilisé que côté client');
    }

    const keyData = await exportKey(encryptionKey.key);
    localStorage.setItem(this.STORAGE_KEY, keyData);
    localStorage.setItem(this.STORAGE_KEY_ID, encryptionKey.keyId);
  }

  /**
   * Supprime la clé utilisateur (déconnexion)
   */
  static clearKey(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.STORAGE_KEY_ID);
  }

  /**
   * Vérifie si une clé existe
   */
  static hasKey(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(this.STORAGE_KEY);
  }
}
