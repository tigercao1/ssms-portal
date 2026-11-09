import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Banner, Button, Card } from '@/components';
import type { FieldType } from '../api';
import {
  PdfPages,
  type PdfPageRenderInfo,
  type PdfPagesHandle,
} from '../pdf/PdfPages';
import { pdfRectToScreen, type PageGeometry } from '../pdf/transforms';
import type { SourceRecovery } from '../pdf/presignedSource';
import {
  DEFAULT_SIZE,
  newFieldId,
  nudgeField,
  placeField,
  rectAt,
  scaleOf,
} from '../admin/editor/fieldModel';
import { FIELD_ICONS } from '../admin/editor/labels';
import { arrowDelta, PlacedFieldBox } from '../admin/editor/PlacedFieldBox';
import { errorText } from '../admin/format';
import type {
  useSaveFormPlacements,
  FormField,
  FormFieldType,
  FormOriginalPdf,
  FormPlacement,
} from './api';

const EDITOR_TYPE: Record<FormFieldType, FieldType> = {
  text: 'text',
  email: 'text',
  date: 'date',
  signature: 'signature',
};

type Placed = FormPlacement & { id: string };

function withIds(placements: FormPlacement[]): Placed[] {
  return placements.map((p, i) => ({ ...p, id: `p${i}` }));
}

function plain({ key, page, x, y, w, h }: FormPlacement): FormPlacement {
  return { key, page, x, y, w, h };
}

function withoutIds(items: Placed[]): FormPlacement[] {
  return items.map(plain);
}

function samePlacements(a: FormPlacement[], b: FormPlacement[]): boolean {
  return JSON.stringify(a.map(plain)) === JSON.stringify(b.map(plain));
}

