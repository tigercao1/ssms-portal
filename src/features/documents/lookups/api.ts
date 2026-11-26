import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type MutationState,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/auth/SessionProvider';
import { api } from '@/lib/api';
import type { CustomerWaiver, WaiverStatus } from '@/lib/types';
import type { DocumentLanguage } from '../api';

export const SIGNATURE_QUERY_MIN = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_QUERY_MAX = 100;
export const STUDENT_LOOKUP_LIMIT = 100;
export const LINK_TIMEOUT_MS = 30_000;

export class LinkTimeoutError extends Error {
  constructor() {
    super('Link request timed out');
    this.name = 'LinkTimeoutError';
  }
}

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
  validThisYear?: boolean;
  source?: 'ssms' | 'jotform';
}

export interface Signer {
  subjectType: 'instructor' | 'customer';
  subjectId: string;
  name: string | null;
  email: string | null;
  signatures: SignedDocumentEntry[];
  waiver?: CustomerWaiver | null;
  customerId?: string | null;
}

export interface SignatureCheck {
  signed: boolean;
  signedAt: string | null;
  templateTitles: string[];
  status?: WaiverStatus;
}

export interface StudentSignature {
  name: string | null;
  signed: boolean;
  signedAt: string | null;
  status?: WaiverStatus;
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

const linkSignatureKey = (userId: string | null, assignmentId: string) =>
  ['admin', userId, 'signatures', 'link', assignmentId] as const;

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LinkTimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

export function useLinkSignature(assignmentId: string) {
  const userId = useSession().user?.id ?? null;
  const qc = useQueryClient();
  const refreshSignatures = () => {
    void qc.invalidateQueries({ queryKey: ['admin', userId, 'signatures'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
  };
  return useMutation({
    mutationKey: linkSignatureKey(userId, assignmentId),
    mutationFn: ({ customerId }: { customerId: string }) =>
      withTimeout(
        (signal) =>
          api<Signer>(
            `/admin/signatures/${encodeURIComponent(assignmentId)}/link`,
            { method: 'POST', body: { customerId }, signal },
          ),
        LINK_TIMEOUT_MS,
      ),
    onSuccess: refreshSignatures,
    onError: (error) => {
      if (error instanceof LinkTimeoutError) refreshSignatures();
    },
  });
}

export function useIsLinkingSignature(assignmentId: string): boolean {
  const userId = useSession().user?.id ?? null;
  return (
    useIsMutating({ mutationKey: linkSignatureKey(userId, assignmentId) }) > 0
  );
}

export function useLatestSignatureLink(
  assignmentId: string,
): MutationState<Signer> | undefined {
  const userId = useSession().user?.id ?? null;
  return useMutationState({
    filters: { mutationKey: linkSignatureKey(userId, assignmentId) },
    select: (mutation) => mutation.state as MutationState<Signer>,
  }).at(-1);
}
