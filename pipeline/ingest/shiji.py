"""Records of the Grand Historian — sentence co-occurrence.

Public-domain text plus people Wikidata marks as described by the 史記.
A historical chronicle has no fictional cast list, so the person inventory
comes from P1343 rather than P674. See raw/shiji/SOURCE.md.
"""

from __future__ import annotations

from .chinese_novel import Work, load_work

WORK = Work(
    id="shiji",
    title="史記",
    accent="#6B4F2A",
    gutenberg_id=24226,
    work_qid="Q272530",
    chapter_count=130,  # classical count; the Gutenberg file yields ~126 titled juan
    author="Sima Qian",
    figure_mode="described_by",
    segment_style="shiji",
    source_unit="juan",
    extra_generic=frozenset(
        {
            "天子",
            "諸侯",
            "陛下",
            "太史公",
            "王侯",
            "大夫",
            "將軍",
            "丞相",
            "皇帝",
            "太后",
            "公子",
            "王",
            "公",
            "侯",
            "君",
        }
    ),
)


def load():
    return load_work(WORK)
