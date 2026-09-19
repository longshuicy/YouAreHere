# Source: U.S. Congress cosponsorship

Structured bill data — no text parsing. Two legislators are tied when they
appear together on the same bill as sponsor or cosponsor.

| Part | Source | Terms |
|---|---|---|
| Cosponsorship hypergraph | [congress-bills on Figshare](https://doi.org/10.6084/m9.figshare.21502551) (Benson et al., from [James H. Fowler](https://www.cs.cornell.edu/~arb/data/congress-bills/)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Legislator attributes | [@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) (party, chamber, state, gender) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Segments are Congresses (roughly 1973–2004, the 93rd through 108th). Bills with
a single name, or with more than 25 names, are dropped. Surname-only ALL-CAPS
stubs in the node table are dropped.

## Retrieving the raw file

```sh
cd pipeline/raw/congress
curl -fsSL -A "Mozilla/5.0" \
  -H "Referer: https://figshare.com/articles/dataset/congress-bills/21502551" \
  -L -o congress-bills.json \
  "https://ndownloader.figshare.com/files/38101161"
```
