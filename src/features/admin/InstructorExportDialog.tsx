import { useState } from 'react';
import {
  Banner,
  Button,
  Field,
  INSTRUCTOR_STAGES,
  Modal,
  Select,
  StagePill,
  type InstructorStage,
} from '@/components';
import { todayIso } from '@/features/documents/api/validity';
import { useT } from '@/i18n/core/I18nProvider';
import { fetchInstructorExport, type OnboardingFilter } from './api';
import { FilterCheckbox, FilterGroup } from './InstructorFilters';
import { downloadText, errorText } from './payroll/payrollFormat';

type Onboarding = OnboardingFilter | 'any';

interface Downloaded {
  file: string;
  nonAsciiNames: number;
}

export function InstructorExportDialog({
  initialStages,
  onClose,
}: {
  initialStages: InstructorStage[];
  onClose: () => void;
}) {
  const t = useT();
  const [stages, setStages] = useState<InstructorStage[]>(
    initialStages.length > 0 ? initialStages : [...INSTRUCTOR_STAGES],
  );
  const [onboarding, setOnboarding] = useState<Onboarding>('any');
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState<Downloaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleStage = (stage: InstructorStage) =>
    setStages((current) =>
      current.includes(stage)
        ? current.filter((s) => s !== stage)
        : INSTRUCTOR_STAGES.filter((s) => s === stage || current.includes(s)),
    );

  async function download() {
    setDownloading(true);
    setDownloaded(null);
    setError(null);
    try {
      const result = await fetchInstructorExport({
        stages,
        onboarding: onboarding === 'any' ? undefined : onboarding,
      });
      const file = `instructors-${todayIso()}.csv`;
      downloadText(file, result.text);
      setDownloaded({ file, nonAsciiNames: result.nonAsciiNames });
    } catch (err) {
      setError(
        t.instructorExport.downloadFailed.replace(
          '{message}',
          errorText(err, t.errors.generic),
        ),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      title={t.instructorExport.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
          <Button
            loading={downloading}
            disabled={stages.length === 0}
            onClick={() => void download()}
          >
            {t.instructorExport.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FilterGroup legend={t.admin.filterStatus}>
          <div className="grid gap-x-2 sm:grid-cols-2">
            {INSTRUCTOR_STAGES.map((stage) => (
              <FilterCheckbox
                key={stage}
                checked={stages.includes(stage)}
                onChange={() => toggleStage(stage)}
              >
                <StagePill stage={stage} />
              </FilterCheckbox>
            ))}
          </div>
          {stages.length === 0 && (
            <p className="px-2 text-sm text-status-rejected">
              {t.instructorExport.noStage}
            </p>
          )}
        </FilterGroup>
        <Field
          label={t.instructorExport.onboarding}
          hint={t.instructorExport.onboardingHint}
        >
          {(props) => (
            <Select
              {...props}
              value={onboarding}
              onChange={(e) => setOnboarding(e.target.value as Onboarding)}
            >
              <option value="any">{t.instructorExport.onboardingAny}</option>
              <option value="complete">
                {t.instructorExport.onboardingComplete}
              </option>
              <option value="incomplete">
                {t.instructorExport.onboardingIncomplete}
              </option>
            </Select>
          )}
        </Field>
        {downloaded && (
          <Banner tone="approved">
            <p>
              {t.instructorExport.downloaded.replace('{file}', downloaded.file)}
            </p>
            {downloaded.nonAsciiNames > 0 && (
              <p className="mt-1">
                {t.instructorExport.nonAsciiNames.replace(
                  '{n}',
                  String(downloaded.nonAsciiNames),
                )}
              </p>
            )}
          </Banner>
        )}
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    </Modal>
  );
}
