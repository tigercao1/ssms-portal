import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Banner, Button, Card, Spinner } from '@/components';
import {
  FIELD_TYPES,
  type DocumentLanguage,
  type Field,
  type FieldType,
  type Template,
} from '../../api';
import { DocumentLanguageSwitch } from '../../signer/DocumentLanguageSwitch';
import {
  PdfPages,
  type PdfPageRenderInfo,
  type PdfPagesHandle,
} from '../../pdf/PdfPages';
import { pdfRectToScreen, type PageGeometry } from '../../pdf/transforms';
import { useSaveFields, useTemplate } from '../hooks';
import { AssignDialog } from '../AssignDialog';
import { KindBadge } from '../badges';
import { errorText, languageName, templateTitle } from '../format';
import {
  createFieldAt,
  duplicateField,
  fitToPage,
  nudgeField,
  placeField,
  sameFields,
  scaleOf,
} from './fieldModel';
import {
  type SourceRecovery,
  useSourceRecovery,
} from '../../pdf/presignedSource';
import { PropertiesPanel } from './PropertiesPanel';
import { SignerPreviewField } from './SignerPreviewField';
import { FIELD_ICONS, useFieldTypeLabel } from './labels';

const DRAG_MIME = 'application/x-ssms-field-type';

interface EditorVersion {
  language: DocumentLanguage | null;
  translation: boolean;
  sourceUrl: string | null;
  pageCount: number | null;
  fields: Field[];
}

function versionOf(template: Template, language: string | null): EditorVersion {
  const translation = template.translations.find(
    (tr) => tr.language === language && tr.hasSource,
  );
  return translation
    ? {
        language: translation.language,
        translation: true,
        sourceUrl: translation.sourceUrl,
        pageCount: translation.pageCount,
        fields: translation.fields,
      }
    : {
        language: template.sourceLanguage,
        translation: false,
        sourceUrl: template.sourceUrl,
        pageCount: template.pageCount,
        fields: template.fields,
      };
}

/** Field-placement editor for one template. */
export function FieldEditorPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const t = useT();
  const template = useTemplate(id);
  const sourceRecovery = useSourceRecovery(template);

  if (template.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (!template.data)
    return (
      <Banner tone="error">
        {errorText(template.error, t.errors.generic)}
      </Banner>
    );
  const version = versionOf(template.data, params.get('language'));
  const sourceLanguage = template.data.sourceLanguage;
  return (
    <Editor
      key={`${template.data.id}:${version.translation ? version.language : ''}`}
      template={template.data}
      version={version}
      onLanguageChange={(language) =>
        setParams(language === sourceLanguage ? {} : { language })
      }
      sourceRecovery={sourceRecovery}
    />
  );
}

