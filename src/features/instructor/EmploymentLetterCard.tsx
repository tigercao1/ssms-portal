import { Link } from 'react-router-dom';
import { Banner, Button, Card } from '@/components';
import { buttonClasses } from '@/components/Button';
import { useT } from '@/i18n/core/I18nProvider';
import { useDownloadEmploymentLetter, useMyEmploymentLetter } from './api';

export const EMPLOYMENT_LETTER_FILENAME = 'ssnow-employment-letter.pdf';

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function EmploymentLetterCard() {
  const t = useT();
  const { data } = useMyEmploymentLetter();
  const download = useDownloadEmploymentLetter();

  if (!data || data.state === 'disabled') return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.employmentLetter.title}</h2>
      <p className="text-sm text-slate">{t.employmentLetter.body}</p>
      {data.state === 'not_eligible' && (
        <Banner tone="info">{t.employmentLetter.notEligible}</Banner>
      )}
      {data.state === 'legal_name_missing' && (
        <>
          <Banner tone="pending">{t.employmentLetter.legalNameMissing}</Banner>
          <Link
            to="/profile/edit"
            className={buttonClasses({
              variant: 'secondary',
              className: 'self-start',
            })}
          >
            {t.employmentLetter.addLegalName}
          </Link>
        </>
      )}
      {data.state === 'ready' && (
        <>
          <p data-private className="text-sm text-ink">
            {t.employmentLetter.issuedTo.replace(
              '{name}',
              data.legalName ?? '',
            )}
          </p>
          {download.isError && (
            <Banner tone="error">{t.employmentLetter.downloadFailed}</Banner>
          )}
          <Button
            className="self-start"
            loading={download.isPending}
            onClick={() =>
              download.mutate(undefined, {
                onSuccess: (blob) => saveBlob(EMPLOYMENT_LETTER_FILENAME, blob),
              })
            }
          >
            {t.employmentLetter.download}
          </Button>
        </>
      )}
    </Card>
  );
}
