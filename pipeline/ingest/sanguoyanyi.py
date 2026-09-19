"""Romance of the Three Kingdoms — sentence co-occurrence.

Gutenberg Chinese text plus Wikidata characters. Same construction as 紅樓夢.
See raw/sanguoyanyi/SOURCE.md.
"""

from __future__ import annotations

from .chinese_novel import Work, load_work

WORK = Work(
    id="sanguoyanyi",
    title="三國演義",
    accent="#9A3412",
    gutenberg_id=23950,
    work_qid="Q70806",
    chapter_count=120,
    author="Luo Guanzhong",
)


def load():
    return load_work(WORK)
