import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { RouteErrorPage } from './RouteErrorPage';

const analytics = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock('@/lib/analytics', () => analytics);

const crash = new Error('The object can not be found here.');

function Crash(): never {
  throw crash;
}

function renderRoutes(path: string) {
  const router = createMemoryRouter(
    [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { path: '/login', element: <Crash /> },
          {
            element: (
              <div>
                <nav>App navigation</nav>
                <Outlet />
              </div>
            ),
            children: [
              {
                errorElement: <RouteErrorPage inShell />,
                children: [{ path: '/profile', element: <Crash /> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

function silenceUncaught(event: ErrorEvent) {
  event.preventDefault();
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  window.addEventListener('error', silenceUncaught);
});

afterEach(() => {
  window.removeEventListener('error', silenceUncaught);
  vi.restoreAllMocks();
  analytics.captureError.mockReset();
  document.documentElement.lang = 'en';
});

describe('RouteErrorPage', () => {
  it('shows a bilingual message the browser will not translate, without the error details', () => {
    renderRoutes('/login');

    const alert = screen.getByRole('alert');
    expect(
      within(alert)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['Something went wrong', '页面出错了']);
    expect(
      within(alert).getByText('页面出错了').closest('[lang]'),
    ).toHaveAttribute('lang', 'zh-CN');
    const screenRoot = alert.closest('[translate]');
    expect(screenRoot).toHaveAttribute('translate', 'no');
    expect(screenRoot).toHaveClass('notranslate');
    expect(document.body).not.toHaveTextContent(crash.message);
    expect(document.body).not.toHaveTextContent('Unexpected Application Error');
    expect(
      screen.getByRole('link', { name: /Go to home page/ }),
    ).toHaveAttribute('href', '/');
  });

  it('reports the error once', () => {
    renderRoutes('/login');
    expect(analytics.captureError).toHaveBeenCalledTimes(1);
    expect(analytics.captureError).toHaveBeenCalledWith(crash);
  });

  it('reloads the page from its button', async () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    });
    renderRoutes('/login');
    await userEvent.click(screen.getByRole('button', { name: /Reload/ }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the app shell around an error inside it', () => {
    renderRoutes('/profile');
    expect(screen.getByText('App navigation')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('puts Chinese first when the portal is in Chinese', () => {
    document.documentElement.lang = 'zh-CN';
    renderRoutes('/login');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '页面出错了',
    );
    expect(screen.getByRole('button', { name: /Reload/ })).toHaveTextContent(
      '重新加载Reload',
    );
  });
});
