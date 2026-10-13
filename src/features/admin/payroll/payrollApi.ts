import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  PayrollAdjustment,
  PayrollAdjustmentInput,
  PayrollPeriod,
  PayrollPeriodDetail,
  PayrollSettings,
} from './types';

const payrollKey = ['admin', 'payroll'] as const;
const settingsKey = [...payrollKey, 'settings'] as const;
const periodKey = (id: string) => [...payrollKey, 'period', id] as const;

export function usePayrollSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<PayrollSettings>('/admin/payroll/settings'),
  });
}

export function useUpdatePayrollSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (anchorDate: string) =>
      api<PayrollSettings>('/admin/payroll/settings', {
        method: 'PUT',
        body: { anchorDate },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: payrollKey }),
  });
}

export function usePayrollPeriods(around: string | null) {
  return useQuery({
    queryKey: [...payrollKey, 'periods', around] as const,
    queryFn: () =>
      api<PayrollPeriod[]>(
        `/admin/payroll/periods${around ? `?around=${around}` : ''}`,
      ),
  });
}

export function usePayrollPeriod(id: string | null) {
  return useQuery({
    queryKey: periodKey(id ?? ''),
    enabled: id !== null,
    queryFn: () => api<PayrollPeriodDetail>(`/admin/payroll/periods/${id}`),
  });
}

function usePeriodMutation<TVars, TResult>(
  periodId: string,
  request: (vars: TVars) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async (result) => {
      if (result && typeof result === 'object' && 'period' in result) {
        qc.setQueryData(periodKey(periodId), result);
      }
      await qc.invalidateQueries({ queryKey: payrollKey });
    },
  });
}

export function useAddPayrollAdjustment(periodId: string) {
  return usePeriodMutation(periodId, (body: PayrollAdjustmentInput) =>
    api<PayrollAdjustment>(`/admin/payroll/periods/${periodId}/adjustments`, {
      method: 'POST',
      body,
    }),
  );
}

export function useDeletePayrollAdjustment(periodId: string) {
  return usePeriodMutation(periodId, (adjustmentId: string) =>
    api<void>(
      `/admin/payroll/periods/${periodId}/adjustments/${adjustmentId}`,
      { method: 'DELETE' },
    ),
  );
}

export function useFinalizePayrollPeriod(periodId: string) {
  return usePeriodMutation(periodId, (acceptZeroRate: boolean) =>
    api<PayrollPeriodDetail>(`/admin/payroll/periods/${periodId}/finalize`, {
      method: 'POST',
      body: acceptZeroRate ? { acceptZeroRate: true } : {},
    }),
  );
}

export function useReopenPayrollPeriod(periodId: string) {
  return usePeriodMutation(periodId, () =>
    api<PayrollPeriodDetail>(`/admin/payroll/periods/${periodId}/reopen`, {
      method: 'POST',
    }),
  );
}

export async function fetchPayrollCsv(periodId: string, detail: boolean) {
  const text = await api<string>(
    `/admin/payroll/periods/${periodId}/export.csv${detail ? '?detail=1' : ''}`,
    { responseType: 'text' },
  );
  return text.startsWith('\uFEFF') ? text : `\uFEFF${text}`;
}
