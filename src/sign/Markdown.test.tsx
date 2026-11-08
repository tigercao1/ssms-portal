import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('waiver markdown', () => {
  it('renders headings, bold and bullets', () => {
    render(
      <Markdown
        source={'# Terms\n\nI **agree** and __accept__.\n\n- One\n- Two'}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Terms' }),
    ).toBeInTheDocument();
    expect(screen.getByText('agree').tagName).toBe('STRONG');
    expect(screen.getByText('accept').tagName).toBe('STRONG');
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['One', 'Two']);
  });

  it('shows links, italics and numbered lines as the signed PDF prints them', () => {
    const { container } = render(
      <Markdown
        source={
          'See [FAQ](https://ssnow.club/faq), *the rules* and _ours_.\n\n3. Third\n\n---\n\nStray ** marker'
        }
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('em, ol, hr')).toBeNull();
    expect(container).toHaveTextContent(
      'See [FAQ](https://ssnow.club/faq), *the rules* and _ours_.',
    );
    expect(container).toHaveTextContent('3. Third');
    expect(container).toHaveTextContent('---');
    expect(container).toHaveTextContent('Stray marker');
  });

  it('keeps raw HTML and unsafe links as plain text', () => {
    const { container } = render(
      <Markdown
        source={
          '<img src=x onerror=alert(1)> [click](javascript:alert(1)) [plain](http://x.test)'
        }
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container).toHaveTextContent(
      '<img src=x onerror=alert(1)> [click](javascript:alert(1))',
    );
  });
});
