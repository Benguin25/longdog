// Star scoring vs par (SPEC: 3 for optimal, 2 within par+3, 1 for clearing).

import { STARS_PAR_WINDOW } from './config';

export function starsForClear(moveCount: number, par: number | undefined): 1 | 2 | 3 {
  if (par === undefined) return 1;
  if (moveCount <= par) return 3;
  if (moveCount <= par + STARS_PAR_WINDOW) return 2;
  return 1;
}
