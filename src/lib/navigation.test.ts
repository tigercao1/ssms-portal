import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateExternal } from './navigation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('navigateExternal', () => {
  it('sends the browser to the given URL', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    navigateExternal('https://accounts.google.com/o/oauth2/v2/auth');

    expect(assign).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
  });
});
