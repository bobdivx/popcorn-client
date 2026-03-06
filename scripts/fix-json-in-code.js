#!/usr/bin/env node
/**
 * Script pour échapper les accolades dans les blocs JSON des fichiers de documentation
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

  // Remplacer les accolades dans les balises <code> qui contiennent du JSON
  // Pattern: <code>{...}</code> où ... contient du JSON
  // Remplacer { par {'{'} et } par {'}'}
  
  // Détecter les blocs <code>...</code> qui contiennent du JSON
  const codeBlockPattern = /<code>([^<]*\{[^<]*\}[^<]*)<\/code>/g;
  
  content = content.replace(codeBlockPattern, (match, codeContent) => {
    // Échapper les accolades dans le contenu JSON
    let escaped = codeContent
      .replace(/\{/g, "{'{'}")
      .replace(/\}/g, "{'}'}");
    return `<code>${escaped}</code>`;
  });

  // Remplacer aussi les set:html restants
  content = content.replace(
    /<code\s+set:html=\{`([^`]+)`\}>/g,
    '<code>'
  );
  content = content.replace(/`\}\}><\/code>/g, '</code>');

  if (content !== original) {
    writeFileSync(file, content, 'utf-8');
    console.log(`✓ Corrigé: ${file.replace(process.cwd(), '')}`);
  }
}

console.log(`\n✅ ${files.length} fichiers vérifiés`);
