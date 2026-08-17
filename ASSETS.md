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

Every asset above is CC0, and every code dependency that reaches the shipped
bundle is permissive. Nothing in a build carries a copyleft obligation.

This section exists because that was briefly not true. `grapify` (GPL-3.0) was
installed at the owner's explicit instruction, and because it was statically
imported it was compiled into the shipped JavaScript — which would have obliged
any distribution of the game to be licensed GPL-3.0 in its entirety and to offer
its source to every recipient. The release audit caught it: the game declared no
licence at all, so a public release would have handed players GPL-covered code
with no grant to use it.

It was removed once the consequence was put plainly to the owner, who chose to
keep the game their own. `grapify` provided nothing a player could see — it is a
chart library, and the game never drew a chart — so removing it changed no
behaviour. Verified after removal: `grep -rl grapify dist/` matches nothing in
the JavaScript, and the four `console.log` lines the package contributed to
every player's console are gone with it.

The rule worth keeping: a copyleft dependency that reaches the browser bundle
sets the licence of the whole game. `tools/audit-release.ts` checks asset
licences but not code ones, so this is currently a human check.

## Verified license evidence

- `puny-characters`: the original [Puny Characters source listing](https://opengameart.org/content/puny-characters) identifies Shade's pack as CC0. The committed `puny-characters.zip` checksum above is the archive used to populate the extracted directory.
- `music/*`: each OpenGameArt page above states the CC0 dedication in its licence field (verified 2026-08-06). cynicmusic and RandomMind request only optional courtesy credit; the credits screen names all three composers.
- `kenney-rpg-audio`: the extracted pack includes [`License.txt`](public/assets/vendor/kenney-rpg-audio/License.txt), which identifies the CC0 1.0 dedication. The committed `kenney-rpg-audio.zip` checksum above is the archive used to populate the extracted directory.
- `monster-pack-2d`: the publisher page identifies isaiah658's 56-monster pack as CC0, and the extracted [`License.txt`](public/assets/vendor/monster-pack-2d/License.txt) repeats that dedication. The committed `monster-pack-2d.zip` checksum above is the archive used to select the eleven runtime sprites.

Run `npm run audit:assets` before release. It verifies the catalog, direct-file and archive checksums, non-empty extracted directories, local or documented license evidence, all referenced runtime asset paths, and the absence of external runtime asset URLs in browser entrypoints. The audit is intentionally offline and does not re-download or re-verify publisher web pages.
