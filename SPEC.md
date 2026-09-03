# Long Dog — Design Spec

## Concept
A dachshund on a 2D grid moves one tile at a time (4 directions). Eating a snack makes it
one segment longer. Only the head eats: by moving onto a snack, or by falling onto one
(a falling head with a snack directly beneath it eats it and the fall continues; the body
passes over snacks without eating them). Gravity applies: after each move the dog falls
unless any segment is resting on a wall, a statue, or another dog. The exit (a glowing dog door) opens once all
snacks on the level are eaten; getting the head into the open exit clears the dog.
Falling off the bottom of the level or landing on spikes is death (auto-undo with feedback).
The dog's own body is a platform and an obstacle: length is both your resource and your
problem. That tension IS the game.

## Theme
Cartoon dachshund: long brown body segments, floppy ears + snout on the head segment,
stubby legs on the bottom of grounded segments, tail on the last segment. Snacks are bones
and sausages. Levels are a backyard/garden world: dirt and grass block tiles, garden
gnome decorations, blue sky background. Exit is a dog door with light behind it. Spikes
are garden rakes/cacti (cartoony, not gory). Death is a yelp + puff of dust, instant undo.
Tone: bright, saturated, thick dark outlines, big expressive eyes (Gate Runner art lessons apply).

## Mechanics ladder (introduction level in parens)
1. Move + gravity + grow + exit (L1)
2. Spikes: lethal tile, touching any segment = death (L5)
3. Longer = reach: levels requiring standing tall / bridging (L8)
4. FREEZE — signature (L12): stepping the head on a "play dead" tile petrifies the whole
   dog into a stone statue (segments become permanent terrain, keeping their exact shape).
   A new dachshund (base length 3) immediately spawns at the DOG HOUSE, which is a visible
   tile on the board from the start of the level. The shape you freeze in is the puzzle.
   Statue dogs do not need to exit; the current live dog does.
5. Freeze planning: levels requiring a specific frozen shape (staircase, bridge, spike cap) (L15+)
6. Snack rationing: levels where the first dog must LEAVE snacks for the next dog (L20+)
7. TWO LIVE DOGS (L35): tap to swap control; both must reach the exit; they support and
   block each other. Combined freeze + two-dog levels from L50+.
8. Multiple freeze tiles / chained dogs (L60+).

## Solver + level pipeline (this is the moat)
- /scripts/solver.ts: BFS over full game state (dog bodies, snacks left, statues, whose
  turn). State hashing for dedupe. Outputs: solvable?, optimal move count, number of
  distinct solutions under optimal+2.
- /scripts/generator.ts: generates candidate levels from templates + mutation, then filters:
  - solvable, optimal solution length within band for target difficulty
  - REJECT any freeze level solvable with zero freezes (freeze must be load-bearing)
  - REJECT any two-dog level where one dog can idle the whole game
  - REJECT levels where greedy nearest-snack play succeeds (no thinking required)
  - Prefer levels with exactly 1-2 distinct solutions (feels authored, not sloppy)
- Output top candidates as JSON; I curate the final 100 by playing them. Difficulty curve:
  optimal move count and mechanic mix ramp across the 100.

## Progression & retention
- 100 levels in packs of 20 (Backyard, Garden, Rooftop, Park at Night, Snow) — palette swap
  per pack, same tiles.
- Stars: 3 for optimal moves (solver gives par), 2 within par+3, 1 for clearing.
- Undo unlimited, move counter visible. Hint system: reveals next 3 moves of the optimal
  solution (later: rewarded ad; for now a free button behind config flag).
- Persistence: furthest level, stars per level, settings via AsyncStorage.

## Screens
Home (play, level select, settings) · Level select (pack grid with stars) · Game ·
Level clear (stars, next) · Settings (sound/haptics toggles).

## Juice
Snap-to-tile movement tween (80ms), squash on landing after a fall, munch animation +
crunch sound on snacks, ear-flap on movement, tail wag when idle at open exit, statue
transition (grey wash + stone crack sfx), dog house door opens when new dog spawns,
yelp + dust puff + fast rewind visual on death-undo, confetti + happy bark on clear.
All sounds synthesized to .wav via a script, committed, under 500KB total. Haptics on
munch, freeze, death, clear.

## Out of scope for v1
Monetization, iOS, level editor UI, timed modes, cosmetics. Sticky/wall-crawl mechanic
is explicitly cut (fights gravity-based design).