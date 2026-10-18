import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { I18nProvider } from '@/i18n/core/I18nProvider';
import { SessionProvider } from '@/auth/SessionProvider';

export default function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </I18nProvider>
  );
}
