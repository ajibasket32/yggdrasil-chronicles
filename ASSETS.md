# Asset Catalog

Runtime downloads are forbidden. Every committed asset must have a verified license, source URL, author, checksum, local path, and modification note before use.

| Purpose | Source | Author | License | Local path | SHA-256 | Modification |
| --- | --- | --- | --- | --- | --- | --- |
| Overworld tiles | https://opengameart.org/content/16x16-puny-world-tileset | Shade | CC0 | `public/assets/vendor/punyworld-overworld.png` | `14d285bde8dee96cb0113947c8cce4922b86bf1d033b19123112145c7cef3a38` | Integer upscale only |
| Character sprites | https://opengameart.org/content/puny-characters | Shade | CC0 | `public/assets/vendor/puny-characters/` | Archive: `971d7b07eea18fb2cce475cd6554a176ebf783bb064dec5a637ba33c7829320e` | Unmodified sprite sheets |
| Dungeon tiles | https://opengameart.org/node/168207 | Efilheim | CC0 | `public/assets/vendor/everrogue-tileset.png` | `3f0f2d9bf14bcff886af3bc7e50abc13fa1d9417f8fc9d667950a6cab367c007` | Select compatible tiles only |
| RPG sound effects | https://kenney.nl/assets/rpg-audio | Kenney | CC0 | `public/assets/vendor/kenney-rpg-audio/Audio/` | Archive: `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b` | Unmodified OGG files |

Music, portraits, battle sprites, UI, and VFX remain blocked until a CC0/public-domain source is verified. Do not use search-preview images or files whose license applies ambiguously.

## Verified license evidence

- `puny-characters`: the original [Puny Characters source listing](https://opengameart.org/content/puny-characters) identifies Shade's pack as CC0. The committed `puny-characters.zip` checksum above is the archive used to populate the extracted directory.
- `kenney-rpg-audio`: the extracted pack includes [`License.txt`](public/assets/vendor/kenney-rpg-audio/License.txt), which identifies the CC0 1.0 dedication. The committed `kenney-rpg-audio.zip` checksum above is the archive used to populate the extracted directory.

Run `npm run audit:assets` before release. It verifies the catalog, direct-file and archive checksums, non-empty extracted directories, local or documented license evidence, all referenced runtime asset paths, and the absence of external runtime asset URLs in browser entrypoints. The audit is intentionally offline and does not re-download or re-verify publisher web pages.
