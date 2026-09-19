# Source: Les Misérables — Stanford GraphBase `jean.dat`

Knuth's public-domain encounter file, not a graph we built from the novel.

| Part | Source | Terms |
|---|---|---|
| Encounters | [jean.dat](http://ftp.cs.stanford.edu/pub/sgb/jean.dat), Stanford GraphBase | Public domain |

A tie is **two people named in the same encounter group in the same chapter**. Weight is the number of such groups they share. Segments shipped on the edges are Hugo's five volumes.

The GraphBase sources may be copied freely; Knuth asks that the master files themselves not be edited. `jean.dat` is stored unmodified. What we emit is a derived graph.

```sh
cd pipeline/raw/lesmiserables
curl -sSfL -O http://ftp.cs.stanford.edu/pub/sgb/jean.dat
```
