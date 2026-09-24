# Source: American Civil War battle commanders

Structured battle–commander data — no text parsing. Two people are tied when
they served as principal commanders at the same battle, on either side.

| Part | Source | Terms |
|---|---|---|
| Commander table | [jrnold/acw_battle_data](https://github.com/jrnold/acw_battle_data) `nps_commanders.csv` (Jeffrey B. Arnold; National Park Service CWSS) | [ODC-By 1.0](https://opendatacommons.org/licenses/by/1-0/) for the compilation; underlying NPS records are U.S. government works |
| Battle dates | Same repo, `cwsac_battles.csv` (CWSAC / NPS) | Same |

Segments are calendar years (1861–1865). A commander who appears under several
ranks across the war keeps the highest one for enrichment. Native American
commanders are kept as a third affiliation.

Canonical download of the compiled release: [Figshare](https://doi.org/10.6084/m9.figshare.1515995).
The files under this directory are taken from the GitHub `build/` tree of the
same release.

## Retrieving the raw files

```sh
cd pipeline/raw/civilwar
curl -fsSL -o nps_commanders.csv \
  "https://raw.githubusercontent.com/jrnold/acw_battle_data/master/build/acw_battle_data/nps_commanders.csv"
curl -fsSL -o cwsac_battles.csv \
  "https://raw.githubusercontent.com/jrnold/acw_battle_data/master/build/acw_battle_data/cwsac_battles.csv"
```
