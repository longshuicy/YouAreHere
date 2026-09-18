# Source: Shakespeare Drama Corpus (DraCor)

## Credit

Shakespeare Drama Corpus, DraCor, derived from the **Folger Shakespeare Library**,
<https://github.com/dracor-org/shakedracor>, licensed under
[CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/). Modified for this project.

<https://dracor.org/shake>

Cite DraCor as:

> F. Fischer et al., "Programmable Corpora: Introducing DraCor, an Infrastructure
> for the Research on European Drama", DH2019. doi:10.5281/zenodo.4284002

## Licence

The DraCor default for many corpora is CC0. **This corpus is not.** The Folger
texts are CC BY-NC 3.0, which the corpus metadata repeats (`licence`: CC BY-NC 3.0).
NonCommercial terms therefore apply to the emitted Shakespeare graph. They are
compatible with the stricter CC BY-NC-SA 4.0 that `/data` already carries from
the ASOIAF dataset.

## Retrieving the raw files

The adapter caches `corpus.json`, per-play cast JSON, and network CSVs from
`https://dracor.org/api/v0/corpora/shake` on first build.
