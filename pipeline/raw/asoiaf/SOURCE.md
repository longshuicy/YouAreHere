# Source: A Song of Ice and Fire character interaction networks

## Credit

"Character Interaction Networks for A Song of Ice and Fire" by **Andrew Beveridge and Jie Shan**,
<https://github.com/mathbeveridge/asoiaf>, licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Modified for this project.

Accompanying work: <https://networkofthrones.wordpress.com>

Cite as:

> A. Beveridge and J. Shan, "Network of Thrones", *Math Horizons* 23(4), 2016, pp. 18–22.
> DOI: [10.4169/mathhorizons.23.4.18](https://doi.org/10.4169/mathhorizons.23.4.18)

## Licence terms that affect this project

The upstream repository has no `LICENSE` file; the terms are stated in its `README.md`,
which is the authoritative record and is quoted here:

> This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0
> International License.

Three consequences, in order of how easy they are to breach by accident:

1. **ShareAlike.** The graphs in `/data` are an adaptation of this dataset, so they must be
   distributed under CC BY-NC-SA 4.0 as well. `/data/LICENSE` records this. It is separate from
   whatever licence the application code carries.
2. **NonCommercial.** The game may not be used commercially while it ships this dataset — no
   sale, no ads, no paid tier. Replacing or removing the ASOIAF universe is what lifts this.
3. **Attribution.** Credit, a link to the licence, and a statement that changes were made must
   travel with the data. This is handled in the pipeline rather than by hand: see
   `pipeline/ingest/asoiaf.py`, which records it in `Provenance`, and `pipeline/emit/writer.py`,
   which refuses to write a universe whose attribution is incomplete.

## What we changed

Recorded in `Attribution.modifications` and emitted into every universe file. Currently:
merging the five per-book edge lists into one weighted graph, recording which books each tie
appears in, deriving display names from the hyphenated identifiers, filtering weak edges and
low-degree nodes, adding per-endpoint normalised weight ranks, and computing a layout.

## Retrieving the raw files

Retrieved 2026-09-17. The five per-book edge lists are the only files used:

```sh
cd pipeline/raw/asoiaf
for b in 1 2 3 4 5; do
  curl -sSfL -O "https://raw.githubusercontent.com/mathbeveridge/asoiaf/master/data/asoiaf-book$b-edges.csv"
done
```

`asoiaf-book45-edges.csv` in the upstream repository combines books 4 and 5 and would double-count
those ties, so it is deliberately not fetched. The `*-nodes.csv` files carry only an `Id`/`Label`
pair already recoverable from the edge lists.

Columns: `Source,Target,Type,weight,book`. Weight is the number of qualifying co-occurrences.
