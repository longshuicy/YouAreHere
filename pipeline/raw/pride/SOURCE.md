# Source: Pride and Prejudice character networks (Nation, Genre & Gender)

Manually annotated chapter co-occurrence networks from the UCD Nation, Genre &
Gender project. Two people are tied when they co-occur in the same chapter.
Collective nodes (`all the servants`, …) and annotation stubs (`General 1`) are
dropped. The annotated full text is not shipped.

| Part | Source | Terms |
|---|---|---|
| Chapter GEXF networks + dictionary + attributes | [Nation, Genre & Gender — Pride and Prejudice](http://www.nggprojectucd.ie/data/index.html) (Meaney, Greene, Wade, Mulvany, Grayson, Rothwell) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Reveal attributes | [Wikidata](https://www.wikidata.org/) characters of the novel | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

The underlying novel is the Project Gutenberg text (public domain). Segments are
the 61 sequentially numbered chapters.

## Retrieving the raw files

```sh
cd pipeline/raw/pride
curl -fsSL -o ngg-pride_prejudice.zip \
  "http://www.nggprojectucd.ie/data/files/ngg-pride_prejudice.zip"
unzip -o ngg-pride_prejudice.zip
```

The adapter fetches and unpacks the zip on first build if `networks/` is missing.
