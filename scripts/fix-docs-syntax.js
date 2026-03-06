#!/usr/bin/env node
/**
 * Script pour corriger les erreurs de syntaxe dans les fichiers de documentation
 * Remplace set:html par du texte brut pour éviter les problèmes de parsing
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import { join } from 'path';

const docsPath = join(process.cwd(), 'src', 'pages', 'docs', '**', '*.astro');
const files = globSync(docsPath);

console.log(`Correction de ${files.length} fichiers de documentation...\n`);

for (const file of files) {
  let content = readFileSync(file, 'utf-8');
  const original = content;

  // Remplacer set:html={`...`} par du texte brut
  // Pattern: <code set:html={`...`}></code>
  // Remplacer par: <code>...</code>
  
  // Remplacer les occurrences multilignes
  content = content.replace(
    /<code\s+set:html=\{`([^`]+)`\}>/g,
    '<code>'
  );
  
  // Remplacer la fermeture correspondante
  content = content.replace(/`\}\}><\/code>/g, '</code>');

  // Remplacer les entités HTML échappées
  content = content
    .replace(/&#123;/g, '{')
    .replace(/&#125;/g, '}')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✓ Corrigé: ${file.replace(process.cwd(), '')}`);
  }
}

console.log(`\n✅ ${files.length} fichiers vérifiés`);
