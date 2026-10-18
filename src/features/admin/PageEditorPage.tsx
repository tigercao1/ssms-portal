import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/date';
import {
  Banner,
  Button,
  Card,
  Field,
  FileButton,
  Input,
  Spinner,
} from '@/components';
import type { PublicPage } from '@/lib/types';
import {
  useDeletePage,
  usePageContent,
  usePublicPage,
  usePublishPage,
  useUpdatePageTitle,
  useUploadPageContent,
} from './pagesApi';
import { checkHtmlFile, MAX_TITLE_LENGTH } from './pageRules';
import { CopyLinkButton, formatBytes, PageStatusPill } from './PageParts';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Admin editor for one public page: title, HTML upload, sandboxed preview, publishing. */
export function PageEditorPage() {
  const t = useT();
  const { id = '' } = useParams();
  const page = usePublicPage(id);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/pages" className="text-sm text-navy hover:underline">
        ← {t.pages.backToList}
      </Link>
      {page.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : page.isError ? (
        <Card>
          <Banner tone="error">
            {errorText(page.error, t.errors.generic)}
          </Banner>
        </Card>
      ) : page.data ? (
        <PageEditor key={page.data.id} page={page.data} />
      ) : (
        <Card>
          <Banner tone="error">{t.pages.notFound}</Banner>
        </Card>
      )}
    </div>
  );
}

function PageEditor({ page }: { page: PublicPage }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{page.title}</h1>
        <PageStatusPill page={page} />
      </div>
      {page.status === 'published' && <PublicLinkCard page={page} />}
      <PublishingCard page={page} />
      <DetailsCard page={page} />
      <ContentCard page={page} />
      <PreviewCard page={page} />
    </>
  );
}

function PublicLinkCard({ page }: { page: PublicPage }) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.pages.colLink}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="break-all font-mono text-sm text-ink">{page.url}</span>
        <CopyLinkButton url={page.url} />
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap text-sm text-navy hover:underline"
        >
          {t.pages.viewLive} ↗
        </a>
      </div>
    </Card>
  );
}

type PendingAction = 'publish' | 'unpublish' | 'delete';

function PublishingCard({ page }: { page: PublicPage }) {
  const t = useT();
  const navigate = useNavigate();
  const publish = usePublishPage(page.id, 'publish');
  const unpublish = usePublishPage(page.id, 'unpublish');
  const remove = useDeletePage(page.id);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mutation =
    pending === 'publish'
      ? publish
      : pending === 'unpublish'
        ? unpublish
        : remove;
  const canPublish = page.status === 'draft' || page.hasUnpublishedChanges;

  function start(action: PendingAction) {
    publish.reset();
    unpublish.reset();
    remove.reset();
    setNotice(null);
    setPending(action);
  }

  function confirm() {
    if (pending === 'publish') {
      publish.mutate(undefined, {
        onSuccess: () => {
          setPending(null);
          setNotice(t.pages.publishedDone);
        },
      });
    } else if (pending === 'unpublish') {
      unpublish.mutate(undefined, {
        onSuccess: () => {
          setPending(null);
          setNotice(t.pages.unpublishedDone);
        },
      });
    } else if (pending === 'delete') {
      remove.mutate(undefined, {
        onSuccess: () => navigate('/admin/pages'),
      });
    }
  }

  const copy = {
    publish: [t.pages.publishTitle, t.pages.publishBody, t.pages.publish],
    unpublish: [
      t.pages.unpublishTitle,
      t.pages.unpublishBody,
      t.pages.unpublish,
    ],
    delete: [t.pages.deleteTitle, t.pages.deleteBody, t.pages.deleteConfirm],
  } as const;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.pages.publishingTitle}</h2>
      {pending ? (
        <div
          role="alertdialog"
          aria-labelledby="page-action-title"
          className={
            pending === 'publish'
              ? 'flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink'
              : 'flex flex-col gap-3 rounded-md border-l-[3px] border-l-status-rejected bg-red-tint px-4 py-3 text-sm text-ink'
          }
        >
          <p id="page-action-title" className="font-semibold">
            {copy[pending][0].replace('{title}', page.title)}
          </p>
          <p>{copy[pending][1]}</p>
          {mutation.isError && (
            <Banner tone="error">
              {errorText(mutation.error, t.errors.generic)}
            </Banner>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={mutation.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant={pending === 'publish' ? 'primary' : 'danger'}
              loading={mutation.isPending}
              onClick={confirm}
            >
              {copy[pending][2]}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canPublish && (
            <Button
              disabled={!page.hasContent}
              onClick={() => start('publish')}
            >
              {page.status === 'published'
                ? t.pages.publishChanges
                : t.pages.publish}
            </Button>
          )}
          {page.status === 'published' && (
            <Button variant="secondary" onClick={() => start('unpublish')}>
              {t.pages.unpublish}
            </Button>
          )}
          <Button variant="ghost" onClick={() => start('delete')}>
            {t.pages.deletePage}
          </Button>
        </div>
      )}
      {!page.hasContent && !pending && (
        <p className="text-sm text-slate">{t.pages.needsContent}</p>
      )}
      {notice && <Banner tone="approved">{notice}</Banner>}
    </Card>
  );
}

