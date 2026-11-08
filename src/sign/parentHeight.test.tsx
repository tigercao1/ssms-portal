import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { SignApp } from './SignApp';
import { mockSignForm } from './mock/fixtures';

vi.mock('signature_pad', () => ({
  default: class {
    addEventListener() {}
    removeEventListener() {}
    isEmpty() {
      return true;
    }
    clear() {}
    toData() {
      return [];
    }
    fromData() {}
    off() {}
  },
}));

const observers: Array<() => void> = [];
let height = 640;
const postMessage = vi.fn();

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {
    observers.push(() => this.callback());
  }
  observe() {}
  disconnect() {}
}

function renderFramed() {
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage },
  });
  return render(
    <SignApp location={{ pathname: '/w/waiver', search: '?lang=en' }} />,
  );
}

beforeEach(() => {
  observers.length = 0;
  height = 640;
  postMessage.mockClear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height }) as DOMRect,
  );
  server.use(
    http.get('http://localhost:3000/sign/forms/waiver', () =>
      HttpResponse.json(mockSignForm('en')),
    ),
  );
});

afterEach(() => {
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: window,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('iframe height messages', () => {
  it('sends the page height to https://ssnow.club on load', () => {
    renderFramed();
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'ssnow-sign-height', height: 640 },
      'https://ssnow.club',
    );
  });

  it('sends the new height when the content or the window changes size', async () => {
    renderFramed();
    await screen.findByRole('heading', { level: 1 });

    height = 2400.4;
    act(() => observers.forEach((notify) => notify()));
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'ssnow-sign-height', height: 2401 },
      'https://ssnow.club',
    );

    height = 1800;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'ssnow-sign-height', height: 1800 },
      'https://ssnow.club',
    );
  });

  it('sends nothing when the page is opened full screen', () => {
    const spy = vi.spyOn(window, 'postMessage');
    render(<SignApp location={{ pathname: '/w/waiver', search: '' }} />);
    expect(spy).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
