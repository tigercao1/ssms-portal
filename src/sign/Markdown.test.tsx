import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('waiver markdown', () => {
  it('renders headings, emphasis, lists and https links', () => {
    render(
      <Markdown
        source={
          '# Terms\n\nI **agree** to *the rules*.\n\n1. One\n2. Two\n\nSee [FAQ](https://ssnow.club/faq).'
        }
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Terms' }),
    ).toBeInTheDocument();
    expect(screen.getByText('agree').tagName).toBe('STRONG');
    expect(screen.getByText('the rules').tagName).toBe('EM');
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['One', 'Two']);
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
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
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)> click');
  });
});
