import { useLocale } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface PagerText {
  label: string;
  showing: string;
  previous: string;
  next: string;
}

export function Pager({
  page,
  shownPage,
  pageSize,
  count,
  total,
  busy,
  onPage,
  text,
  className,
}: {
  page: number;
  shownPage: number;
  pageSize: number;
  count: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
  text: PagerText;
  className?: string;
}) {
  const { locale } = useLocale();
  const number = new Intl.NumberFormat(locale);
  const from = (shownPage - 1) * pageSize + 1;
  const to = from + count - 1;
  const hasNext = shownPage * pageSize < total;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav
      aria-label={text.label}
      className={cn(
        'flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-slate" aria-live="polite">
        {count > 0
          ? text.showing
              .replace('{from}', number.format(from))
              .replace('{to}', number.format(to))
              .replace('{total}', number.format(total))
          : null}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 1 || busy}
          onClick={() => onPage(Math.min(page - 1, lastPage))}
        >
          {text.previous}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasNext || busy}
          onClick={() => onPage(page + 1)}
        >
          {text.next}
        </Button>
      </div>
    </nav>
  );
}
