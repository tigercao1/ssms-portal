import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { StatusBanner } from './StatusBanner';
import { renderWithProviders } from '@/test/render';

function look(banner: HTMLElement) {
  return {
    tone: banner.className.split(' ').find((c) => /^border-l-[a-z]/.test(c)),
    icon: banner.querySelector('svg')?.outerHTML,
  };
}

describe('StatusBanner', () => {
  it.each(['pending_approval', 'rejected', 'deactivated'] as const)(
    'draws %s the same on every surface and only changes the words',
    (reason) => {
      renderWithProviders(
        <>
          <StatusBanner surface="onboarding" reason={reason} />
          <StatusBanner surface="insurance" reason={reason} />
          <StatusBanner surface="lessons" reason={reason} />
          <StatusBanner surface="profile" reason={reason} />
        </>,
      );
      const banners = screen.getAllByRole('status');
      expect(banners).toHaveLength(4);
      for (const banner of banners) {
        expect(look(banner)).toEqual(look(banners[0]!));
      }
      expect(new Set(banners.map((b) => b.textContent)).size).toBe(4);
    },
  );

  it('draws onboarding_incomplete the same on insurance and lessons', () => {
    renderWithProviders(
      <>
        <StatusBanner surface="insurance" reason="onboarding_incomplete" />
        <StatusBanner surface="lessons" reason="onboarding_incomplete" />
      </>,
    );
    const [insurance, lessons] = screen.getAllByRole('status') as [
      HTMLElement,
      HTMLElement,
    ];
    expect(look(insurance)).toEqual(look(lessons));
    expect(insurance).toHaveTextContent(
      'Finish onboarding to register private lessons',
    );
    expect(lessons).toHaveTextContent(
      'Finish onboarding to see your lessons and pay',
    );
  });

  it('gives every reason its own colour and icon', () => {
    renderWithProviders(
      <>
        <StatusBanner surface="profile" reason="pending_approval" />
        <StatusBanner surface="profile" reason="rejected" />
        <StatusBanner surface="profile" reason="deactivated" />
        <StatusBanner surface="lessons" reason="onboarding_incomplete" />
      </>,
    );
    const looks = screen.getAllByRole('status').map(look);
    expect(new Set(looks.map((l) => l.tone)).size).toBe(4);
    expect(new Set(looks.map((l) => l.icon)).size).toBe(4);
  });
});
