import { expect } from 'vitest';
import { maskReplayAttribute, PRIVATE_TEXT_SELECTOR } from '@/lib/analytics';

export function expectMaskedInReplay(element: Element | null | undefined) {
  expect(element?.closest(PRIVATE_TEXT_SELECTOR) ?? null).not.toBeNull();
}

export function expectAttributeMaskedInReplay(element: Element, name: string) {
  expect(
    maskReplayAttribute(name, element.getAttribute(name) ?? '', element),
  ).toBe('***');
}
