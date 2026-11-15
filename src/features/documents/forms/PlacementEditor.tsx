import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Button, Card, Field, Input, Toggle } from '@/components';
import type { DocumentLanguage } from '../api';
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
import {
  FORM_FIELD_KEY_MAX,
  FORM_FIELD_TYPES,
  FORM_TITLE_MAX,
  type FormFieldType,
  type FormOriginalPdf,
} from './api';
import { FieldTypeSelect, fieldTypeLabel } from './FieldList';
import {
  EDITOR_TYPE,
  changeFieldType,
  newField,
  type DraftField,
  type DraftPlacement,
  type FieldIssues,
} from './formFields';

const DRAG_MIME = 'application/x-ssms-form-field-type';

const icon = (type: FormFieldType) =>
  type === 'email' ? '@' : FIELD_ICONS[EDITOR_TYPE[type]];

export function PlacementEditor({
  pdf,
  fields,
  placements,
  lang,
  issues,
  editable,
  sourceRecovery,
  onChange,
}: {
  pdf: FormOriginalPdf;
  fields: DraftField[];
  placements: DraftPlacement[];
  lang: DocumentLanguage;
  issues: Map<string, FieldIssues>;
  editable: boolean;
  sourceRecovery: SourceRecovery;
  onChange: (fields: DraftField[], placements: DraftPlacement[]) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const pdfRef = useRef<PdfPagesHandle>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const selected = placements.find((p) => p.id === selectedId) ?? null;
  const selectedField = selected
    ? (fields.find((f) => f.id === selected.fieldId) ?? null)
    : null;
  const fieldOf = (p: DraftPlacement) => fields.find((f) => f.id === p.fieldId);

  useEffect(() => {
    if (selectedId)
      boxes.current.get(selectedId)?.focus({ preventScroll: true });
  }, [selectedId]);

  const geometry = useCallback(
    (page: number): PageGeometry | null =>
      pdfRef.current?.getGeometry(page) ?? null,
    [],
  );

  const setPlacements = (next: DraftPlacement[]) => onChange(fields, next);

  const replace = (item: DraftPlacement) =>
    setPlacements(placements.map((p) => (p.id === item.id ? item : p)));

  const removePlacement = (id: string) => {
    setPlacements(placements.filter((p) => p.id !== id));
    setSelectedId(null);
  };

  const deleteField = (fieldId: string) => {
    onChange(
      fields.filter((f) => f.id !== fieldId),
      placements.filter((p) => p.fieldId !== fieldId),
    );
    setSelectedId(null);
  };

  const patchField = (fieldId: string, patch: Partial<DraftField>) =>
    onChange(
      fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
      placements,
    );

  function placementAt(
    field: DraftField,
    page: number,
    g: PageGeometry,
    screenX: number,
    screenY: number,
  ): DraftPlacement {
    return {
      id: newFieldId(placements.map((p) => p.id)),
      fieldId: field.id,
      page,
      ...rectAt(
        DEFAULT_SIZE[EDITOR_TYPE[field.type]],
        g,
        scaleOf(g),
        screenX,
        screenY,
      ),
    };
  }

  function add(
    field: DraftField,
    nextFields: DraftField[],
    page: number,
    at?: { x: number; y: number },
  ) {
    const g = geometry(page);
    if (!g) return;
    const item = placementAt(
      field,
      page,
      g,
      at?.x ?? g.width / 2,
      at?.y ?? g.height / 2,
    );
    onChange(nextFields, [...placements, item]);
    setSelectedId(item.id);
    setActivePage(page);
    if (!at) pdfRef.current?.scrollToRect(page, item);
  }

  function addNew(
    type: FormFieldType,
    page: number,
    at?: { x: number; y: number },
  ) {
    const field = newField(type, lang, fields);
    add(field, [...fields, field], page, at);
  }

  function placeAgain(field: DraftField) {
    add(field, fields, selected?.page ?? activePage);
  }

  function onBoxKey(e: KeyboardEvent, item: DraftPlacement) {
    const g = geometry(item.page);
    if (!g || !editable) return;
    const move = arrowDelta(e, scaleOf(g));
    if (move) {
      e.preventDefault();
      replace(nudgeField(item, g, move[0], move[1]));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removePlacement(item.id);
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>, info: PdfPageRenderInfo) {
    const type = e.dataTransfer.getData(DRAG_MIME) as FormFieldType;
    if (!editable || !FORM_FIELD_TYPES.includes(type)) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    addNew(type, info.pageNumber, {
      x: e.clientX - box.left,
      y: e.clientY - box.top,
    });
  }

  function renderOverlay(info: PdfPageRenderInfo) {
    return (
      <div
        className="absolute inset-0"
        data-testid={`placement-overlay-${info.pageNumber}`}
        onDragOver={(e) => {
          if (editable && e.dataTransfer.types.includes(DRAG_MIME))
            e.preventDefault();
        }}
        onDrop={(e) => onDrop(e, info)}
        onMouseDown={(e) => {
          setActivePage(info.pageNumber);
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {placements
          .filter((p) => p.page === info.pageNumber)
          .map((item) => {
            const field = fieldOf(item);
            if (!field) return null;
            const label = field.label || field.key;
            return (
              <PlacedFieldBox
                key={item.id}
                rect={pdfRectToScreen(info.geometry, item)}
                editable={editable}
                selected={item.id === selectedId}
                icon={icon(field.type)}
                label={`${label}${field.required ? ' *' : ''}`}
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

  const issue = selectedField ? issues.get(selectedField.id) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate md:hidden">{s.desktopNote}</p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_290px]">
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
          {editable && (
            <Card className="flex flex-col gap-2 p-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-slate">
                {s.palette}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {FORM_FIELD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => addNew(type, selected?.page ?? activePage)}
                    aria-label={s.addFieldOf.replace(
                      '{type}',
                      fieldTypeLabel(type, t),
                    )}
                    className="flex cursor-grab items-center gap-1 whitespace-nowrap rounded-md border border-grey/80 bg-surface px-2 py-1 text-xs text-navy hover:border-navy hover:bg-navy-tint"
                  >
                    <span aria-hidden>{icon(type)}</span>
                    {fieldTypeLabel(type, t)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate">{s.paletteHint}</p>
            </Card>
          )}
          {selected && selectedField && editable ? (
            <section aria-label={s.selectedField}>
              <Card className="flex flex-col gap-3 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium text-ink">{s.selectedField}</h3>
                  <span className="text-xs text-slate">
                    {t.documents.pageOf
                      .replace('{n}', String(selected.page))
                      .replace('{total}', String(pdf.pageCount))}
                  </span>
                </div>
                <FieldTypeSelect
                  label={s.fieldType}
                  value={selectedField.type}
                  className="h-9 text-sm"
                  onChange={(type) =>
                    onChange(
                      fields.map((f) =>
                        f.id === selectedField.id
                          ? changeFieldType(f, type, lang)
                          : f,
                      ),
                      placements,
                    )
                  }
                />
                <Field label={s.fieldKey} error={issue?.key}>
                  {(p) => (
                    <Input
                      {...p}
                      value={selectedField.key}
                      maxLength={FORM_FIELD_KEY_MAX}
                      spellCheck={false}
                      autoCapitalize="off"
                      className="h-9 font-mono text-sm"
                      onChange={(e) =>
                        patchField(selectedField.id, { key: e.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={s.fieldLabel} error={issue?.label}>
                  {(p) => (
                    <Input
                      {...p}
                      value={selectedField.label}
                      maxLength={FORM_TITLE_MAX}
                      className="h-9 text-sm"
                      onChange={(e) =>
                        patchField(selectedField.id, { label: e.target.value })
                      }
                    />
                  )}
                </Field>
                <label className="flex items-center gap-2 text-ink">
                  <Toggle
                    checked={selectedField.required}
                    label={s.requiredFor.replace(
                      '{label}',
                      selectedField.label || selectedField.key,
                    )}
                    onChange={(required) =>
                      patchField(selectedField.id, { required })
                    }
                  />
                  {s.required}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => placeAgain(selectedField)}
                  >
                    {s.placeAgain}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removePlacement(selected.id)}
                  >
                    {s.removePlacement}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteField(selectedField.id)}
                  >
                    {s.deleteField}
                  </Button>
                </div>
              </Card>
            </section>
          ) : (
            editable && (
              <p className="px-1 text-xs text-slate">{s.selectHint}</p>
            )
          )}
          {editable && fields.length > 0 && (
            <Card className="flex flex-col gap-2 p-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-slate">
                {s.placeFields}
              </h3>
              <ul aria-label={s.placeFields} className="flex flex-col gap-1">
                {fields.map((field) => {
                  const count = placements.filter(
                    (p) => p.fieldId === field.id,
                  ).length;
                  const missing = field.required && count === 0;
                  const label = field.label || field.key;
                  return (
                    <li key={field.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => placeAgain(field)}
                        aria-label={s.placeField.replace('{label}', label)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-grey/80 bg-surface px-2 py-1 text-left text-xs text-navy hover:border-navy hover:bg-navy-tint"
                      >
                        <span aria-hidden>{icon(field.type)}</span>
                        <span className="truncate">
                          {label}
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
                        {count === 0
                          ? s.notPlaced
                          : s.placedCount.replace('{n}', String(count))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
