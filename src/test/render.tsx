import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { I18nProvider } from '@/i18n/core/I18nProvider';

/** Wraps a component in the app providers for tests (W3.5). */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    staleTime,
    dataRouter = false,
  }: { route?: string; staleTime?: number; dataRouter?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime } },
  });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    );
  }
  if (dataRouter) {
    const router = createMemoryRouter([{ path: '*', element: ui }], {
      initialEntries: [route],
    });
    return render(<RouterProvider router={router} />, { wrapper: Providers });
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Providers>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Providers>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
