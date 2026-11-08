import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/auth/SessionProvider';
import { api } from '@/lib/api';
import type { DocumentLanguage } from '../api';

export const SIGNATURE_QUERY_MIN = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_QUERY_MAX = 100;
export const STUDENT_LOOKUP_LIMIT = 100;

export interface SignedDocumentEntry {
  assignmentId: string;
  templateId: string;
  titleEn: string;
  titleZh: string | null;
  kind: string;
  language: DocumentLanguage | null;
  formVersion: number | null;
  signedAt: string;
  hasSignedCopy: boolean;
}

export interface Signer {
  subjectType: 'instructor' | 'customer';
  subjectId: string;
  name: string | null;
  email: string | null;
  signatures: SignedDocumentEntry[];
}

export interface SignatureCheck {
  signed: boolean;
  signedAt: string | null;
  templateTitles: string[];
}

export interface StudentSignature {
  name: string | null;
  signed: boolean;
  signedAt: string | null;
}

export function useDebounced(value: string, ms = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function sameUserPlaceholder<T>(userId: string | null) {
  return (previous: T | undefined, query?: { queryKey: readonly unknown[] }) =>
    query?.queryKey[1] === userId ? previous : undefined;
}

export function useSignatureLookup(q: string) {
  const userId = useSession().user?.id ?? null;
  return useQuery({
    queryKey: ['admin', userId, 'signatures', q] as const,
    enabled:
      userId !== null &&
      q.length >= SIGNATURE_QUERY_MIN &&
      q.length <= SEARCH_QUERY_MAX,
    placeholderData: sameUserPlaceholder<Signer[]>(userId),
    queryFn: () =>
      api<Signer[]>(`/admin/signatures?${new URLSearchParams({ q })}`),
  });
}

export function useSignatureCheck(email: string | null) {
  const userId = useSession().user?.id ?? null;
  return useQuery({
    queryKey: ['admin', userId, 'signatures', 'check', email] as const,
    enabled: userId !== null && email !== null,
    queryFn: () =>
      api<SignatureCheck>(
        `/admin/signatures/check?${new URLSearchParams({ email: email ?? '' })}`,
      ),
  });
}

export function useMyStudentSignatures(q: string) {
  const userId = useSession().user?.id ?? null;
  return useQuery({
    queryKey: ['me', userId, 'students', 'signatures', q] as const,
    enabled: userId !== null && q.length <= SEARCH_QUERY_MAX,
    placeholderData: sameUserPlaceholder<StudentSignature[]>(userId),
    queryFn: () =>
      api<StudentSignature[]>(
        q
          ? `/me/students/signatures?${new URLSearchParams({ q })}`
          : '/me/students/signatures',
      ),
  });
}
