import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeMyDocument,
  confirmMyCertUpload,
  documentsKeys,
  getMyChecklist,
  getMyDocument,
  putToPresignedUrl,
  requestMyCertUpload,
  type CertUpload,
  type ChecklistItem,
  type CompleteRequest,
  type DocumentLanguage,
} from '../api';
import type { CertOrg, CertTrack } from '@/lib/types';
import { isCertContentType, prepareCertFile } from './certFile';

export function useMyChecklist({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: documentsKeys.myChecklist,
    queryFn: getMyChecklist,
    enabled,
    refetchOnWindowFocus: 'always',
  });
}

export function useMyDocument(
  assignmentId: string,
  language?: DocumentLanguage,
) {
  return useQuery({
    queryKey: documentsKeys.myDocument(assignmentId, language),
    queryFn: () => getMyDocument(assignmentId, language),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCompleteMyDocument(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompleteRequest) =>
      completeMyDocument(assignmentId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: documentsKeys.myChecklist }),
  });
}

export interface CertUploadInput {
  org: CertOrg;
  track: CertTrack;
  validUntil: string;
  file: File;
}

/** Presign, PUT the (resized) file to storage, then confirm the upload. */
export async function uploadCertification({
  org,
  track,
  validUntil,
  file,
}: CertUploadInput): Promise<CertUpload> {
  const blob = await prepareCertFile(file);
  const contentType = blob.type;
  if (!isCertContentType(contentType)) throw new Error('fileType');
  const ticket = await requestMyCertUpload({
    org,
    track,
    validUntil,
    contentType,
    contentLength: blob.size,
  });
  await putToPresignedUrl(ticket.uploadUrl, blob, contentType);
  return confirmMyCertUpload(ticket.uploadId);
}

export function useUploadCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadCertification,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: documentsKeys.myChecklist }),
  });
}

const DONE_CERT_STATES = new Set(['valid', 'expiring', 'pending']);

export function isItemRequired(item: ChecklistItem): boolean {
  return item.type === 'certification' || item.required;
}

export function isItemDone(item: ChecklistItem): boolean {
  if (item.type === 'document') return item.status === 'completed';
  return DONE_CERT_STATES.has(item.state);
}

export function checklistProgress(items: readonly ChecklistItem[]): {
  done: number;
  total: number;
} {
  const required = items.filter(isItemRequired);
  return { done: required.filter(isItemDone).length, total: required.length };
}
