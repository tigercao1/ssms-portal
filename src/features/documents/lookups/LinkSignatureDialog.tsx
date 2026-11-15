import { useEffect, useRef, useState } from 'react';
import { Banner, Button } from '@/components';
import {
  CustomerPicker,
  Dialog,
  pickedName,
  type PickedCustomer,
} from '@/features/admin/booking/BookingParts';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { errorText } from '../admin/format';
import {
  LinkTimeoutError,
  useIsLinkingSignature,
  useLatestSignatureLink,
  useLinkSignature,
  type SignedDocumentEntry,
  type Signer,
} from './api';
import { formatSignedDate } from './format';

function linkErrorText(error: unknown, t: Messages): string {
  if (error instanceof LinkTimeoutError) return t.signatures.linkTimeout;
  if (error instanceof ApiError && error.status === 400)
    return t.signatures.linkInvalid;
  if (error instanceof ApiError && error.status === 404)
    return t.signatures.linkNotFound;
  return t.signatures.linkFailed.replace(
    '{reason}',
    errorText(error, t.errors.generic),
  );
}

export function LinkSignatureDialog({
  entry,
  title,
  signerName,
  onClose,
  onLinked,
}: {
  entry: SignedDocumentEntry;
  title: string;
  signerName: string;
  onClose: () => void;
  onLinked: (person: Signer) => void;
}) {
  const t = useT();
  const s = t.signatures;
  const { locale } = useLocale();
  const [picked, setPicked] = useState<PickedCustomer | null>(null);
  const link = useLinkSignature(entry.assignmentId);
  const pending = useIsLinkingSignature(entry.assignmentId) || link.isPending;
  const latest = useLatestSignatureLink(entry.assignmentId);
  const linkedElsewhere =
    latest?.status === 'success' ? latest.data : undefined;
  const wasPending = useRef(pending);

  useEffect(() => {
    if (link.isIdle && wasPending.current && !pending && linkedElsewhere)
      onLinked(linkedElsewhere);
    wasPending.current = pending;
  }, [link.isIdle, pending, linkedElsewhere, onLinked]);

  function confirm() {
    if (!picked || pending) return;
    link.mutate({ customerId: picked.id }, { onSuccess: onLinked });
  }

  return (
    <Dialog title={s.linkTitle} onClose={onClose} dismissible={!pending}>
      <p className="text-sm text-slate">
        {s.linkIntro
          .replace('{title}', title)
          .replace('{name}', signerName)
          .replace('{date}', formatSignedDate(entry.signedAt, locale))}
      </p>
      <CustomerPicker
        forBooking={false}
        disabled={pending}
        selected={picked ? [picked] : []}
        onChange={(next) => {
          if (pending) return;
          setPicked(next.at(-1) ?? null);
          link.reset();
        }}
      />
      {picked && (
        <p data-private className="font-medium text-ink">
          {s.linkConfirm
            .replace('{title}', title)
            .replace('{from}', signerName)
            .replaceAll('{to}', pickedName(picked))}
        </p>
      )}
      {link.isError && (
        <Banner tone="error">{linkErrorText(link.error, t)}</Banner>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          disabled={!picked || pending}
          loading={pending}
          onClick={confirm}
        >
          {pending ? s.linking : s.linkButton}
        </Button>
      </div>
    </Dialog>
  );
}
