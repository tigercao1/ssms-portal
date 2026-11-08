import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DocumentLanguage } from '../api';

export const SIGNATURE_QUERY_MIN = 2;
export const SEARCH_DEBOUNCE_MS = 300;
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

export function useSignatureLookup(q: string) {
  return useQuery({
    queryKey: ['admin', 'signatures', q] as const,
    enabled: q.length >= SIGNATURE_QUERY_MIN,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<Signer[]>(`/admin/signatures?${new URLSearchParams({ q })}`),
  });
}

export function useMyStudentSignatures(q: string) {
  return useQuery({
    queryKey: ['me', 'students', 'signatures', q] as const,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<StudentSignature[]>(
        q
          ? `/me/students/signatures?${new URLSearchParams({ q })}`
          : '/me/students/signatures',
      ),
  });
}
