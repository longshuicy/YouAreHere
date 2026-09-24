# Source: The Lord of the Rings character networks

Structured paragraph co-occurrence — no novel text. Two people are tied when
they are named in the same paragraph. Places, groups, and the Ring are dropped;
riding-animals and Shelob (ontology `subtype=animal`) are dropped too.

| Part | Source | Terms |
|---|---|---|
| Edge lists + ontology | [José Calvo Tello, morethanbooks/LotR](https://github.com/morethanbooks/projects/tree/master/LotR) | [CC BY](https://creativecommons.org/licenses/by/4.0/) (README: "CC-BY") |
| Alias table | Same repo, `ontologies/pre-ontology.csv` (`Mithrandir` → Gandalf, …) | Same |
| Reveal attributes | [Wikidata](https://www.wikidata.org/) (occupation, titles, affiliations, place) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Segments are the three volumes. The TEI structure files in the upstream repo
contain no prose (deliberately — Tolkien’s text is still in copyright).

## Retrieving the raw files

```sh
cd pipeline/raw/lotr
BASE="https://raw.githubusercontent.com/morethanbooks/projects/master/LotR"
curl -fsSL -o ontology.csv "$BASE/ontologies/ontology.csv"
curl -fsSL -o pre-ontology.csv "$BASE/ontologies/pre-ontology.csv"
curl -fsSL -o networks-id-volume1.csv "$BASE/tables/networks-id-volume1.csv"
curl -fsSL -o networks-id-volume2.csv "$BASE/tables/networks-id-volume2.csv"
curl -fsSL -o networks-id-volume3.csv "$BASE/tables/networks-id-volume3.csv"
```

The adapter fetches these on first build if they are missing.
