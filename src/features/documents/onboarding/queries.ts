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
import { PRESIGNED_URL_FRESH_MS } from '../pdf/presignedSource';
import { track } from '@/lib/analytics';
import { MY_LESSONS_KEY } from '@/features/lessons/api';
import { MY_GO_LIVE_KEY } from '@/features/instructor/api';

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
    staleTime: PRESIGNED_URL_FRESH_MS,
    refetchOnWindowFocus: false,
  });
}

export function useCompleteMyDocument(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompleteRequest) =>
      completeMyDocument(assignmentId, body),
    onSuccess: () => {
      track('onboarding_document_completed', { assignmentId });
      return Promise.all([
        qc.invalidateQueries({ queryKey: documentsKeys.myChecklist }),
        qc.invalidateQueries({ queryKey: MY_LESSONS_KEY }),
        qc.invalidateQueries({ queryKey: MY_GO_LIVE_KEY }),
      ]);
    },
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
    onSuccess: (_upload, { org, track: certTrack }) => {
      track('certification_uploaded', { org, track: certTrack });
      return Promise.all([
        qc.invalidateQueries({ queryKey: documentsKeys.myChecklist }),
        qc.invalidateQueries({ queryKey: MY_LESSONS_KEY }),
        qc.invalidateQueries({ queryKey: MY_GO_LIVE_KEY }),
      ]);
    },
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
