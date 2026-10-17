import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['card', 'pop'] }],
      ease: [{ ease: ['brand'] }],
    },
  },
});

/** className combiner: a later conflicting Tailwind class wins over an earlier one. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts);
}
