import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/date';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '@/components';
import { useCreatePage, usePublicPages } from './pagesApi';
import { isValidSlug, MAX_TITLE_LENGTH, suggestSlug } from './pageRules';
import { CopyLinkButton, PageStatusPill } from './PageParts';

/** Admin list of public HTML pages with a create form. */
export function PagesListPage() {
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">{t.pages.title}</h1>
        <p className="text-sm text-slate">{t.pages.intro}</p>
      </div>
      <PagesTable />
      <CreatePageCard />
    </div>
  );
}

function PagesTable() {
  const t = useT();
  const { locale } = useLocale();
  const pages = usePublicPages();

  if (pages.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  if (pages.isError) {
    return (
      <Card>
        <Banner tone="error">
          {pages.error instanceof ApiError
            ? pages.error.message
            : t.errors.generic}
        </Banner>
      </Card>
    );
  }
  if (!pages.data?.length) return <EmptyState title={t.pages.empty} />;

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">{t.pages.title}</caption>
        <thead>
          <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
            <th className="px-4 py-3 font-medium">{t.pages.colTitle}</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">
              {t.pages.colSlug}
            </th>
            <th className="w-px whitespace-nowrap px-4 py-3 font-medium">
              {t.pages.colStatus}
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">
              {t.pages.colUpdated}
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">
              {t.pages.colLink}
            </th>
          </tr>
        </thead>
        <tbody>
          {pages.data.map((page, i) => (
            <tr key={page.id} className={cn(i % 2 === 1 && 'bg-sunken')}>
              <td className="px-4 py-3">
                <Link
                  to={`/admin/pages/${page.id}`}
                  className="font-medium text-navy hover:underline"
                >
                  {page.title}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate">
                {page.slug}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <PageStatusPill page={page} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate">
                {formatDateTime(page.updatedAt, locale)}
              </td>
              <td className="px-4 py-3">
                {page.status === 'published' ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-xs text-navy hover:underline"
                    >
                      {page.url}
                    </a>
                    <CopyLinkButton
                      url={page.url}
                      ariaLabel={t.pages.copyLinkFor.replace(
                        '{title}',
                        page.title,
                      )}
                    />
                  </div>
                ) : (
                  <span className="text-slate">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CreatePageCard() {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreatePage();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [slugTaken, setSlugTaken] = useState(false);

  const trimmedTitle = title.trim();
  const titleError =
    submitted && (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH)
      ? t.pages.titleInvalid
      : undefined;
  const slugError = slugTaken
    ? t.pages.slugTaken
    : (submitted || slug) && !isValidSlug(slug)
      ? t.pages.slugInvalid
      : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setSlugTaken(false);
    if (
      !trimmedTitle ||
      trimmedTitle.length > MAX_TITLE_LENGTH ||
      !isValidSlug(slug)
    )
      return;
    try {
      const page = await create.mutateAsync({ slug, title: trimmedTitle });
      navigate(`/admin/pages/${page.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setSlugTaken(true);
    }
  }

  const otherError = create.isError && !slugTaken;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.pages.createTitle}</h2>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.pages.titleLabel} required error={titleError}>
            {(p) => (
              <Input
                {...p}
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugEdited) setSlug(suggestSlug(e.target.value));
                }}
              />
            )}
          </Field>
          <Field
            label={t.pages.slugLabel}
            required
            hint={t.pages.slugHint}
            error={slugError}
          >
            {(p) => (
              <Input
                {...p}
                className="font-mono"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(e.target.value !== '');
                  setSlugTaken(false);
                }}
              />
            )}
          </Field>
        </div>
        {otherError && (
          <Banner tone="error">
            {create.error instanceof ApiError
              ? create.error.message
              : t.errors.generic}
          </Banner>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={create.isPending}>
            {t.pages.create}
          </Button>
        </div>
      </form>
    </Card>
  );
}
