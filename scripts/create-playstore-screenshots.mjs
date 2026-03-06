// Script pour creer des captures d'ecran Play Store (16:9 ou 9:16)
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Configuration des ratios acceptes par le Play Store
const ACCEPTED_RATIOS = {
  '16:9': 16 / 9,
  '9:16': 9 / 16
};

// Dimensions cibles pour mobile (9:16 - portrait)
// On utilise 1080x1920 comme base (Full HD en portrait)
const MOBILE_TARGET_WIDTH = 1080;
const MOBILE_TARGET_HEIGHT = 1920;

// Chemin du dossier de sortie
const outputDir = join(projectRoot, 'public', 'playstore-screenshots');

try {
  // Creer le dossier de sortie s'il n'existe pas
  if (!existsSync(outputDir)) {
    const fs = await import('fs');
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Dossier cree: ${outputDir}`);
  }

  // Liste des images sources a traiter
  const sourceImages = [
    // Images depuis le dossier assets
    'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_173245-1396c6f9-52d1-4671-9760-1838d46241de.png',
    'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_173900-544e1e79-797b-46f0-b475-5013c2969517.png',
    'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_174009-d6761286-10a8-4b1d-8eee-5dfba5da5233.png',
    'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_174056-75df4a00-838e-4dd4-907c-751889aeeb03.png',
    'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_174041-e7a02382-5094-4cbd-96bb-97803273dbfa.png',
  ];

  console.log(`Traitement de ${sourceImages.length} capture(s) d'ecran...\n`);

  let processedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < sourceImages.length; i++) {
    const sourcePath = sourceImages[i];

    if (!existsSync(sourcePath)) {
      console.warn(`[${i + 1}/${sourceImages.length}] Fichier introuvable: ${sourcePath}`);
      skippedCount++;
      continue;
    }

    try {
      // Obtenir les metadonnees de l'image source
      const metadata = await sharp(sourcePath).metadata();
      const sourceWidth = metadata.width;
      const sourceHeight = metadata.height;
      const sourceRatio = sourceWidth / sourceHeight;

      console.log(`[${i + 1}/${sourceImages.length}] Traitement: ${sourcePath.split('\\').pop()}`);
      console.log(`  Dimensions source: ${sourceWidth}x${sourceHeight}`);
      console.log(`  Ratio source: ${sourceRatio.toFixed(3)}`);

      // Determiner le ratio cible (9:16 pour mobile portrait)
      const targetRatio = ACCEPTED_RATIOS['9:16']; // 9/16 = 0.5625
      let targetWidth, targetHeight;

      // Calculer les dimensions cibles en respectant le ratio 9:16
      if (sourceRatio > targetRatio) {
        // Image plus large que le ratio cible - utiliser la hauteur comme reference
        targetHeight = MOBILE_TARGET_HEIGHT;
        targetWidth = Math.round(MOBILE_TARGET_HEIGHT * targetRatio);
      } else {
        // Image plus haute - utiliser la largeur comme reference
        targetWidth = MOBILE_TARGET_WIDTH;
        targetHeight = Math.round(MOBILE_TARGET_WIDTH / targetRatio);
      }

      console.log(`  Dimensions cibles: ${targetWidth}x${targetHeight} (ratio 9:16)`);

      // Verifier que les dimensions sont dans les limites
      const minSize = 320;
      const maxSize = 3840;

      if (targetWidth < minSize || targetWidth > maxSize || targetHeight < minSize || targetHeight > maxSize) {
        console.warn(`  ATTENTION: Dimensions hors limites (320-3840px)`);
        // Ajuster si necessaire
        if (targetWidth < minSize) {
          targetWidth = minSize;
          targetHeight = Math.round(minSize / targetRatio);
        }
        if (targetHeight < minSize) {
          targetHeight = minSize;
          targetWidth = Math.round(minSize * targetRatio);
        }
        if (targetWidth > maxSize) {
          targetWidth = maxSize;
          targetHeight = Math.round(maxSize / targetRatio);
        }
        if (targetHeight > maxSize) {
          targetHeight = maxSize;
          targetWidth = Math.round(maxSize * targetRatio);
        }
        console.log(`  Dimensions ajustees: ${targetWidth}x${targetHeight}`);
      }

      // Nom du fichier de sortie
      const outputFilename = `screenshot_${i + 1}_${targetWidth}x${targetHeight}.png`;
      const outputPath = join(outputDir, outputFilename);

      // Traiter et redimensionner l'image
      await sharp(sourcePath)
        .resize(targetWidth, targetHeight, {
          fit: 'contain', // Conserve le ratio, ajoute des bandes si necessaire
          background: { r: 0, g: 0, b: 0, alpha: 1 }, // Fond noir
          position: 'center',
          kernel: sharp.kernel.lanczos3, // Algorithme de haute qualite
        })
        .png({
          quality: 95, // Haute qualite mais pas maximale pour reduire la taille
          compressionLevel: 6 // Compression moderee
        })
        .toFile(outputPath);

      // Verifier la taille du fichier
      const stats = statSync(outputPath);
      const fileSizeKB = stats.size / 1024;
      const fileSizeMB = stats.size / (1024 * 1024);

      console.log(`  Fichier cree: ${outputFilename}`);
      console.log(`  Taille: ${fileSizeKB.toFixed(2)} KB (${fileSizeMB.toFixed(2)} MB)`);

      if (stats.size > 8 * 1024 * 1024) {
        console.warn(`  ATTENTION: Le fichier depasse 8 Mo (${fileSizeMB.toFixed(2)} MB)`);
        console.warn(`  Optimisation recommandee pour le Play Store.`);
        
        // Tentative d'optimisation
        const optimizedPath = join(outputDir, `screenshot_${i + 1}_${targetWidth}x${targetHeight}_optimized.png`);
        await sharp(sourcePath)
          .resize(targetWidth, targetHeight, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 1 },
            position: 'center',
            kernel: sharp.kernel.lanczos3,
          })
          .png({
            quality: 85,
            compressionLevel: 9
          })
          .toFile(optimizedPath);

        const optimizedStats = statSync(optimizedPath);
        const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
        console.log(`  Version optimisee creee: ${fileSizeMB.toFixed(2)} MB -> ${optimizedSizeMB.toFixed(2)} MB`);
      } else {
        console.log(`  OK - Conforme aux exigences du Play Store (< 8 Mo)`);
      }

      processedCount++;
      console.log('');

    } catch (error) {
      console.error(`  Erreur lors du traitement: ${error.message}`);
      skippedCount++;
      console.log('');
    }
  }

  // Resume
  console.log('=== Resume ===');
  console.log(`Captures traitees: ${processedCount}`);
  console.log(`Captures ignorees: ${skippedCount}`);
  console.log(`\nDossier de sortie: ${outputDir}`);
  console.log('\nSpecifications Play Store respectees:');
  console.log('- Format: PNG');
  console.log('- Ratio: 9:16 (portrait mobile)');
  console.log('- Dimensions: 320-3840px');
  console.log('- Poids max: 8 Mo par image');

} catch (error) {
  console.error('Erreur generale:', error.message);
  if (error.message.includes('Cannot find module')) {
    console.error('\nInstallez sharp avec: npm install --save-dev sharp');
  }
  process.exit(1);
}
