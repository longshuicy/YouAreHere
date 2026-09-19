# Source: Friends scene co-occurrence

Per-episode edge lists — no script parsing here. Two characters are tied when
they speak in the same scene; the weight is the number of shared scenes.

| Part | Source | Terms |
|---|---|---|
| Edge lists | Michelle Edwards, [Friends edge lists](https://doi.org/10.25909/5c05c2ed862ec) (University of Adelaide Figshare) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Segments are the ten seasons. Self-loops and generic role labels (waitress,
customer, …) are dropped.

## Retrieving the raw files

The adapter fetches all `edges_ssee.csv` files from Figshare article `7413593`
on first build. To fetch by hand:

```sh
cd pipeline/raw/friends
# list + download via the Figshare API (see pipeline/ingest/friends.py)
```
