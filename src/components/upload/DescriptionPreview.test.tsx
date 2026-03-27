import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DescriptionPreview } from './DescriptionPreview';

describe('DescriptionPreview', () => {
  it('sanitizes malicious HTML input via html prop', () => {
    const maliciousHtml = '<script>alert("XSS")</script><p>Safe content</p>';
    const { container } = render(<DescriptionPreview html={maliciousHtml} />);

    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('<p>Safe content</p>');
  });

  it('sanitizes malicious input when converting from bbcode', () => {
    // [b] triggers the bbcode check and path
    const maliciousRaw = '[b]Bold[/b] [img]x" onerror="alert(1)[/img]';
    const { container } = render(<DescriptionPreview raw={maliciousRaw} />);

    expect(container.innerHTML).not.toContain('onerror=');
    expect(container.innerHTML).toContain('<strong>Bold</strong>');
  });

  it('removes residual empty braces {}', () => {
    const htmlWithBraces = '{}<p>Real Content</p>{}';
    const { container } = render(<DescriptionPreview html={htmlWithBraces} />);

    expect(container.innerHTML).not.toContain('{}');
    expect(container.innerHTML).toContain('<p>Real Content</p>');
  });
});
