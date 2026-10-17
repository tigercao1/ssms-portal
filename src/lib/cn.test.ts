import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy classes and drops falsy', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });

  it('lets a later conflicting class win', () => {
    expect(cn('rounded-lg p-6 shadow-card', 'p-3')).toBe(
      'rounded-lg shadow-card p-3',
    );
    expect(cn('px-4 py-3', 'p-2')).toBe('p-2');
    expect(cn('p-6', 'px-3')).toBe('p-6 px-3');
    expect(cn('h-11 w-full', 'w-auto')).toBe('h-11 w-auto');
    expect(cn('flex', 'hidden')).toBe('hidden');
  });

  it('keeps classes under different variants apart', () => {
    expect(cn('p-0 sm:p-6', 'p-3')).toBe('sm:p-6 p-3');
    expect(cn('hover:bg-navy-tint', 'bg-surface')).toBe(
      'hover:bg-navy-tint bg-surface',
    );
  });

  it('classifies theme colors as colors, not sizes', () => {
    expect(cn('text-sm text-ink', 'text-slate')).toBe('text-sm text-slate');
    expect(cn('text-ink', 'text-xs')).toBe('text-ink text-xs');
    expect(cn('bg-surface', 'bg-navy')).toBe('bg-navy');
    expect(cn('border-grey', 'border-status-rejected')).toBe(
      'border-status-rejected',
    );
    expect(cn('border border-grey', 'border-2')).toBe('border-grey border-2');
    expect(cn('text-red', 'text-red-press')).toBe('text-red-press');
    expect(cn('bg-grey/60', 'bg-red-tint')).toBe('bg-red-tint');
  });

  it('classifies theme font families apart from font weights', () => {
    expect(cn('font-body font-medium', 'font-display')).toBe(
      'font-medium font-display',
    );
    expect(cn('font-mono', 'font-cjk')).toBe('font-cjk');
    expect(cn('font-semibold', 'font-mono')).toBe('font-semibold font-mono');
  });

  it('treats theme radii as border radius', () => {
    expect(cn('rounded-lg', 'rounded-md')).toBe('rounded-md');
    expect(cn('rounded-sm', 'rounded-full')).toBe('rounded-full');
    expect(cn('rounded-t-lg sm:rounded-lg', 'rounded-none')).toBe(
      'sm:rounded-lg rounded-none',
    );
  });

  it('treats theme shadows as box shadow, not shadow color', () => {
    expect(cn('shadow-card', 'shadow-pop')).toBe('shadow-pop');
    expect(cn('shadow-card', 'shadow-none')).toBe('shadow-none');
    expect(cn('shadow', 'shadow-card')).toBe('shadow-card');
    expect(cn('shadow-card', 'shadow-navy')).toBe('shadow-card shadow-navy');
  });

  it('treats the brand easing as a timing function', () => {
    expect(cn('ease-brand', 'ease-linear')).toBe('ease-linear');
    expect(cn('ease-in', 'ease-brand')).toBe('ease-brand');
  });

  it('leaves custom utilities alone', () => {
    expect(cn('fade-rise', 'sr-only')).toBe('fade-rise sr-only');
  });
});
