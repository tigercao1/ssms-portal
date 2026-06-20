import { createBrowserRouter, Navigate } from 'react-router-dom';
import {
  HomeRedirect,
  RequireAdmin,
  RequireAuth,
  RequireEmailVerified,
} from './guards';
import { AppShell } from '@/app/shell/AppShell';
import { ProfileViewPage } from '@/features/instructor/ProfileViewPage';
import { EditProfilePage } from '@/features/instructor/EditProfilePage';
import { SettingsPage } from '@/features/instructor/SettingsPage';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { AdminListPage } from '@/features/admin/AdminListPage';
import { AdminDetailPage } from '@/features/admin/AdminDetailPage';
import { ReferenceManagerPage } from '@/features/admin/ReferenceManagerPage';
import { LoginPage } from '@/auth/LoginPage';
import { VerifyEmailPage } from '@/auth/VerifyEmailPage';
import { RequestResetPage } from '@/auth/RequestResetPage';
import { UpdatePasswordPage } from '@/auth/UpdatePasswordPage';

/**
 * Route tree (W1.4) — mirrors PORTAL_UI_PLAN.md §4. Auth routes are standalone;
 * everything else renders inside <AppShell> behind the auth/email/role guards.
 * Feature screens are still placeholders (Wave 2), tagged with their task id.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/reset-password', element: <RequestResetPage /> },
  { path: '/update-password', element: <UpdatePasswordPage /> },

  {
    element: (
      <RequireAuth>
        <RequireEmailVerified>
          <AppShell />
        </RequireEmailVerified>
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HomeRedirect /> },

      // Instructor
      { path: '/profile', element: <ProfileViewPage /> },
      { path: '/profile/edit', element: <EditProfilePage /> },
      { path: '/settings', element: <SettingsPage /> },

      // Admin (role-gated)
      {
        path: '/admin',
        element: (
          <RequireAdmin>
            <AdminDashboard />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/instructors',
        element: (
          <RequireAdmin>
            <AdminListPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/instructors/:id',
        element: (
          <RequireAdmin>
            <AdminDetailPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/reference',
        element: (
          <RequireAdmin>
            <ReferenceManagerPage />
          </RequireAdmin>
        ),
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
