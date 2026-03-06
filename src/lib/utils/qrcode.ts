/**
 * Utilitaires pour la génération de QR codes
 */

import QRCode from 'qrcode';

export interface QuickConnectData {
  code: string;
  secret: string;
  serverUrl: string;
}

/**
 * Génère un QR code à partir de données de connexion rapide ou d'une URL.
 * - Si une URL est passée (ex. page popcorn-web quick-connect), le scan ouvre la page dans le navigateur.
 * - Si un objet QuickConnectData est passé, le QR contient du JSON (usage legacy / manuel).
 * @param data URL à ouvrir au scan, ou données à encoder en JSON
 * @returns URL de l'image du QR code (data URL)
 */
export async function generateQRCode(data: QuickConnectData | string): Promise<string> {
  const content = typeof data === 'string' ? data : JSON.stringify(data);

  try {
    // Générer le QR code en data URL
    const dataUrl = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      width: 300,
    });
    
    return dataUrl;
  } catch (error) {
    console.error('[QRCODE] Erreur lors de la génération du QR code:', error);
    throw new Error('Impossible de générer le QR code');
  }
}

/**
 * Génère un QR code et retourne l'élément canvas
 * @param data URL ou données à encoder dans le QR code
 * @param canvas Élément canvas où dessiner le QR code
 */
export async function generateQRCodeToCanvas(
  data: QuickConnectData | string,
  canvas: HTMLCanvasElement
): Promise<void> {
  const content = typeof data === 'string' ? data : JSON.stringify(data);

  try {
    await QRCode.toCanvas(canvas, content, {
      errorCorrectionLevel: 'M',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      width: 300,
    });
  } catch (error) {
    console.error('[QRCODE] Erreur lors de la génération du QR code sur canvas:', error);
    throw new Error('Impossible de générer le QR code');
  }
}
