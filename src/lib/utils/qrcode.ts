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
 * Génère un QR code à partir de données de connexion rapide
 * @param data Données à encoder dans le QR code
 * @returns URL de l'image du QR code (data URL)
 */
export async function generateQRCode(data: QuickConnectData): Promise<string> {
  // Encoder les données en JSON
  const jsonData = JSON.stringify(data);
  
  try {
    // Générer le QR code en data URL
    const dataUrl = await QRCode.toDataURL(jsonData, {
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
 * @param data Données à encoder dans le QR code
 * @param canvas Élément canvas où dessiner le QR code
 */
export async function generateQRCodeToCanvas(
  data: QuickConnectData,
  canvas: HTMLCanvasElement
): Promise<void> {
  const jsonData = JSON.stringify(data);
  
  try {
    await QRCode.toCanvas(canvas, jsonData, {
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
