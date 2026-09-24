# Source: Moviegalaxies film character networks

Dialogue-interaction networks derived from film scripts. Two people are tied
when they share dialogue in the same film. Generic extras (`MAN`, `DRIVER`,
`AGENT #1`, …) are dropped. Franchise worlds merge films by normalised
character label and keep each film as a segment.

| Part | Source | Terms |
|---|---|---|
| Per-film GEXF networks | [Moviegalaxies on Harvard Dataverse](https://doi.org/10.7910/DVN/T4HBA3) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Reveal attributes | [Wikidata](https://www.wikidata.org/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Worlds shipped from this source

| World | Films (GexfID) | Notes |
|---|---|---|
| `godfather` | The Godfather (355), Part II (356) | `THE GODFATHER` merged into Don Corleone |
| `indiana-jones` | Temple of Doom (429), Last Crusade (427) | See exclusions below |

## Exclusions

Moviegalaxies catalogue rows for **Raiders of the Lost Ark** (430) and
**Indiana Jones and the Kingdom of the Crystal Skull** (472) exist, but the
GEXF casts do not match those films (unrelated character lists). They are not
ingested.

## Retrieving the raw files

```sh
cd pipeline/raw/moviegalaxies
curl -fsSL -o gexf.zip \
  "https://dataverse.harvard.edu/api/access/datafile/3193574"
mkdir -p gexf
unzip -j gexf.zip \
  gexf/355.gexf gexf/356.gexf gexf/427.gexf gexf/429.gexf \
  -d gexf
```

The adapter fetches the zip and extracts the needed GEXF files on first build
if they are missing.
