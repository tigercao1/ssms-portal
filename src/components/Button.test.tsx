import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { translateText } from '@/test/translate';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('starts and stops loading after the browser translates its label', () => {
    const { rerender } = render(<Button>Activate account</Button>);
    const btn = screen.getByRole('button');
    translateText(btn, '激活账户');

    rerender(<Button loading>Activate account</Button>);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('.animate-spin')).not.toBeNull();
    expect(btn).toHaveTextContent('激活账户');

    rerender(<Button>Activate account</Button>);
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn.querySelector('.animate-spin')).toBeNull();
    expect(btn).toHaveTextContent('激活账户');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    await userEvent.click(screen.getByRole('button')).catch(() => {});
    expect(onClick).not.toHaveBeenCalled();
  });
});
