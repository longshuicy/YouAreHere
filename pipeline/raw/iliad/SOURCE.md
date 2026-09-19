# Source: The Iliad — Stanford GraphBase `homer.dat`

Knuth's public-domain encounter file, not a graph we built from the poem.

| Part | Source | Terms |
|---|---|---|
| Encounters | [homer.dat](http://ftp.cs.stanford.edu/pub/sgb/homer.dat), Stanford GraphBase | Public domain |

A tie is **two people named in the same encounter group in the same book**. Weight is the number of such groups they share.

The GraphBase sources may be copied freely; Knuth asks that the master files themselves not be edited. `homer.dat` is stored unmodified. What we emit is a derived graph.

```sh
cd pipeline/raw/iliad
curl -sSfL -O http://ftp.cs.stanford.edu/pub/sgb/homer.dat
```
