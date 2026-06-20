import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RefItem } from '@/lib/types';

/**
 * W2.5 — reference (lookup) data read hooks. These feed the profile form's
 * multi-selects (W2.2) and the admin reference manager (W2.13). Cached longer
 * than default since lookups rarely change.
 */
const REF_STALE = 5 * 60_000;

function refQuery(slug: string) {
  return {
    queryKey: ['reference', slug] as const,
    queryFn: () => api<RefItem[]>(`/reference/${slug}`),
    staleTime: REF_STALE,
  };
}

export const useTeachingLocations = () =>
  useQuery(refQuery('teaching-locations'));
export const useLanguages = () => useQuery(refQuery('languages'));
export const useCourseLevels = () => useQuery(refQuery('course-levels-offered'));
export const useExamPreparations = () => useQuery(refQuery('exam-preparations'));

/** The four reference tables, keyed by the admin URL slug (W2.13). */
export const REFERENCE_TABLES = [
  'teaching-locations',
  'languages',
  'course-levels-offered',
  'exam-preparations',
] as const;
export type ReferenceSlug = (typeof REFERENCE_TABLES)[number];
