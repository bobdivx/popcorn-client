import { describe, it, expect } from 'vitest';
import { render } from 'preact-render-to-string';
import { DescriptionPreview } from './DescriptionPreview';
import type { JSX } from 'preact';

describe('DescriptionPreview', () => {
  it('should sanitize HTML to prevent XSS vulnerabilities', () => {
    const html = '<img src=x onerror=alert(1)> {} <script>alert("xss")</script> <p>hello</p>';
    const rendered = render(<DescriptionPreview html={html} />);

    // Malicious payload shouldn't exist in the rendered output
    expect(rendered).not.toContain('alert(1)');
    expect(rendered).not.toContain('<script>');

    // Valid HTML should be retained
    expect(rendered).toContain('<p>hello</p>');

    // Placeholders should be removed
    expect(rendered).not.toContain('{}');
  });
});
