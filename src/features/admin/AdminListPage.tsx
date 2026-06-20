import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { formatDate } from '@/lib/date';
import { Card, EmptyState, Select, Spinner, StatusPill } from '@/components';
import { useAdminInstructors, type AdminListFilter } from './api';
import type { AdminInstructorRecord, ApprovalStatus } from '@/lib/types';

/** W2.7 / W3.4 — admin instructor list + filters; table on desktop, cards on mobile. */
export function AdminListPage() {
  const t = useT();
  const { locale } = useLocale();
  const [filter, setFilter] = useState<AdminListFilter>({});
  const { data, isLoading } = useAdminInstructors(filter);

  const name = (r: AdminInstructorRecord) =>
    localizeField(r.displayNameEn, r.displayNameZh, locale) || '—';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.admin.listTitle}</h1>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-slate">
          {t.admin.filterStatus}
          <Select
            className="w-44"
            value={filter.status ?? ''}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                status: (e.target.value || undefined) as ApprovalStatus | undefined,
              }))
            }
          >
            <option value="">{t.admin.all}</option>
            <option value="pending">{t.status.pending}</option>
            <option value="approved">{t.status.approved}</option>
            <option value="rejected">{t.status.rejected}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate">
          {t.admin.filterActive}
          <Select
            className="w-44"
            value={filter.active === undefined ? '' : String(filter.active)}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                active: e.target.value === '' ? undefined : e.target.value === 'true',
              }))
            }
          >
            <option value="">{t.admin.all}</option>
            <option value="true">{t.status.active}</option>
            <option value="false">{t.status.inactive}</option>
          </Select>
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t.admin.noInstructors} />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">{t.admin.listTitle}</caption>
              <thead>
                <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-4 py-3 font-medium">{t.admin.colName}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colEmail}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colApplied}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`fade-rise ${i % 2 ? 'bg-sunken' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/instructors/${row.id}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {name(row)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate">
                      {row.email}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.approvalStatus} isActive={row.isActive} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate">
                      {formatDate(row.insertedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {data.map((row) => (
              <Link key={row.id} to={`/admin/instructors/${row.id}`}>
                <Card className="fade-rise flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-navy">{name(row)}</span>
                    <StatusPill status={row.approvalStatus} isActive={row.isActive} />
                  </div>
                  <span className="font-mono text-xs text-slate">{row.email}</span>
                  <span className="font-mono text-xs text-slate">
                    {formatDate(row.insertedAt, locale)}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
