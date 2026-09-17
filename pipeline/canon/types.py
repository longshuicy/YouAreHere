"""The canonical shape every adapter produces.

Nothing downstream of an adapter may know which dataset it is looking at.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Node:
    id: str
    name: str
    aliases: tuple[str, ...] = ()
    work: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    weight: float
    type: str
    segments: tuple[str, ...] = ()

    @property
    def key(self) -> tuple[str, str]:
        return (self.source, self.target) if self.source <= self.target else (self.target, self.source)


@dataclass(frozen=True)
class License:
    """The terms the source data arrives under.

    `share_alike` is the field with teeth: when true, the graph we emit is an
    adaptation and must carry these same terms, which constrains what /data can
    be licensed as regardless of what the application code is licensed as.
    """

    name: str
    spdx: str
    url: str
    allows_commercial_use: bool
    share_alike: bool
    deed_summary: str = ""

    def can_merge_into(self, target: License) -> bool:
        """Whether material under this licence may be combined into a work
        distributed under `target`.

        The trap this exists to catch: ShareAlike requires adaptations to carry
        the same terms, so CC BY-SA material cannot be folded into a CC BY-NC-SA
        work — that would add the NonCommercial restriction ShareAlike forbids.
        The result is a file that cannot be licensed at all, and the mistake is
        invisible once it is made.

        Non-ShareAlike material may be redistributed under stricter terms, so it
        merges freely. Facts carry no licence and merge into anything.
        """
        if not self.share_alike:
            return True
        return self.spdx == target.spdx


@dataclass(frozen=True)
class Attribution:
    """Everything needed to credit the source wherever the data is shown.

    Follows the title / creator / source / licence pattern the Creative Commons
    attribution guidance asks for; `modifications` covers the separate CC
    requirement to state that changes were made.
    """

    title: str
    creator: str
    creator_url: str = ""
    source_url: str = ""
    project_url: str = ""
    citation: str = ""
    citation_doi: str = ""
    retrieved: str = ""
    modifications: tuple[str, ...] = ()

    def credit_line(self, license: License) -> str:
        """A single sentence usable as a caption, a reveal-screen credit, or a
        README line."""
        parts = [f'"{self.title}" by {self.creator}']
        if self.source_url:
            parts.append(f"({self.source_url})")
        parts.append(f"licensed under {license.name}")
        if self.modifications:
            parts.append("modified for this project")
        return ", ".join(parts) + "."


@dataclass
class Provenance:
    """What an edge means here, and who we owe for it.

    Different literary datasets mean different things by an edge, and mixing
    them without recording which is which makes cross-novel difficulty
    incomparable. The licence half is not bureaucracy either: the sources have
    genuinely different terms and some of them propagate to what we emit.
    """

    dataset: str
    edge_definition: str
    source_unit: str
    weight_semantics: str
    attribution: Attribution
    license: License
    filters: dict = field(default_factory=dict)

    def with_modification(self, description: str) -> None:
        """Stages record what they changed, so the CC "indicate if changes were
        made" line stays true instead of going stale in a constant."""
        if description not in self.attribution.modifications:
            object.__setattr__(
                self.attribution,
                "modifications",
                self.attribution.modifications + (description,),
            )


@dataclass
class CanonicalGraph:
    id: str
    title: str
    accent: str
    nodes: list[Node]
    edges: list[Edge]
    provenance: Provenance

    def sorted(self) -> CanonicalGraph:
        """Deterministic ordering. Every stage returns a sorted graph so two runs
        on unchanged input produce an empty diff."""
        return CanonicalGraph(
            id=self.id,
            title=self.title,
            accent=self.accent,
            nodes=sorted(self.nodes, key=lambda n: n.id),
            edges=sorted(self.edges, key=lambda e: e.key),
            provenance=self.provenance,
        )
