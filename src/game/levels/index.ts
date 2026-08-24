import type { LevelData } from '../rules';

import level01 from './level01.json';
import level02 from './level02.json';
import level03 from './level03.json';
import level04 from './level04.json';
import level05 from './level05.json';
import level06 from './level06.json';

export const LEVELS: readonly LevelData[] = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
];

export function levelById(id: string): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
