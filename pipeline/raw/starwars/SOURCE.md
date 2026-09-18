# Source: Star Wars social network

## Credit

"Star Wars social network" by **Evelina Gabasova**,
<https://github.com/evelinag/star-wars-network-data>, licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Modified for this project.

DOI: [10.5281/zenodo.1411479](https://doi.org/10.5281/zenodo.1411479)

Cite as:

> E. Gabasova, "Star Wars social network", 2016. DOI: 10.5281/zenodo.1411479

## Licence

Zenodo records the dataset as `cc-by-3.0`. Attribution is required. The films
themselves remain Lucasfilm / Disney; this licence covers Gabasova's derived
network, not the saga.

## Retrieving the raw files

Retrieved 2026-09-17. The adapter fetches the seven `*-interactions-allCharacters.json`
files from tag `1.0.1` if they are missing:

```sh
cd pipeline/raw/starwars
for n in 1 2 3 4 5 6 7; do
  curl -sSfL -O "https://raw.githubusercontent.com/evelinag/star-wars-network-data/1.0.1/starwars-episode-$n-interactions-allCharacters.json"
done
```

The pre-merged `starwars-full-*` files cover only episodes I–VI, so they are not used.