function DetailsCard({ page }: { page: PublicPage }) {
  const t = useT();
  const { locale } = useLocale();
  const update = useUpdatePageTitle(page.id);
  const [title, setTitle] = useState(page.title);
  const trimmed = title.trim();
  const dirty = trimmed !== page.title;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !trimmed || update.isPending) return;
    update.mutate(trimmed);
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.pages.detailsTitle}</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-slate">
            {t.pages.slugLabel}
          </dt>
          <dd className="break-all font-mono text-ink">{page.slug}</dd>
          <dd className="text-xs text-slate">{t.pages.slugReadonly}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-slate">
            {t.pages.colUpdated}
          </dt>
          <dd className="text-ink">{formatDateTime(page.updatedAt, locale)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-slate">
            {t.pages.lastPublished}
          </dt>
          <dd className="text-ink">
            {page.publishedAt ? formatDateTime(page.publishedAt, locale) : '—'}
          </dd>
        </div>
      </dl>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field
          label={t.pages.titleLabel}
          required
          error={trimmed ? undefined : t.pages.titleInvalid}
        >
          {(p) => (
            <Input
              {...p}
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => {
                update.reset();
                setTitle(e.target.value);
              }}
            />
          )}
        </Field>
        {update.isError && (
          <Banner tone="error">
            {errorText(update.error, t.errors.generic)}
          </Banner>
        )}
        {update.isSuccess && (
          <Banner tone="approved">{t.pages.titleSaved}</Banner>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="secondary"
            loading={update.isPending}
            disabled={!dirty || !trimmed}
          >
            {t.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ContentCard({ page }: { page: PublicPage }) {
  const t = useT();
  const upload = useUploadPageContent(page.id);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);

  function sizeError(file: File) {
    return t.pages.fileSizeError.replace('{size}', formatBytes(file.size));
  }

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    upload.reset();
    setUploaded(null);
    const problem = checkHtmlFile(file);
    if (problem) {
      setFileError(
        problem === 'type' ? t.pages.fileTypeError : sizeError(file),
      );
      return;
    }
    setFileError(null);
    upload.mutate(file, {
      onSuccess: () => setUploaded(file.name),
      onError: (err) => {
        if (err instanceof ApiError && err.status === 413)
          setFileError(sizeError(file));
      },
    });
  }

  const uploadError =
    upload.isError && !fileError
      ? errorText(upload.error, t.errors.generic)
      : null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.pages.contentTitle}</h2>
        <p className="text-sm text-slate">{t.pages.contentHint}</p>
        {page.sizeBytes !== null && (
          <p className="text-sm text-slate">
            {t.pages.draftSize.replace('{size}', formatBytes(page.sizeBytes))}
          </p>
        )}
      </div>
      <div>
        <FileButton
          variant="secondary"
          accept="text/html,.html,.htm"
          aria-label={t.pages.fileInputLabel}
          loading={upload.isPending}
          onChange={choose}
        >
          {page.hasContent ? t.pages.replaceFile : t.pages.uploadFile}
        </FileButton>
      </div>
      {fileError && <Banner tone="error">{fileError}</Banner>}
      {uploadError && <Banner tone="error">{uploadError}</Banner>}
      {uploaded && (
        <Banner tone="approved">
          <span data-private>
            {t.pages.uploaded.replace('{name}', uploaded)}
          </span>
        </Banner>
      )}
    </Card>
  );
}

function PreviewCard({ page }: { page: PublicPage }) {
  const t = useT();
  const content = usePageContent(page.id, page.hasContent);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.pages.previewTitle}</h2>
        <p className="text-sm text-slate">{t.pages.previewNote}</p>
      </div>
      {!page.hasContent ? (
        <p className="text-sm text-slate">{t.pages.noContent}</p>
      ) : content.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : content.isError ? (
        <Banner tone="error">
          {errorText(content.error, t.errors.generic)}
        </Banner>
      ) : (
        <iframe
          sandbox=""
          srcDoc={content.data ?? ''}
          title={t.pages.previewFrameTitle.replace('{title}', page.title)}
          className="h-[70vh] w-full rounded-md border border-grey/60 bg-white"
        />
      )}
    </Card>
  );
}
