# Audio selection

All shipped audio is stored in `apps/client/public/assets/audio` and is usable offline after the game has loaded. Selection was made on 2026-07-25 from source pages that explicitly identify the works as CC0.

## Music

| Use   | File                                               | Source                                                                                           | License | Why it fits                                         |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------- |
| Menu  | `music/menu-upbeat.ogg`                            | [Upbeat Title Theme Loop by beardalaxy](https://opengameart.org/content/upbeat-title-theme-loop) | CC0     | Short, bright title loop without vocals             |
| Match | `music/arena-plains.ogg`, `music/arena-plains.mp3` | [Plains Stage by MintoDog](https://opengameart.org/content/plains-stage)                         | CC0     | Positive 125 BPM action loop; OGG and MP3 fallbacks |

## Effects

The effects are selected and renamed excerpts from Kenney's [Impact Sounds](https://www.kenney.nl/assets/impact-sounds) and [Interface Sounds](https://kenney.nl/assets/interface-sounds), both released under CC0. The original filename mapping is preserved below.

| Game file                                     | Original file / role                                          |
| --------------------------------------------- | ------------------------------------------------------------- |
| `punch-whoosh.ogg`                            | `impactSoft_medium_000.ogg` — punch movement                  |
| `hit-heavy-1.ogg`, `hit-heavy-2.ogg`          | `impactPunch_heavy_001/002.ogg` — randomized hit confirmation |
| `meteor-impact.ogg`                           | `impactMetal_heavy_001.ogg`                                   |
| `ring-collapse.ogg`                           | `impactPlate_heavy_002.ogg`                                   |
| `footstep-1/2/3.ogg`                          | `footstep_concrete_000/002/004.ogg`                           |
| `jump.ogg`                                    | `confirmation_001.ogg`                                        |
| `dodge.ogg`                                   | `scratch_003.ogg`                                             |
| `countdown.ogg`, `go.ogg`                     | `tick_001.ogg`, `confirmation_004.ogg`                        |
| `bouncer.ogg`, `victory.ogg`, `ui-select.ogg` | `pluck_001.ogg`, `bong_001.ogg`, `select_001.ogg`             |

The mixer uses separate master, music, ambience, and effects gain buses. Match music sits deliberately below effects, positional gameplay sounds attenuate with distance and pan gently, and footstep samples vary to avoid repetition. The previous oscillator-only placeholder implementation was removed.
