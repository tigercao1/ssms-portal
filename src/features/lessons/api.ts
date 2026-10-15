import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MyLessonsResponse } from './types';

export const MY_LESSONS_KEY = ['me', 'lessons'] as const;

export function useMyLessons() {
  return useQuery({
    queryKey: MY_LESSONS_KEY,
    queryFn: () => api<MyLessonsResponse>('/me/lessons'),
  });
}
