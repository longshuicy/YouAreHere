# Source: 紅樓夢 — built here, not taken

The graph is assembled by `pipeline/ingest/hongloumeng.py` from two sources that
carry no licence problem, because the ready-made graph the notes pointed at
cannot be shipped.

| Candidate | Problem |
|---|---|
| [yuany-pku/dream-of-the-red-chamber](https://github.com/yuany-pku/dream-of-the-red-chamber) | A 374×475 character×event matrix, crowdsourced at Peking University. The repository has **no licence** (`license: null` on GitHub). Unresolved terms are treated as the most restrictive case, and the emitter will refuse them. |
| Typed relationship graphs of 红楼梦 | Mandarin-labelled edges, various dumps, none with terms that can merge into the CC BY-NC-SA `/data` directory. |

## What is built instead

| Part | Source | Terms |
|---|---|---|
| Text | Cao Xueqin, 紅樓夢, [Project Gutenberg eBook #24264](https://www.gutenberg.org/ebooks/24264) | Public domain in the United States |
| Who is a person | [Wikidata](https://www.wikidata.org/) characters of 紅樓夢 (Q8265) | CC0 1.0 |

A tie is **two people named in the same sentence**. Places and unnamed servants
are never nodes, because the node list comes from Wikidata's people rather than
from every string the text happens to capitalise — there is no capitalisation
in Chinese anyway.

Cached here: `gutenberg-24264.txt` and `wikidata-figures.json`. Delete either
to re-fetch.

## Retrieving the raw files

The adapter fetches both on first build. By hand:

```sh
cd pipeline/raw/hongloumeng
curl -sSfL -A "YouAreHere-pipeline/0.1" \
  -O "https://www.gutenberg.org/ebooks/24264.txt.utf-8"
mv 24264.txt.utf-8 gutenberg-24264.txt
```

The Wikidata character list is queried for items that are characters of Q8265
(the work's own `P674` list, plus fictional characters with a "present in work"
statement), then labelled in Chinese — both scripts, because the Gutenberg text
mixes them. Display names are Chinese; pinyin is not shipped.

## The part that needs watching

Deciding which string is a person is the whole difficulty, and the adapter
makes two judgements about it that can be wrong:

1. **Shared names.** 寶玉 is 賈寶玉 almost always, and 甄寶玉 once in a
   while. A name is given to its best-known claimant when that figure is clearly
   ahead, and dropped when nobody is.
2. **Generic words.** 夫人, 二奶奶, 姑娘, 家的, 大夫 name a role. Left in the
   alias table they make every household wife Mrs. Liu. They are blocked; a
   qualified form such as 林姑娘 still matches.
3. **Short names.** Wikidata has 薛寶釵; the text writes 寶釵. Dropping the
   first character of a figure's own Chinese label produces the name the novel
   actually uses. The same cut on 王夫人 yields 夫人, which is already blocked.

The novel's own names are short. 賈寶玉 appears a handful of times; 寶玉 appears
thousands. Those short forms have to come from Wikidata's alias table, in both
simplified and traditional, or the graph is a graph of full names nobody uses.
