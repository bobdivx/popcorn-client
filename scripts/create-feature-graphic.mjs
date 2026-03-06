// Script pour creer l'image de presentation (feature graphic) 1024x500px pour le Play Store
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Chemin de l'image source (capture d'ecran)
const sourcePath = join(projectRoot, 'public', 'screenshot.png');
// Chemin alternatif avec le chemin complet fourni
const altSourcePath = 'C:\\Users\\auber\\.cursor\\projects\\d-Github-popcorn-server\\assets\\c__Users_auber_AppData_Roaming_Cursor_User_workspaceStorage_ff79d0f738ba605b37967008ab8b05f0_images_Capture_d__cran_2026-01-21_173245-1396c6f9-52d1-4671-9760-1838d46241de.png';
const outputPath = join(projectRoot, 'public', 'popcorn_feature_graphic_1024x500.png');

try {
  // Determiner quelle image source utiliser
  let imageSource = null;
  if (existsSync(sourcePath)) {
    imageSource = sourcePath;
    console.log(`Utilisation de l'image source: ${sourcePath}`);
  } else if (existsSync(altSourcePath)) {
    imageSource = altSourcePath;
    console.log(`Utilisation de l'image source alternative: ${altSourcePath}`);
  } else {
    console.error(`Erreur: Aucune image source trouvee.`);
    console.error(`Recherche dans: ${sourcePath}`);
    console.error(`Ou: ${altSourcePath}`);
    console.error('\nVeuillez placer une capture d\'ecran dans public/screenshot.png');
    process.exit(1);
  }

  // Obtenir les metadonnees de l'image source
  const metadata = await sharp(imageSource).metadata();
  console.log(`Dimensions actuelles: ${metadata.width}x${metadata.height}`);
  console.log(`Format: ${metadata.format}`);

  // Calculer les dimensions pour adapter l'image au format 1024x500
  const targetWidth = 1024;
  const targetHeight = 500;
  const aspectRatio = targetWidth / targetHeight; // 1024/500 = 2.048

  let finalWidth, finalHeight;
  
  // Si l'image source est plus large que le ratio cible, on fait un fit cover (crop)
  // Sinon, on fait un fit contain (letterbox)
  const sourceAspectRatio = metadata.width / metadata.height;
  
  if (sourceAspectRatio > aspectRatio) {
    // Image source plus large que le ratio cible - utiliser cover (crop)
    finalWidth = targetWidth;
    finalHeight = targetHeight;
    console.log('Utilisation du mode cover (recadrage)');
  } else {
    // Image source plus etroite - utiliser contain (letterbox)
    finalWidth = targetWidth;
    finalHeight = targetHeight;
    console.log('Utilisation du mode contain (letterbox)');
  }

  // Creer l'image de presentation
  const image = sharp(imageSource);
  
  // Redimensionner avec fond noir pour correspondre exactement a 1024x500
  await image
    .resize(finalWidth, finalHeight, {
      fit: 'cover', // Couvre tout l'espace en recadrant si necessaire
      position: 'center', // Centre l'image lors du recadrage
      kernel: sharp.kernel.lanczos3, // Algorithme de haute qualite
    })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 1 } // Fond noir au cas ou
    })
    .png({ 
      quality: 100,
      compressionLevel: 9 
    })
    .toFile(outputPath);

  // Verifier la taille du fichier
  const stats = statSync(outputPath);
  const fileSizeKB = stats.size / 1024;
  const fileSizeMB = stats.size / (1024 * 1024);

  console.log(`\nImage de presentation creee: ${outputPath}`);
  console.log(`Dimensions: ${targetWidth}x${targetHeight}`);
  console.log(`Taille: ${fileSizeKB.toFixed(2)} KB (${fileSizeMB.toFixed(2)} MB)`);

  if (stats.size > 15 * 1024 * 1024) {
    console.warn(`\nATTENTION: Le fichier depasse 15 Mo (${fileSizeMB.toFixed(2)} MB)`);
    console.warn('Vous devrez peut-etre optimiser l\'image pour le Play Store.');
  } else {
    console.log('\nOK - Fichier conforme aux exigences du Play Store (< 15 Mo)');
  }

  console.log('\nL\'image de presentation est prete pour le Play Store!');
  console.log('\nSpecifications Play Store:');
  console.log('- Format: PNG');
  console.log('- Dimensions: 1024x500 px');
  console.log('- Poids max: 15 Mo');
  
} catch (error) {
  console.error('Erreur:', error.message);
  if (error.message.includes('Cannot find module')) {
    console.error('\nInstallez sharp avec: npm install --save-dev sharp');
  }
  process.exit(1);
}
