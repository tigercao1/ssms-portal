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
import { ShopifySyncPage } from '@/features/admin/ShopifySyncPage';
import { PagesListPage } from '@/features/admin/PagesListPage';
import { PageEditorPage } from '@/features/admin/PageEditorPage';
import { LessonTypesPage } from '@/features/admin/LessonTypesPage';
import { CustomersPage } from '@/features/admin/CustomersPage';
import { ClassesPage } from '@/features/admin/ClassesPage';
import { GoogleSettingsPage } from '@/features/admin/GoogleSettingsPage';
import { LoginPage } from '@/auth/LoginPage';
import { SignUpPage } from '@/auth/SignUpPage';
import { VerifyEmailPage } from '@/auth/VerifyEmailPage';
import { RequestResetPage } from '@/auth/RequestResetPage';
import { UpdatePasswordPage } from '@/auth/UpdatePasswordPage';
import { ActivatePage } from '@/auth/ActivatePage';
import { ActivatePasswordPage } from '@/auth/ActivatePasswordPage';
import { AuthCallbackPage } from '@/auth/AuthCallbackPage';

/**
 * Route tree (W1.4) — mirrors PORTAL_UI_PLAN.md §4. Auth routes are standalone;
 * everything else renders inside <AppShell> behind the auth/email/role guards.
 * Feature screens are still placeholders (Wave 2), tagged with their task id.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignUpPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/reset-password', element: <RequestResetPage /> },
  { path: '/update-password', element: <UpdatePasswordPage /> },
  { path: '/activate', element: <ActivatePage /> },
  {
    path: '/activate/password',
    element: (
      <RequireAuth>
        <ActivatePasswordPage />
      </RequireAuth>
    ),
  },
  { path: '/auth/callback', element: <AuthCallbackPage /> },

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
      {
        path: '/admin/lesson-types',
        element: (
          <RequireAdmin>
            <LessonTypesPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/customers',
        element: (
          <RequireAdmin>
            <CustomersPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/classes',
        element: (
          <RequireAdmin>
            <ClassesPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/calendar-matching',
        element: (
          <Navigate to="/admin/instructors" replace />
        ),
      },
      {
        path: '/admin/pages',
        element: (
          <RequireAdmin>
            <PagesListPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/pages/:id',
        element: (
          <RequireAdmin>
            <PageEditorPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/shopify-sync',
        element: (
          <RequireAdmin>
            <ShopifySyncPage />
          </RequireAdmin>
        ),
      },
      {
        path: '/admin/settings/google',
        element: (
          <RequireAdmin>
            <GoogleSettingsPage />
          </RequireAdmin>
        ),
      },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