export function PlacementEditor({
  pdf,
  fields,
  placements,
  editable,
  sourceRecovery,
  writing,
  onDirtyChange,
  save,
  onSave,
}: {
  pdf: FormOriginalPdf;
  fields: FormField[];
  placements: FormPlacement[];
  editable: boolean;
  sourceRecovery: SourceRecovery;
  writing: boolean;
  onDirtyChange: (dirty: boolean) => void;
  save: ReturnType<typeof useSaveFormPlacements>;
  onSave: (placements: FormPlacement[]) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const pdfRef = useRef<PdfPagesHandle>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const [items, setItems] = useState<Placed[]>(() => withIds(placements));
  const [synced, setSynced] = useState(placements);
  if (synced !== placements) {
    setSynced(placements);
    const keys = new Set(fields.map((f) => f.key));
    setItems(
      samePlacements(withoutIds(items), synced)
        ? withIds(placements)
        : items.filter((p) => keys.has(p.key)),
    );
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const dirty = !samePlacements(withoutIds(items), placements);
  const selected = items.find((p) => p.id === selectedId) ?? null;
  const labelOf = (key: string) =>
    fields.find((f) => f.key === key)?.label ?? key;
  const typeOf = (key: string) =>
    EDITOR_TYPE[fields.find((f) => f.key === key)?.type ?? 'text'];

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (selectedId)
      boxes.current.get(selectedId)?.focus({ preventScroll: true });
  }, [selectedId]);

  const geometry = useCallback(
    (page: number): PageGeometry | null =>
      pdfRef.current?.getGeometry(page) ?? null,
    [],
  );

  const change = (next: Placed[]) => {
    setItems(next);
    if (!save.isPending) save.reset();
  };

  const replace = (item: Placed) =>
    change(items.map((p) => (p.id === item.id ? item : p)));

  const remove = (id: string) => {
    change(items.filter((p) => p.id !== id));
    setSelectedId(null);
  };

  function place(field: FormField) {
    const page = selected?.page ?? activePage;
    const g = geometry(page);
    if (!g) return;
    const scale = scaleOf(g);
    const rect = rectAt(
      DEFAULT_SIZE[EDITOR_TYPE[field.type]],
      g,
      scale,
      g.width / 2,
      g.height / 2,
    );
    const item = {
      id: newFieldId(items.map((p) => p.id)),
      key: field.key,
      page,
      ...rect,
    };
    change([...items, item]);
    setSelectedId(item.id);
    pdfRef.current?.scrollToRect(page, item);
  }

  function onBoxKey(e: KeyboardEvent, item: Placed) {
    const g = geometry(item.page);
    if (!g || !editable) return;
    const move = arrowDelta(e, scaleOf(g));
    if (move) {
      e.preventDefault();
      replace(nudgeField(item, g, move[0], move[1]));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(item.id);
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  }

  function renderOverlay(info: PdfPageRenderInfo) {
    return (
      <div
        className="absolute inset-0"
        data-testid={`placement-overlay-${info.pageNumber}`}
        onMouseDown={(e) => {
          setActivePage(info.pageNumber);
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {items
          .filter((p) => p.page === info.pageNumber)
          .map((item) => {
            const label = labelOf(item.key);
            return (
              <PlacedFieldBox
                key={item.id}
                rect={pdfRectToScreen(info.geometry, item)}
                editable={editable}
                selected={item.id === selectedId}
                icon={FIELD_ICONS[typeOf(item.key)]}
                label={label}
                ariaLabel={s.placedAria
                  .replace('{label}', label)
                  .replace('{page}', String(item.page))}
                elementRef={(el) => {
                  if (el) boxes.current.set(item.id, el);
                  else boxes.current.delete(item.id);
                }}
                onSelect={() => setSelectedId(item.id)}
                onPlace={(left, top, width, height) =>
                  replace(
                    placeField(item, info.geometry, left, top, width, height),
                  )
                }
                onKeyDown={(e) => onBoxKey(e, item)}
              />
            );
          })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate md:hidden">{s.desktopNote}</p>
      {save.isError && (
        <Banner tone="error">
          {s.placementsFailed.replace(
            '{reason}',
            errorText(save.error, t.errors.generic),
          )}
        </Banner>
      )}
      {save.isSuccess && !dirty && (
        <Banner tone="approved">{s.placementsSaved}</Banner>
      )}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="min-w-0 rounded-lg bg-sunken p-3 sm:p-4">
          <PdfPages
            ref={pdfRef}
            source={pdf.url}
            maxPageWidth={760}
            onError={sourceRecovery.onError}
            onLoad={sourceRecovery.onLoad}
            renderOverlay={renderOverlay}
          />
        </div>
        <div className="order-first flex h-fit flex-col gap-3 md:sticky md:top-4 md:order-none md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
          <Card className="flex flex-col gap-2 p-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate">
              {s.placeFields}
            </h3>
            <ul aria-label={s.placeFields} className="flex flex-col gap-1">
              {fields.map((field) => {
                const count = items.filter((p) => p.key === field.key).length;
                const missing = field.required && count === 0;
                return (
                  <li key={field.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => place(field)}
                      aria-label={s.placeField.replace('{label}', field.label)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-grey/80 bg-surface px-2 py-1 text-left text-xs text-navy hover:border-navy hover:bg-navy-tint disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span aria-hidden>
                        {FIELD_ICONS[EDITOR_TYPE[field.type]]}
                      </span>
                      <span className="truncate">
                        {field.label}
                        {field.required && ' *'}
                      </span>
                    </button>
                    <span
                      className={cn(
                        'whitespace-nowrap text-xs',
                        missing
                          ? 'font-medium text-status-rejected'
                          : 'text-slate',
                      )}
                    >
                      {missing
                        ? s.notPlaced
                        : s.placedCount.replace('{n}', String(count))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate">{s.placeHint}</p>
          </Card>
          {selected && editable && (
            <Card className="flex flex-col gap-2 p-3 text-sm">
              <p className="font-medium text-ink">{labelOf(selected.key)}</p>
              <p className="text-xs text-slate">
                {t.documents.pageOf
                  .replace('{n}', String(selected.page))
                  .replace('{total}', String(pdf.pageCount))}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(selected.id)}
                aria-label={s.removePlacement.replace(
                  '{label}',
                  labelOf(selected.key),
                )}
              >
                {t.common.remove}
              </Button>
            </Card>
          )}
          {editable && (
            <Button
              loading={save.isPending}
              disabled={!dirty || writing}
              onClick={() => onSave(withoutIds(items))}
            >
              {s.savePlacements}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
