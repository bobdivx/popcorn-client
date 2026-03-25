import { describe, it, expect } from 'vitest';
import { DescriptionPreview } from './DescriptionPreview';
import { h } from 'preact';
import preactRenderToString from 'preact-render-to-string';

describe('DescriptionPreview', () => {
  it('prevents XSS when given raw html', () => {
    const htmlContent = '<img src="x" onerror="alert(\'XSS\')" />';
    const rawHtml = preactRenderToString(h(DescriptionPreview, { html: htmlContent }));

    // Check that DOMPurify successfully stripped out the onerror handler
    expect(rawHtml).toContain('<img src="x"');
    expect(rawHtml).not.toContain('onerror');
    expect(rawHtml).not.toContain('alert');
  });

  it('prevents XSS when given raw bbcode that gets converted', () => {
    // Note: bbcodeToHtml might actually filter this out already, but we test the full pipeline
    const bbcodeContent = '[img]x" onerror="alert(\'XSS\')[/img]';
    const rawHtml = preactRenderToString(h(DescriptionPreview, { raw: bbcodeContent }));

    // The malformed bbcode image might get completely removed, or at least the onerror should be gone.
    expect(rawHtml).not.toContain('onerror');
    expect(rawHtml).not.toContain('alert');
  });
});