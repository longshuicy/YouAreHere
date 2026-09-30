# Licensing

This repository contains more than one work, and they are not under the same terms.

This project is not offered for commercial use.

## Original source and documentation — MIT

The pipeline, application code, design documents, and this file are copyright Chen, 2026, and are licensed under the MIT License. See `LICENSE` at the repository root.

MIT permits reuse, including commercial reuse, of **that original work**. It does not relicense the datasets in `/data`, and it does not grant any rights in the novels those datasets describe.

## `/data` — licensed per world

The emitted graphs and their sidecar files are adaptations of third-party datasets. They are **not** covered by the MIT License.

`/data` is a collection of separate works, not a single one. Each world — its universe file and its `.meta.json` sidecar together — is distributed under the terms of the source it was built from: CC BY-NC-SA 4.0 for A Song of Ice and Fire, CC BY-SA 3.0 for The Stormlight Archive, CC BY 4.0 for The Lord of the Rings, and so on. `data/LICENSE` lists every file under its terms, and `data/ATTRIBUTION.md` carries the source credit, citations, and what was changed.

This is what lets ShareAlike sources with different terms ship side by side. CC BY-SA and CC BY-NC-SA each require that an adaptation carry its own terms and no others, so a single licence for the whole directory could not satisfy both. Placing separate works next to each other is not adapting either of them, provided no file mixes material from sources whose terms differ. The pipeline enforces that: `License.can_merge_into()` refuses to fold a ShareAlike source into a world under any other terms.

While the NonCommercial worlds ship, the game as a whole may not be sold, ad-supported, or otherwise put to commercial use. Removing or replacing those datasets is what would lift that restriction on the *data*. It would not change the project’s intent: this is a non-commercial work.

## The novels

Character names, plots, and the texts of the books remain with their rights holders. Nothing in this repository licenses George R. R. Martin’s work, Brandon Sanderson’s, nor any other author’s.
