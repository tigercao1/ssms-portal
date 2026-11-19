import type { Messages } from '@/i18n/core/types';

type NavLabel = keyof Messages['nav'];

export interface AdminNavItem {
  to: string;
  label: NavLabel;
  end?: boolean;
}

export interface AdminNavGroup {
  id: string;
  heading: NavLabel;
  items: AdminNavItem[];
  defaultOpen?: boolean;
}

export const ADMIN_DASHBOARD: AdminNavItem = {
  to: '/admin',
  label: 'dashboard',
  end: true,
};

export const ADMIN_REPORTS_ITEMS: AdminNavItem[] = [];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'booking',
    heading: 'groupBooking',
    defaultOpen: true,
    items: [
      { to: '/admin/booking', label: 'booking' },
      { to: '/admin/classes', label: 'classes' },
      { to: '/admin/customers', label: 'customers' },
      { to: '/admin/lesson-types', label: 'lessonTypes' },
      { to: '/admin/import-history', label: 'importHistory' },
    ],
  },
  {
    id: 'instructors',
    heading: 'groupInstructors',
    items: [
      { to: '/admin/instructors', label: 'instructors' },
      { to: '/admin/document-review', label: 'documentReview' },
      { to: '/admin/payroll', label: 'payroll' },
      { to: '/admin/insurance', label: 'adminInsurance' },
    ],
  },
  {
    id: 'documents',
    heading: 'groupDocuments',
    items: [
      { to: '/admin/documents', label: 'documents' },
      { to: '/admin/signing-forms', label: 'signingForms' },
      { to: '/admin/signatures', label: 'signatures' },
    ],
  },
  {
    id: 'website',
    heading: 'groupWebsite',
    items: [
      { to: '/admin/pages', label: 'pages' },
      { to: '/admin/shopify-sync', label: 'shopifySync' },
    ],
  },
  {
    id: 'settings',
    heading: 'groupSettings',
    items: [
      { to: '/admin/reference', label: 'reference' },
      { to: '/admin/settings/google', label: 'google' },
      { to: '/admin/settings/api-tokens', label: 'apiTokens' },
    ],
  },
  { id: 'reports', heading: 'groupReports', items: ADMIN_REPORTS_ITEMS },
];

export const ADMIN_NAV_STORAGE_KEY = 'ssms.adminNav.groups.v1';
