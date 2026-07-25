# Visual asset selection

The game keeps its lightweight original procedural fighters and gameplay geometry so collision, silhouettes, and animation remain deterministic. The art direction was shifted from a dark sci-fi void to a bright floating-sky arena with pastel platform colors, warm sunlight, soft clouds, restrained bloom-like emissive accents, and clearer hazards.

Three small decorative models were selected from Kenney's [Nature Kit](https://kenney.nl/assets/nature-kit), licensed CC0 1.0:

| Shipped file             | Original                | Use                                              |
| ------------------------ | ----------------------- | ------------------------------------------------ |
| `tree-small.glb`         | `tree_small.glb`        | Silhouette and color on distant floating islands |
| `flower-coral.glb`       | `flower_coral.glb`      | Small whimsical accent on distant islands        |
| `island-cliff-block.glb` | `cliff_block_stone.glb` | Repeated distant floating-island foundation      |

They are decorative only, loaded as low-poly GLB assets, and have no gameplay collision. The included `LICENSE.txt` is the original Kenney CC0 license record. This deliberately avoids mixing in unrelated character packs: the existing two fighters remain visually cohesive with each other, now with one corrected model-forward convention and more readable motion.
