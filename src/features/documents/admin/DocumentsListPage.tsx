import { Fragment, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Spinner,
  Toggle,
} from '@/components';
import type { ConfirmedTemplate, TemplateSummary } from '../api';
import {
  MAX_TEMPLATE_BYTES,
  useCreateTemplate,
  useRetireTemplate,
  useTemplates,
  useUpdateTemplate,
  useUploadTemplateSource,
} from './hooks';
import {
  EMPTY_TEMPLATE_VALUES,
  TemplateForm,
  templateToValues,
  valuesToCreate,
  valuesToPatch,
} from './TemplateForm';
import { AssignDialog } from './AssignDialog';
import { PublishDialog } from './PublishDialog';
import { KindBadge, TemplateStatusChip } from './badges';
import { errorText, templateTitle } from './format';

type UploadNotice =
  | { id: string; tone: 'approved' | 'pending'; text: string }
  | { id: string; tone: 'error'; text: string };

/** Admin list of onboarding document templates. */
export function DocumentsListPage() {
  const t = useT();
  const templates = useTemplates();
  const [editing, setEditing] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<TemplateSummary | null>(null);
  const [publishing, setPublishing] = useState<TemplateSummary | null>(null);
  const { locale } = useLocale();
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  const rows = [...(templates.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.titleEn.localeCompare(b.titleEn),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.documents.title}</h1>
        <p className="max-w-3xl text-slate">{t.documents.intro}</p>
      </div>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {templates.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : templates.isError ? (
        <Banner tone="error">
          {errorText(templates.error, t.errors.generic)}
        </Banner>
      ) : rows.length === 0 ? (
        <EmptyState title={t.documents.empty}>
          {t.documents.emptyBody}
        </EmptyState>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-3 py-2 font-medium">
                    {t.documents.colTitle}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                    {t.documents.colKind}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                    {t.documents.colPdf}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                    {t.documents.colStatus}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {t.documents.colAudience}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                    {t.documents.colRequired}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t.admin.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <Fragment key={row.id}>
                    <TemplateRow
                      row={row}
                      striped={i % 2 === 1}
                      expanded={editing === row.id}
                      onEdit={() =>
                        setEditing((cur) => (cur === row.id ? null : row.id))
                      }
                      onAssign={() => setAssigning(row)}
                      onPublish={() => setPublishing(row)}
                      onNotice={setNotice}
                    />
                    {editing === row.id && (
                      <tr className="bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]">
                        <td colSpan={7} className="px-4 pb-4 pt-1">
                          <div className="rounded-md border border-grey/60 bg-surface p-4 shadow-card sm:p-5">
                            <EditTemplate
                              row={row}
                              onDone={() => setEditing(null)}
                              onNotice={setNotice}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddTemplate />

      {assigning && (
        <AssignDialog template={assigning} onClose={() => setAssigning(null)} />
      )}

      {publishing && (
        <PublishDialog
          template={publishing}
          onClose={() => setPublishing(null)}
          onPublished={(result) => {
            setPublishing(null);
            setNotice({
              id: result.template.id,
              tone: 'approved',
              text: t.documents.published
                .replace('{title}', templateTitle(result.template, locale))
                .replace('{created}', String(result.created)),
            });
          }}
        />
      )}
    </div>
  );
}

function publishBlocker(row: TemplateSummary, t: Messages): string | null {
  if (!row.hasSource) return t.documents.publishNeedsPdf;
  if (row.kind === 'sign' && row.fieldCount === 0)
    return t.documents.publishNeedsField;
  return null;
}

function AudienceCell({ row }: { row: TemplateSummary }) {
  const t = useT();
  if (row.status !== 'live' || !row.assignTo)
    return <span className="text-slate">—</span>;
  return (
    <span className="whitespace-nowrap">
      {row.assignTo === 'all'
        ? t.documents.audienceAll
        : t.documents.audienceSelected}
    </span>
  );
}

function SourceActions({
  row,
  onNotice,
}: {
  row: TemplateSummary;
  onNotice: (n: UploadNotice | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const upload = useUploadTemplateSource();
  const fileRef = useRef<HTMLInputElement>(null);
  const reasonId = useId();
  const title = templateTitle(row, locale);
  const hasPdf = row.hasSource;
  const locked = row.hasCompletedAssignments;

  function onFile(file: File | undefined) {
    if (!file) return;
    onNotice(null);
    upload.mutate(
      { id: row.id, file },
      {
        onSuccess: (tpl: ConfirmedTemplate) =>
          onNotice({
            id: row.id,
            tone: tpl.fieldsCleared ? 'pending' : 'approved',
            text: (tpl.fieldsCleared
              ? t.documents.uploadedFieldsCleared
              : t.documents.uploaded
            )
              .replace('{title}', title)
              .replace('{pages}', pagesText(tpl.pageCount, t)),
          }),
        onError: (err) =>
          onNotice({ id: row.id, tone: 'error', text: uploadError(err) }),
      },
    );
    if (fileRef.current) fileRef.current.value = '';
  }

  function uploadError(err: unknown) {
    if (err instanceof ApiError && err.message === 'not-pdf')
      return t.documents.uploadNotPdf;
    if (err instanceof ApiError && err.message === 'too-large')
      return t.documents.uploadTooLarge.replace(
        '{mb}',
        String(MAX_TEMPLATE_BYTES / 1024 / 1024),
      );
    return t.documents.uploadFailed.replace(
      '{reason}',
      errorText(err, t.errors.generic),
    );
  }

  const describedBy = locked ? reasonId : undefined;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.documents.uploadFor.replace('{title}', title)}
        disabled={locked}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <span title={locked ? t.documents.lockedSigned : undefined}>
        <Button
          size="sm"
          variant="ghost"
          loading={upload.isPending}
          disabled={locked}
          aria-describedby={describedBy}
          onClick={() => fileRef.current?.click()}
        >
          {hasPdf ? t.documents.replacePdf : t.documents.uploadPdf}
        </Button>
      </span>
      {hasPdf && row.kind === 'sign' && locked ? (
        <span title={t.documents.lockedSigned}>
          <Button
            size="sm"
            variant="secondary"
            disabled
            aria-describedby={describedBy}
          >
            {t.documents.placeFields}
          </Button>
        </span>
      ) : hasPdf ? (
        <Link
          to={`/admin/documents/${row.id}/edit`}
          className="inline-flex h-9 items-center rounded-md border border-navy px-3 text-sm font-medium text-navy hover:bg-navy-tint"
          aria-label={t.documents.placeFieldsFor.replace('{title}', title)}
        >
          {row.kind === 'sign' ? t.documents.placeFields : t.documents.preview}
        </Link>
      ) : null}
      {locked && (
        <p id={reasonId} className="basis-full text-right text-xs text-slate">
          {t.documents.lockedSigned}
        </p>
      )}
    </>
  );
}

function pagesText(n: number | null, t: Messages) {
  return n === 1
    ? t.documents.onePage
    : t.documents.pages.replace('{n}', String(n ?? 0));
}

function TemplateRow({
  row,
  striped,
  expanded,
  onEdit,
  onAssign,
  onPublish,
  onNotice,
}: {
  row: TemplateSummary;
  striped: boolean;
  expanded: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onPublish: () => void;
  onNotice: (n: UploadNotice | null) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const update = useUpdateTemplate();
  const retire = useRetireTemplate();
  const reasonId = useId();
  const title = templateTitle(row, locale);
  const blocker = publishBlocker(row, t);
  const error = update.error ?? retire.error;

  function onRetire() {
    onNotice(null);
    retire.mutate(row.id, {
      onSuccess: () =>
        onNotice({
          id: row.id,
          tone: 'approved',
          text: t.documents.retired.replace('{title}', title),
        }),
    });
  }

  const publishButton = (label: string, aria: string) => (
    <span title={blocker ?? undefined}>
      <Button
        size="sm"
        variant={row.status === 'draft' ? 'primary' : 'secondary'}
        disabled={blocker !== null}
        aria-label={aria.replace('{title}', title)}
        aria-describedby={blocker ? reasonId : undefined}
        onClick={onPublish}
      >
        {label}
      </Button>
      {blocker && (
        <span id={reasonId} className="sr-only">
          {blocker}
        </span>
      )}
    </span>
  );

  return (
    <tr
      aria-current={expanded ? true : undefined}
      className={cn(
        expanded
          ? 'bg-navy-tint shadow-[inset_3px_0_0_var(--navy)]'
          : striped && 'bg-sunken',
        row.status === 'retired' && 'text-slate',
      )}
    >
      <td className="min-w-[10rem] px-3 py-2">
        <div className={row.status !== 'retired' ? 'font-medium text-ink' : ''}>
          {title}
        </div>
        {locale === 'en' && row.titleZh && (
          <div className="text-xs text-slate">{row.titleZh}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <KindBadge kind={row.kind} />
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        {row.hasSource ? (
          pagesText(row.pageCount, t)
        ) : (
          <span className="text-status-rejected">{t.documents.noPdf}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <TemplateStatusChip status={row.status} />
      </td>
      <td className="px-3 py-2">
        <AudienceCell row={row} />
      </td>
      <td className="px-3 py-2">
        <Toggle
          checked={row.required}
          disabled={update.isPending}
          label={t.documents.requiredFor.replace('{title}', title)}
          onChange={(required) => update.mutate({ id: row.id, required })}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex min-w-[16rem] flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-label={t.documents.editFor.replace('{title}', title)}
            onClick={onEdit}
          >
            {t.common.edit}
          </Button>
          {row.status === 'draft' && (
            <>
              <SourceActions row={row} onNotice={onNotice} />
              {publishButton(t.documents.publish, t.documents.publishFor)}
            </>
          )}
          {row.status === 'live' && (
            <>
              <Button
                size="sm"
                variant="secondary"
                aria-label={t.documents.assignFor.replace('{title}', title)}
                onClick={onAssign}
              >
                {row.assignTo === 'all'
                  ? t.documents.assignMore
                  : t.documents.assign}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={retire.isPending}
                aria-label={t.documents.retireFor.replace('{title}', title)}
                onClick={onRetire}
              >
                {t.documents.retire}
              </Button>
            </>
          )}
          {row.status === 'retired' &&
            publishButton(t.documents.republish, t.documents.republishFor)}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-1 text-right text-xs text-status-rejected"
          >
            {errorText(error, t.errors.generic)}
          </p>
        )}
      </td>
    </tr>
  );
}

function EditTemplate({
  row,
  onDone,
  onNotice,
}: {
  row: TemplateSummary;
  onDone: () => void;
  onNotice: (n: UploadNotice | null) => void;
}) {
  const t = useT();
  const update = useUpdateTemplate();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{t.documents.editTitle}</h2>
        {row.status !== 'draft' && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SourceActions row={row} onNotice={onNotice} />
          </div>
        )}
      </div>
      <TemplateForm
        initial={templateToValues(row)}
        kindEditable={false}
        submitLabel={t.common.save}
        pending={update.isPending}
        error={update.error}
        onCancel={onDone}
        onSubmit={(values) => {
          const patch = valuesToPatch(row, values);
          if (Object.keys(patch).length === 0) return onDone();
          update.mutate({ id: row.id, ...patch }, { onSuccess: onDone });
        }}
      />
    </div>
  );
}

function AddTemplate() {
  const t = useT();
  const create = useCreateTemplate();
  const [formKey, setFormKey] = useState(0);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.documents.addTitle}</h2>
        <p className="text-sm text-slate">{t.documents.addHint}</p>
      </div>
      <TemplateForm
        key={formKey}
        initial={EMPTY_TEMPLATE_VALUES}
        kindEditable
        submitLabel={t.documents.create}
        pending={create.isPending}
        error={create.error}
        onSubmit={(values) =>
          create.mutate(valuesToCreate(values), {
            onSuccess: () => setFormKey((k) => k + 1),
          })
        }
      />
      {create.isSuccess && (
        <Banner tone="approved">
          {t.documents.created.replace('{title}', create.data.titleEn)}
        </Banner>
      )}
    </Card>
  );
}
