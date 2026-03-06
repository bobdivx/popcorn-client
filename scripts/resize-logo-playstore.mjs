// Script pour redimensionner le logo a 512x512px pour le Play Store
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const sourcePath = join(projectRoot, 'public', 'popcorn_logo.png');
const outputPath = join(projectRoot, 'public', 'popcorn_logo_512x512.png');

try {
  // Verifier que le fichier source existe
  if (!existsSync(sourcePath)) {
    console.error(`Erreur: Le fichier source n'existe pas: ${sourcePath}`);
    process.exit(1);
  }

  // Obtenir les metadonnees de l'image source
  const metadata = await sharp(sourcePath).metadata();
  console.log(`Dimensions actuelles: ${metadata.width}x${metadata.height}`);
  console.log(`Format: ${metadata.format}`);

  // Redimensionner a 512x512 avec haute qualite
  await sharp(sourcePath)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Fond transparent
      kernel: sharp.kernel.lanczos3, // Algorithme de haute qualite
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

  console.log(`\nFichier cree: ${outputPath}`);
  console.log(`Dimensions: 512x512`);
  console.log(`Taille: ${fileSizeKB.toFixed(2)} KB (${fileSizeMB.toFixed(2)} MB)`);

  if (stats.size > 1024 * 1024) {
    console.warn(`\nATTENTION: Le fichier depasse 1 Mo (${fileSizeMB.toFixed(2)} MB)`);
    console.warn('Vous devrez peut-etre optimiser l\'image pour le Play Store.');
  } else {
    console.log('\nOK - Fichier conforme aux exigences du Play Store (< 1 Mo)');
  }

  console.log('\nL\'icone est prete pour le Play Store!');
  
} catch (error) {
  console.error('Erreur:', error.message);
  if (error.message.includes('Cannot find module')) {
    console.error('\nInstallez sharp avec: npm install --save-dev sharp');
  }
  process.exit(1);
}
