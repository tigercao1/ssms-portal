import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { Card } from '@/components';
import { buttonClasses } from '@/components/Button';
import { fieldIcon } from './FieldList';
import type { DraftField, DraftPlacement } from './formFields';

type Direction = 'up' | 'down';

export function SigningOrderList({
  fields,
  placements,
  selectedFieldId,
  editable,
  onReorder,
  onSelect,
}: {
  fields: DraftField[];
  placements: DraftPlacement[];
  selectedFieldId: string | null;
  editable: boolean;
  onReorder: (fields: DraftField[]) => void;
  onSelect: (fieldId: string) => void;
}) {
  const t = useT();
  const s = t.signingForms;
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ id: string; direction: Direction } | null>(
    null,
  );

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const index = fields.findIndex((f) => f.id === pending.id);
    const atEdge =
      pending.direction === 'up' ? index === 0 : index === fields.length - 1;
    const direction = atEdge
      ? pending.direction === 'up'
        ? 'down'
        : 'up'
      : pending.direction;
    buttons.current.get(`${pending.id}:${direction}`)?.focus();
  }, [fields]);

  const nameOf = (field: DraftField) => field.label.trim() || field.key;

  const pagesOf = (field: DraftField) =>
    [
      ...new Set(
        placements.filter((p) => p.fieldId === field.id).map((p) => p.page),
      ),
    ].sort((a, b) => a - b);

  const moveTo = (fieldId: string, to: number) => {
    const from = fields.findIndex((f) => f.id === fieldId);
    const field = fields[from];
    if (!field || from === to) return;
    const next = fields.filter((f) => f.id !== fieldId);
    next.splice(to, 0, field);
    onReorder(next);
    setAnnouncement(
      s.orderMoved
        .replace('{label}', nameOf(field))
        .replace('{n}', String(to + 1))
        .replace('{total}', String(fields.length)),
    );
  };

  const step = (field: DraftField, index: number, direction: Direction) => {
    pendingFocus.current = { id: field.id, direction };
    moveTo(field.id, index + (direction === 'up' ? -1 : 1));
  };

  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <Card className="flex flex-col gap-2 p-3">
      <h3 className="text-sm font-medium uppercase tracking-wide text-slate">
        {s.signingOrder}
      </h3>
      <p className="text-xs text-slate">{s.signingOrderHint}</p>
      <ol
        aria-label={s.signingOrder}
        className="flex max-h-96 flex-col overflow-y-auto rounded-md border border-grey/60"
      >
        {fields.map((field, index) => {
          const name = nameOf(field);
          const pages = pagesOf(field);
          const selected = field.id === selectedFieldId;
          return (
            <li
              key={field.id}
              data-testid="signing-order-row"
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOver(index);
              }}
              onDrop={(e) => {
                if (!dragging) return;
                e.preventDefault();
                moveTo(dragging, index);
                endDrag();
              }}
              className={cn(
                'flex items-center gap-1 border-b border-grey/40 px-1 py-0.5 last:border-b-0',
                selected && 'bg-navy-tint',
                dragging === field.id && 'opacity-50',
                over === index &&
                  dragging !== field.id &&
                  'outline outline-2 -outline-offset-2 outline-navy',
              )}
            >
              {editable && (
                <span
                  aria-hidden
                  draggable
                  data-testid="signing-order-handle"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', field.id);
                    setDragging(field.id);
                  }}
                  onDragEnd={endDrag}
                  title={s.dragToReorder}
                  className="cursor-grab select-none px-1 text-slate"
                >
                  ⠿
                </span>
              )}
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(field.id)}
                className="flex min-w-0 flex-1 items-baseline gap-1.5 rounded-sm px-1 py-1 text-left text-sm text-ink hover:bg-navy-tint"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate">
                  {index + 1}.
                </span>
                <span aria-hidden className="w-5 shrink-0 text-center text-xs">
                  {fieldIcon(field.type)}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {name}
                  {field.required ? '\u00a0*' : ''}
                  {pages.length > 0 && (
                    <span className="whitespace-nowrap text-xs text-slate">
                      {' · '}
                      {s.orderPage.replace('{pages}', pages.join(', '))}
                    </span>
                  )}
                </span>
              </button>
              {editable &&
                (['up', 'down'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    ref={(el) => {
                      const id = `${field.id}:${direction}`;
                      if (el) buttons.current.set(id, el);
                      else buttons.current.delete(id);
                    }}
                    className={buttonClasses({
                      variant: 'ghost',
                      size: 'sm',
                      className: 'h-8 w-8 px-0',
                    })}
                    disabled={
                      direction === 'up'
                        ? index === 0
                        : index === fields.length - 1
                    }
                    aria-label={(direction === 'up'
                      ? s.moveUp
                      : s.moveDown
                    ).replace('{label}', name)}
                    onClick={() => step(field, index, direction)}
                  >
                    {direction === 'up' ? '↑' : '↓'}
                  </button>
                ))}
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Card>
  );
}
