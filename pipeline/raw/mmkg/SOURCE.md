# Source: Musical Meetups Knowledge Graph (MMKG)

Historical musical encounter networks from the Polifonia MEETUPS pilot. Two
people are tied when a biography meetup lists them both as participants.
Confidence below 0.95, places, and other NER false persons are dropped; the
giant component (degree ≥ 2) is kept. Segments are decades between 1750 and
1950.

| Part | Source | Terms |
|---|---|---|
| Meetup TTLs + biography list | [polifonia-project/meetups-knowledge-graph](https://github.com/polifonia-project/meetups-knowledge-graph) (Zenodo [10.5281/zenodo.7924618](https://doi.org/10.5281/zenodo.7924618)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Reveal attributes + wiki links | [Wikidata](https://www.wikidata.org/) via DBpedia→enwiki pageprops | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Coverage note

Only `data/sample_1k_meetups_triples/` (~1 000 biography TTLs) includes
`mtp:hasParticipant` co-casts. The bulk `data/meetups_triples/` files in the
same repo are subject/time stubs without participants, so they are not used.

## Retrieving the raw files

The adapter downloads the biography CSV and sample TTLs from GitHub on first
load if `pipeline/raw/mmkg/sample_1k_meetups_triples/` is empty.

```sh
cd pipeline/raw/mmkg
curl -fsSL -o list-of-biographies.csv \
  "https://raw.githubusercontent.com/polifonia-project/meetups-knowledge-graph/main/data/list-of-biographies.csv"
# Or sparse-clone the sample directory from the same repo.
```
