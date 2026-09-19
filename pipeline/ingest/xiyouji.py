"""Journey to the West — sentence co-occurrence.

Gutenberg Chinese text plus Wikidata characters. Same construction as 紅樓夢;
the PKU matrix has no licence. See raw/xiyouji/SOURCE.md.
"""

from __future__ import annotations

from .chinese_novel import Work, load_work

WORK = Work(
    id="xiyouji",
    title="西遊記",
    accent="#C2410C",
    gutenberg_id=23962,
    work_qid="Q70784",
    chapter_count=100,
    author="Wu Cheng'en",
)


def load():
    return load_work(WORK)
