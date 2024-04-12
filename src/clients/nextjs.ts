import type { NextServer } from 'next/dist/server/next';
import OpenAPM from '../OpenAPM';
import { wrap } from '../shimmer';

export const instrumentNextjs = (
  current: { next: NextServer },
  openapm: OpenAPM
) => {};
