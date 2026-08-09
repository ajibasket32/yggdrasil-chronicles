# Asset Catalog

Runtime downloads are forbidden. Every committed asset must have a verified license, source URL, author, checksum, local path, and modification note before use.

| Purpose | Source | Author | License | Local path | SHA-256 | Modification |
| --- | --- | --- | --- | --- | --- | --- |
| Overworld tiles | https://opengameart.org/content/16x16-puny-world-tileset | Shade | CC0 | `public/assets/vendor/punyworld-overworld.png` | `14d285bde8dee96cb0113947c8cce4922b86bf1d033b19123112145c7cef3a38` | Integer upscale only |
| Character sprites | https://opengameart.org/content/puny-characters | Shade | CC0 | `public/assets/vendor/puny-characters/` | Archive: `971d7b07eea18fb2cce475cd6554a176ebf783bb064dec5a637ba33c7829320e` | Unmodified sprite sheets |
| Dungeon tiles | https://opengameart.org/node/168207 | Efilheim | CC0 | `public/assets/vendor/everrogue-tileset.png` | `3f0f2d9bf14bcff886af3bc7e50abc13fa1d9417f8fc9d667950a6cab367c007` | Select compatible tiles only |
| Speaker portraits | https://opengameart.org/content/everface | Efilheim | CC0 | `public/assets/vendor/everface.png` | `f27312fcc58d8bbdf76a489932a2bddc9933f5746001e620ec4411ad2ac9eece` | Unmodified PNG |
| RPG sound effects | https://kenney.nl/assets/rpg-audio | Kenney | CC0 | `public/assets/vendor/kenney-rpg-audio/Audio/` | Archive: `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b` | Unmodified OGG files |
| Enemy sprites | https://opengameart.org/content/50-monsters-pack-2d | isaiah658 | CC0 | `public/assets/vendor/monster-pack-2d/` | Archive: `e8d5be4b415095623a828f784a1ef83825ea1cb8fe1f94c7dba4c6016955fea3` | Selected front-facing PNGs renamed only; pixels unmodified |
| Town music | https://opengameart.org/content/town-theme-rpg | cynicmusic | CC0 | `public/assets/vendor/music/TownTheme.mp3` | `2657861d5107d4a3c01ef81cb6a4d61ddd5e7a054b6da57e658373d79d0c3466` | Unmodified MP3 |
| Battle music | https://opengameart.org/content/battle-theme-a | cynicmusic | CC0 | `public/assets/vendor/music/battleThemeA.mp3` | `6042399782e581d753d616bc703e66483d5eccb5fb687a20c9a552d68c49e620` | Unmodified MP3 |
| Dungeon music | https://opengameart.org/content/crystal-cave-song18 | cynicmusic | CC0 | `public/assets/vendor/music/song18_0.mp3` | `42349d7c615fe947866100a90289d61a1e64620e11f2d041b37166eaaa4e5840` | Unmodified MP3 |
| Title/credits music | https://opengameart.org/content/the-field-of-dreams | pauliuw | CC0 | `public/assets/vendor/music/the_field_of_dreams.mp3` | `103a7032a49be7e8399c5cb771f7759eac9ac1a0d2bf227f41fff42ad8d78194` | Unmodified MP3 |
| Road music | https://opengameart.org/content/medieval-the-old-tower-inn | RandomMind | CC0 | `public/assets/vendor/music/The_Old_Tower_Inn.mp3` | `3fe4070015b880b591c79a7fca31156a0083a8768d88a39da39ab6c54f2f014d` | Unmodified MP3 |

Additional UI and VFX remain blocked until a CC0/public-domain source is verified. Do not use search-preview images or files whose license applies ambiguously.

## Code dependency licences

Every asset above is CC0. One **code** dependency is not, and it is recorded
here because the consequence is easy to discover far too late.

| Package | Version | Licence | Bundled into the shipped game? |
| --- | --- | --- | --- |
| `grapify` | 1.0.7 | **GPL-3.0** | Yes — imported from `src/grapify-boot.ts` |

Installed at the owner's explicit instruction, after the licence, the
chart-library purpose and the self-referential manifest were all raised. What
that means in practice, stated plainly:

- GPL-3.0 is a copyleft licence. Because grapify's code is bundled into the
  JavaScript this game ships, **distributing that build carries GPL-3.0
  obligations for the whole game** — including publishing its source under
  GPL-3.0 to anyone who receives it.
- Nothing conflicts *today*: this project declares no licence of its own, and
  nothing has been distributed. The obligation attaches the moment a build is
  handed to anyone else.
- It is fully reversible. `npm uninstall grapify` plus deleting
  `src/grapify-boot.ts`, `src/types/grapify.d.ts` and the two lines that call
  it in `src/main.ts` removes the obligation entirely. Nothing a player can see
  depends on it.

## Verified license evidence

- `puny-characters`: the original [Puny Characters source listing](https://opengameart.org/content/puny-characters) identifies Shade's pack as CC0. The committed `puny-characters.zip` checksum above is the archive used to populate the extracted directory.
- `music/*`: each OpenGameArt page above states the CC0 dedication in its licence field (verified 2026-08-06). cynicmusic and RandomMind request only optional courtesy credit; the credits screen names all three composers.
- `kenney-rpg-audio`: the extracted pack includes [`License.txt`](public/assets/vendor/kenney-rpg-audio/License.txt), which identifies the CC0 1.0 dedication. The committed `kenney-rpg-audio.zip` checksum above is the archive used to populate the extracted directory.
- `monster-pack-2d`: the publisher page identifies isaiah658's 56-monster pack as CC0, and the extracted [`License.txt`](public/assets/vendor/monster-pack-2d/License.txt) repeats that dedication. The committed `monster-pack-2d.zip` checksum above is the archive used to select the eleven runtime sprites.

Run `npm run audit:assets` before release. It verifies the catalog, direct-file and archive checksums, non-empty extracted directories, local or documented license evidence, all referenced runtime asset paths, and the absence of external runtime asset URLs in browser entrypoints. The audit is intentionally offline and does not re-download or re-verify publisher web pages.
