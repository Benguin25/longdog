// Hand-written index for the tutorial levels. NOT touched by
// scripts/generator.ts: that script only clears/regenerates *.json files
// directly inside src/game/levels/, never this subfolder, and its own
// index.ts import list is separate from LEVELS.

import type { TutorialLevel } from '../../tutorial';
import tut01 from './tut01.json';
import tut02 from './tut02.json';
import tut03 from './tut03.json';
import tut04 from './tut04.json';
import tut05 from './tut05.json';

export const TUTORIAL_LEVELS: readonly TutorialLevel[] = [
  {
    ...tut01,
    script: [
      {
        say: 'This is your dachshund. Swipe LEFT on the board, or tap ◀, to take a step.',
        allow: ['left'],
        until: 'moved',
        highlight: 'head',
      },
      {
        say: 'A bone! Eating it makes you one segment longer. Keep going left.',
        allow: ['left'],
        until: 'ate',
        highlight: 'snacks',
      },
      {
        say: 'Longer! And with every bone eaten, the dog door lights up. Walk your HEAD into the open door.',
        until: 'dogExited',
        highlight: 'exit',
      },
    ],
  },
  {
    ...tut02,
    script: [
      {
        say: 'Swipe RIGHT twice to walk off the ledge.',
        allow: ['right'],
        until: 'fell',
      },
      {
        say: 'Nothing underneath = you fall. Gravity acts after every move, but landing on solid ground is safe.',
        until: 'continue',
      },
      {
        say: "Those garden rakes hurt. Walk RIGHT until you bump into them. Go on, it's fine.",
        allow: ['right'],
        until: 'dead',
        highlight: 'spikes',
      },
      {
        say: 'Yelp! But look — the move was undone. Dying just rewinds your last move. You can also press Undo any time.',
        until: 'continue',
      },
      {
        say: 'Now grab the bone above you and head for the door.',
        until: 'dogExited',
        highlight: 'snacks',
      },
    ],
  },
  {
    ...tut03,
    script: [
      {
        say: 'The door is across that pit. Swipe RIGHT to try to cross.',
        allow: ['right'],
        until: 'dead',
        highlight: 'exit',
      },
      {
        say: 'Too short! Only one segment is on the ledge, so there is nothing to stand on. Press UNDO to step back.',
        allow: ['undo'],
        until: 'undo',
      },
      {
        say: 'A longer dog reaches further. Turn around (go UP, then LEFT) and eat both bones.',
        until: 'exitOpened',
        highlight: 'snacks',
      },
      {
        say: 'Four segments long! Now bridge the pit: your body stays on the ledge while your head crosses.',
        until: 'dogExited',
        highlight: 'exit',
      },
    ],
  },
  {
    ...tut04,
    script: [
      {
        say: 'Rakes ahead and no bones to grow with. Time for the signature move: swipe RIGHT onto the purple paw mat.',
        allow: ['right'],
        until: 'froze',
        highlight: 'freeze',
      },
      {
        say: 'You PLAYED DEAD. The dog turned to stone in exactly that shape, and statues are solid ground forever. A fresh dog just popped out of the dog house!',
        until: 'continue',
        highlight: 'doghouse',
      },
      {
        say: 'Walk the new dog across the statue bridge to the door.',
        until: 'dogExited',
        highlight: 'exit',
      },
    ],
  },
  {
    ...tut05,
    script: [
      {
        say: 'Two dogs! The bright one is yours right now. TAP the board (or press Swap) to switch to the other dog.',
        allow: ['swap'],
        until: 'moved',
        highlight: 'otherDog',
      },
      {
        say: 'Now this dog is awake. Walk LEFT and eat the bone.',
        allow: ['left'],
        until: 'ate',
        highlight: 'snacks',
      },
      {
        say: "Door's open, and BOTH dogs must get in. Keep going with this one.",
        until: 'dogExited',
        highlight: 'exit',
      },
      {
        say: 'One down! Control jumps to the last dog. Bring it home too.',
        until: 'dogExited',
        highlight: 'exit',
      },
    ],
  },
];

export function tutorialLevelByIndex(n: number): TutorialLevel | undefined {
  return TUTORIAL_LEVELS[n - 1];
}
