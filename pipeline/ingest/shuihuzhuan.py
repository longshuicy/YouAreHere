"""Water Margin — sentence co-occurrence.

Gutenberg's 70-chapter recension plus Wikidata characters. Same construction
as 紅樓夢. See raw/shuihuzhuan/SOURCE.md.
"""

from __future__ import annotations

from .chinese_novel import Work, load_work

WORK = Work(
    id="shuihuzhuan",
    title="水滸傳",
    accent="#3F6212",
    gutenberg_id=23863,
    work_qid="Q70827",
    chapter_count=70,
    author="Shi Nai'an",
)


def load():
    return load_work(WORK)
