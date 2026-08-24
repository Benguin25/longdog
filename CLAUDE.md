# Long Dog

Grid-based gravity puzzle (Snakebird-family). Full design in SPEC.md — read it before any task.

## Current phase
Android-first, testing in Expo Go on a physical Samsung. No iOS, no ads, no IAP, no
native-only modules. Do NOT install react-native-mmkv, google-mobile-ads,
react-native-purchases, sentry, or posthog until I say so. AsyncStorage for persistence.

## Stack
Expo SDK latest stable, TypeScript strict, Expo Router, @shopify/react-native-skia,
react-native-reanimated, zustand, expo-haptics, expo-av.

## Rules
- Game state is a pure, immutable data structure (grid + dog bodies + snacks + statues).
  All rules live in pure functions in /src/game/rules.ts: move(state, dir) -> state | blocked | dead.
  The renderer and the solver both consume ONLY these functions. Never duplicate rule
  logic anywhere.
- Turn-based: no game loop needed for logic. Animations are presentational only and must
  never affect state.
- Gravity: after every move, a dog falls unless any segment has a wall, statue, or another
  dog directly beneath it. Falling below the grid = death (undo to pre-move state).
- The solver in /scripts/solver.ts imports rules.ts directly. It must always work headless
  via node/tsx.
- All tunables in /src/game/config.ts. Levels are JSON in /src/game/levels/.
- Run `npx tsc --noEmit` before finishing any task. Zero errors.
- New deps via `npx expo install`, never npm install. Run npx expo-doctor after.
- Don't add features not in the current milestone. Ask first.

## Folder layout
/app routes · /src/game rules+levels · /src/render Skia · /src/store zustand · /src/ui · /scripts solver+generator