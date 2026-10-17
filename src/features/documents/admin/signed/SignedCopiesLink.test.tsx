import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../../api/handlers';
import { DocumentsListPage } from '../DocumentsListPage';

let state: DocumentsMockState;

beforeEach(() => {
  state = createDocumentsState({ instructorIds: ['inst-1', 'inst-2'] });
  server.use(...documentsHandlers(state));
});

function row(title: string) {
  return screen.getByText(title).closest('tr') as HTMLElement;
}

describe('DocumentsListPage signed copies link', () => {
  it('links each live template’s count to its signed copies page', async () => {
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    expect(
      within(row('Code of conduct')).getByRole('link', {
        name: '1 of 2 approved assigned · 1 signed',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-conduct/signed');
    expect(
      within(row('Code of conduct')).getByRole('link', {
        name: '1 of 2 approved assigned · 1 signed',
      }),
    ).toHaveAttribute('title', 'Signed copies of Code of conduct');
    expect(
      within(row('Instructor handbook')).getByRole('link', {
        name: '1 of 2 approved assigned · 1 acknowledged',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-handbook/signed');
    expect(
      within(row('Liability waiver')).getByRole('link', {
        name: '1 instructors',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-waiver/signed');
  });

  it('keeps a link on retired templates and none on drafts', async () => {
    state.templates.find((t) => t.id === 'tpl-waiver')!.status = 'retired';
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Liability waiver');
    expect(
      within(row('Liability waiver')).getByRole('link', {
        name: 'Signed copies',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-waiver/signed');
    expect(within(row('Uniform policy')).queryByRole('link')).toBeNull();
    expect(within(row('Uniform policy')).getByText('—')).toBeInTheDocument();
  });
});
