# YOU ARE HERE

A literary network puzzle. You wake as an unnamed character in the social graph of
a story, and you are told nothing else — not the book, not your name. You have a
shape: who is next to you, and who is next to them.

One question in two halves: **what story are you in, and who are you?**

The governing rule is that *information costs and guessing is free*. You can expand
a node, buy a reading of someone, or buy a name, and every purchase is counted in
one number. Guessing costs nothing, and a wrong guess costs nothing either.

## What is in here

| | |
|---|---|
| `pipeline/` | Python. Turns third-party character-network datasets into the game's own format. |
| `app/` | TypeScript + React + Vite. The game. |
| `data/` | Generated. 32 worlds, their reveal-only sidecars, and the licence files that travel with them. |
| `docs/` | Design and specification. [Algorithms](docs/Algorithms.md) is the one with the equations in it. |

## Running it

```bash
npm --prefix app install
npm --prefix app run dev
```

Rebuilding the data is only needed if you change the pipeline or add a source:

```bash
pip install -r pipeline/requirements.txt
python -m pipeline build
```

The build is deterministic — two runs on unchanged input produce an empty diff — and
it writes everything in `data/`, including `ATTRIBUTION.md` and `LICENSE`. Do not
edit those by hand. Build one source at a time with `--source asoiaf`, but note that
the shared index is rewritten from whatever was built, so a partial build produces a
partial index.

## The worlds

32 of them, from five sources:

- **A Song of Ice and Fire** — 592 characters, tied when named within fifteen words
  of each other.
- **The Bible** — 726 characters, tied when named in the same verse. Built here from
  the King James text and Wikidata rather than taken ready-made; see
  `pipeline/raw/bible/SOURCE.md` for why, and for the traps.
- **紅樓夢** — characters tied when named in the same sentence.
  Built here from the Project Gutenberg text and Wikidata; the PKU matrix has no
  licence, see `pipeline/raw/hongloumeng/SOURCE.md`.
- **Shakespeare** — 28 worlds, tied when they share a scene. One per play, except
  where plays genuinely interlock: the English histories are one world, and so are
  the two Roman plays.
- **Star Wars** — 103 characters, tied when they speak in the same scene.

## Licensing

The code and the data are licensed separately, and the data is the restrictive half.

- **Code** — MIT, see `LICENSE`.
- **Data** — see `data/LICENSE`, currently CC BY-NC-SA 4.0, which is the most
  restrictive of the terms the sources arrive under. **While those datasets ship,
  the game may not be put to commercial use.** Removing or replacing them is what
  lifts that.

`LICENSING.md` explains the split. `data/ATTRIBUTION.md` carries the credit, the
citation and the statement of changes each source requires; both are generated, and
the pipeline refuses to emit a world whose attribution is incomplete.

## Where to read next

- [docs/Game design.md](docs/Game%20design.md) — the rules, the information economy,
  and what a tie means.
- [docs/Algorithms.md](docs/Algorithms.md) — how the graph is built, drawn, and
  scored. Equations.
- [docs/Data & puzzle pipeline.md](docs/Data%20&%20puzzle%20pipeline.md) — stages and
  emitted artifacts.
- [docs/Technical architecture.md](docs/Technical%20architecture.md) — the client.

The visual design lives outside the repo, in a Claude Design canvas artifact. The
prose docs are authoritative for rules and behaviour; the artifact is authoritative
for how a screen looks.