function Editor({
  template,
  version,
  onLanguageChange,
  sourceRecovery,
}: {
  template: Template;
  version: EditorVersion;
  onLanguageChange: (language: DocumentLanguage) => void;
  sourceRecovery: SourceRecovery;
}) {
  const t = useT();
  const { locale } = useLocale();
  const typeLabel = useFieldTypeLabel();
  const save = useSaveFields();
  const pdfRef = useRef<PdfPagesHandle>(null);
  const [saved, setSaved] = useState<Field[]>(version.fields);
  const [fields, setFields] = useState<Field[]>(version.fields);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [numPages, setNumPages] = useState(version.pageCount ?? 0);
  const fieldEls = useRef(new Map<string, HTMLElement>());
  const locked = template.hasCompletedAssignments;
  const canPlace = template.kind === 'sign' && !preview && !locked;
  const dirty = !sameFields(fields, saved);
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const title = templateTitle(template, locale);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const geometry = useCallback(
    (page: number): PageGeometry | null =>
      pdfRef.current?.getGeometry(page) ?? null,
    [],
  );

  const updateField = useCallback(
    (next: Field) => {
      const g = geometry(next.page);
      const fitted = g ? { ...next, ...fitToPage(next, g) } : next;
      setFields((list) => list.map((f) => (f.id === next.id ? fitted : f)));
      save.reset();
    },
    [geometry, save],
  );

  const patchField = useCallback(
    (id: string, patch: Partial<Field>) => {
      setFields((list) =>
        list.map((f) => {
          if (f.id !== id) return f;
          const next = { ...f, ...patch };
          const g = geometry(next.page);
          return g ? { ...next, ...fitToPage(next, g) } : next;
        }),
      );
      save.reset();
    },
    [geometry, save],
  );

  function addField(field: Field) {
    setFields((list) => [...list, field]);
    setSelectedId(field.id);
    setActivePage(field.page);
    save.reset();
  }

  function addAtCentre(type: FieldType) {
    const page = selected?.page ?? activePage;
    const g = geometry(page);
    if (!g) return;
    const field = createFieldAt(
      type,
      page,
      g,
      scaleOf(g),
      g.width / 2,
      g.height / 2,
      fields.map((f) => f.id),
    );
    addField(field);
    pdfRef.current?.scrollToRect(page, field);
  }

  function removeField(id: string) {
    setFields((list) => list.filter((f) => f.id !== id));
    setSelectedId(null);
    save.reset();
  }

  function duplicate(field: Field) {
    const g = geometry(field.page);
    if (!g) return;
    addField(
      duplicateField(
        field,
        g,
        scaleOf(g),
        fields.map((f) => f.id),
      ),
    );
  }

  useEffect(() => {
    if (selectedId)
      fieldEls.current.get(selectedId)?.focus({ preventScroll: true });
  }, [selectedId, fields.length]);

  function onFieldKey(e: KeyboardEvent, field: Field) {
    const g = geometry(field.page);
    if (!g) return;
    const step = (e.shiftKey ? 10 : 1) * scaleOf(g);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      updateField(nudgeField(field, g, move[0], move[1]));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeField(field.id);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate(field);
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>, info: PdfPageRenderInfo) {
    const type = e.dataTransfer.getData(DRAG_MIME) as FieldType;
    if (!FIELD_TYPES.includes(type) || !canPlace) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    addField(
      createFieldAt(
        type,
        info.pageNumber,
        info.geometry,
        scaleOf(info.geometry),
        e.clientX - box.left,
        e.clientY - box.top,
        fields.map((f) => f.id),
      ),
    );
  }

  function renderOverlay(info: PdfPageRenderInfo) {
    const pageFields = fields.filter((f) => f.page === info.pageNumber);
    return (
      <div
        className="absolute inset-0"
        data-testid={`page-overlay-${info.pageNumber}`}
        onDragOver={(e) => {
          if (canPlace && e.dataTransfer.types.includes(DRAG_MIME))
            e.preventDefault();
        }}
        onDrop={(e) => onDrop(e, info)}
        onMouseDown={(e) => {
          setActivePage(info.pageNumber);
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {pageFields.map((field) => {
          const s = pdfRectToScreen(info.geometry, field);
          if (preview)
            return <SignerPreviewField key={field.id} field={field} rect={s} />;
          const isSelected = field.id === selectedId;
          return (
            <Rnd
              key={field.id}
              bounds="parent"
              size={{ width: s.width, height: s.height }}
              position={{ x: s.left, y: s.top }}
              minWidth={4}
              minHeight={4}
              disableDragging={!canPlace}
              enableResizing={canPlace}
              onDragStart={() => setSelectedId(field.id)}
              onDragStop={(_e, d) =>
                updateField(
                  placeField(field, info.geometry, d.x, d.y, s.width, s.height),
                )
              }
              onResizeStart={() => setSelectedId(field.id)}
              onResizeStop={(_e, _dir, el, _delta, pos) =>
                updateField(
                  placeField(
                    field,
                    info.geometry,
                    pos.x,
                    pos.y,
                    el.offsetWidth || Number.parseFloat(el.style.width),
                    el.offsetHeight || Number.parseFloat(el.style.height),
                  ),
                )
              }
              className={cn('group', isSelected ? 'z-20' : 'z-10')}
            >
              <div
                ref={(el) => {
                  if (el) fieldEls.current.set(field.id, el);
                  else fieldEls.current.delete(field.id);
                }}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={t.documents.fieldAria
                  .replace('{type}', typeLabel(field.type))
                  .replace('{label}', field.labelEn)
                  .replace('{page}', String(field.page))}
                onClick={() => setSelectedId(field.id)}
                onKeyDown={(e) => onFieldKey(e, field)}
                className={cn(
                  'flex h-full w-full cursor-move items-center gap-1 overflow-hidden rounded-sm border px-1 text-[11px] leading-none outline-none',
                  isSelected
                    ? 'border-red bg-red/10 text-red ring-2 ring-red/40'
                    : 'border-navy/70 bg-navy-tint/80 text-navy hover:border-navy',
                )}
              >
                <span aria-hidden className="shrink-0">
                  {FIELD_ICONS[field.type]}
                </span>
                <span className="truncate">
                  {field.labelEn}
                  {field.required && ' *'}
                </span>
              </div>
            </Rnd>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to="/admin/documents"
            className="text-sm text-navy hover:underline"
          >
            ← {t.documents.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl">{title}</h1>
            <KindBadge kind={template.kind} />
            {template.languages.length > 1 && (
              <DocumentLanguageSwitch
                languages={template.languages}
                value={version.language}
                label={t.documents.editorLanguage}
                labels={{
                  zh: languageName('zh', t),
                  en: languageName('en', t),
                }}
                disabled={dirty}
                disabledReason={t.documents.unsaved}
                onChange={onLanguageChange}
              />
            )}
            {dirty && (
              <span className="text-xs font-medium text-status-pending">
                {t.documents.unsaved}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={preview}
            onClick={() => {
              setPreview((p) => !p);
              setSelectedId(null);
            }}
          >
            {preview ? t.documents.backToEditing : t.documents.previewAsSigner}
          </Button>
          {template.assignTo !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={template.status !== 'live' || !template.sourceUrl}
              onClick={() => setAssigning(true)}
            >
              {t.documents.assignEllipsis}
            </Button>
          )}
          {template.kind === 'sign' && !locked && (
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!dirty || fields.some((f) => !f.labelEn.trim())}
              onClick={() =>
                save.mutate(
                  {
                    id: template.id,
                    fields,
                    ...(version.translation &&
                      version.language && { language: version.language }),
                  },
                  {
                    onSuccess: (tpl) => {
                      const next = versionOf(tpl, version.language).fields;
                      setSaved(next);
                      setFields(next);
                    },
                  },
                )
              }
            >
              {t.documents.saveFields}
            </Button>
          )}
        </div>
      </div>

      {save.isError && (
        <Banner tone="error">
          {t.documents.saveFailed.replace(
            '{reason}',
            errorText(save.error, t.errors.generic),
          )}
        </Banner>
      )}
      {save.isSuccess && !dirty && (
        <Banner tone="approved">
          {t.documents.fieldsSaved.replace('{n}', String(saved.length))}
        </Banner>
      )}
      {template.kind === 'sign' && locked && (
        <Banner tone="pending">{t.documents.lockedSigned}</Banner>
      )}
      {template.kind === 'read' && (
        <Banner tone="info">{t.documents.readNoFields}</Banner>
      )}
      {preview && <Banner tone="info">{t.documents.previewNotice}</Banner>}

      {!version.sourceUrl ? (
        <Banner tone="pending">{t.documents.noSourceYet}</Banner>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="min-w-0 rounded-lg bg-sunken p-3 sm:p-4">
            <PdfPages
              ref={pdfRef}
              source={version.sourceUrl}
              onError={sourceRecovery.onError}
              renderOverlay={renderOverlay}
              onLoad={(info) => {
                setNumPages(info.numPages);
                sourceRecovery.onLoad();
              }}
            />
          </div>
          <div className="order-first flex h-fit flex-col gap-4 md:sticky md:top-4 md:order-none md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
            {canPlace && (
              <Card className="flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-slate">
                    {t.documents.palette}
                  </h2>
                  <p className="text-xs text-slate">
                    {t.documents.fieldCount.replace(
                      '{n}',
                      String(fields.length),
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      draggable={canPlace}
                      disabled={!canPlace}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addAtCentre(type)}
                      aria-label={t.documents.addFieldOf.replace(
                        '{type}',
                        typeLabel(type),
                      )}
                      className="flex cursor-grab items-center gap-1 whitespace-nowrap rounded-md border border-grey/80 bg-surface px-2 py-1 text-xs text-navy hover:border-navy hover:bg-navy-tint disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden className="text-xs">
                        {FIELD_ICONS[type]}
                      </span>
                      {typeLabel(type)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate">{t.documents.paletteHint}</p>
              </Card>
            )}

            <Card className="p-4">
              {selected && canPlace ? (
                <PropertiesPanel
                  key={selected.id}
                  field={selected}
                  pageLabel={t.documents.pageOf
                    .replace('{n}', String(selected.page))
                    .replace('{total}', String(numPages))}
                  onChange={(patch) => patchField(selected.id, patch)}
                  onDuplicate={() => duplicate(selected)}
                  onDelete={() => removeField(selected.id)}
                />
              ) : (
                <div className="flex flex-col gap-2 text-sm text-slate">
                  <h2 className="text-lg text-ink">{t.documents.properties}</h2>
                  <p>
                    {canPlace
                      ? t.documents.selectAField
                      : t.documents.propertiesIdle}
                  </p>
                  <p className="text-xs">{t.documents.coordinateNote}</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {assigning && (
        <AssignDialog template={template} onClose={() => setAssigning(false)} />
      )}
    </div>
  );
}
