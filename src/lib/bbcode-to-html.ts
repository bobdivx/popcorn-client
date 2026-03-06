/**
 * Conversion BBCode → HTML pour la prévisualisation des descriptions tracker
 * (C411, TORR9, etc.). Tags gérés : [center], [h1], [h2], [h3], [b], [img], [url=], [code].
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeUrl(s: string): boolean {
  const t = s.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}

/**
 * Convertit une chaîne BBCode en HTML.
 * Tags : [center], [h1], [h2], [h3], [b], [img]url[/img], [url=href]text[/url], [code]...[/code].
 */
export function bbcodeToHtml(bb: string): string {
  let out = '';
  let i = 0;
  const n = bb.length;

  while (i < n) {
    if (i + 1 < n && bb[i] === '[') {
      const start = i;
      i += 1;
      let tagEnd = i;
      while (tagEnd < n && bb[tagEnd] !== ']' && bb[tagEnd] !== ' ' && bb[tagEnd] !== '=') {
        tagEnd += 1;
      }
      if (tagEnd >= n) {
        out += escapeHtml(bb[start]);
        i = start + 1;
        continue;
      }
      const tagName = bb.slice(i, tagEnd);
      i = tagEnd;

      if (bb[i] === '=') {
        i += 1;
        const attrStart = i;
        while (i < n && bb[i] !== ']') i += 1;
        if (i >= n) {
          out += escapeHtml(bb.slice(start));
          return out;
        }
        const attr = bb.slice(attrStart, i).trim();
        i += 1;
        if (tagName.toLowerCase() === 'url') {
          const closeTag = '[/url]';
          const closeIdx = bb.indexOf(closeTag, i);
          if (closeIdx !== -1) {
            const inner = bb.slice(i, closeIdx);
            i = closeIdx + closeTag.length;
            const content = bbcodeToHtml(inner);
            if (isSafeUrl(attr)) {
              out += `<a href="${escapeHtml(attr)}" rel="noopener noreferrer">${content}</a>`;
            } else {
              out += content;
            }
          } else {
            out += escapeHtml(bb.slice(start, i));
          }
        } else {
          out += escapeHtml(bb.slice(start, i));
        }
        continue;
      }

      if (bb[i] === ']') {
        i += 1;
        const closeTag = `[/${tagName}]`;
        const closeIdx = bb.indexOf(closeTag, i);
        if (closeIdx !== -1) {
          const inner = bb.slice(i, closeIdx);
          i = closeIdx + closeTag.length;
          const tag = tagName.toLowerCase();
          switch (tag) {
            case 'center':
              out += `<div class="bbcode-center" style="text-align:center">${bbcodeToHtml(inner)}</div>`;
              break;
            case 'h1':
              out += `<h1>${bbcodeToHtml(inner)}</h1>`;
              break;
            case 'h2':
              out += `<h2>${bbcodeToHtml(inner)}</h2>`;
              break;
            case 'h3':
              out += `<h3>${bbcodeToHtml(inner)}</h3>`;
              break;
            case 'b':
              out += `<strong>${bbcodeToHtml(inner)}</strong>`;
              break;
            case 'img': {
              const src = inner.trim();
              if (isSafeUrl(src)) {
                const footerClass = src.includes('popcorn_logo.png') ? ' class="popcorn-footer-logo"' : '';
                out += `<img src="${escapeHtml(src)}" alt="" loading="lazy"${footerClass} />`;
              }
              break;
            }
            case 'code':
              out += `<pre class="bbcode-code"><code>${escapeHtml(inner)}</code></pre>`;
              break;
            default:
              out += bbcodeToHtml(inner);
          }
        } else {
          out += escapeHtml(bb.slice(start, i));
        }
        continue;
      }

      out += escapeHtml(bb.slice(start, i));
      continue;
    }

    const nextBracket = bb.indexOf('[', i);
    const end = nextBracket === -1 ? n : nextBracket;
    out += escapeHtml(bb.slice(i, end));
    i = end;
  }

  return newlinesToBrOutsidePre(out);
}

function newlinesToBrOutsidePre(s: string): string {
  let result = '';
  let remaining = s;
  for (;;) {
    const open = remaining.indexOf('<pre');
    if (open === -1) {
      result += remaining.replace(/\n/g, '<br>\n');
      break;
    }
    result += remaining.slice(0, open).replace(/\n/g, '<br>\n');
    const rest = remaining.slice(open);
    const close = rest.indexOf('</pre>');
    if (close === -1) {
      result += rest;
      break;
    }
    result += rest.slice(0, close + 6);
    remaining = rest.slice(close + 6);
  }
  return result;
}

/** Indique si la chaîne contient des balises BBCode (pour choisir le rendu). */
export function looksLikeBbcode(s: string): boolean {
  return /\[(?:center|h[123]|b|img|url|code)[\]=]/.test(s);
}
