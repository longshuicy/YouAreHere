"""Licences the sources arrive under, declared once so adapters cannot paraphrase
them inconsistently."""

from __future__ import annotations

from .types import License

CC_BY_NC_SA_4_0 = License(
    name="Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International",
    spdx="CC-BY-NC-SA-4.0",
    url="https://creativecommons.org/licenses/by-nc-sa/4.0/",
    allows_commercial_use=False,
    share_alike=True,
    deed_summary=(
        "Credit the creator, link the licence, and state that changes were made. "
        "No commercial use. Adaptations must carry the same licence."
    ),
)

CC_BY_3_0 = License(
    name="Creative Commons Attribution 3.0 Unported",
    spdx="CC-BY-3.0",
    url="https://creativecommons.org/licenses/by/3.0/",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary="Credit the creator, link the licence, and state that changes were made.",
)

CC_BY_NC_3_0 = License(
    name="Creative Commons Attribution-NonCommercial 3.0 Unported",
    spdx="CC-BY-NC-3.0",
    url="https://creativecommons.org/licenses/by-nc/3.0/",
    allows_commercial_use=False,
    share_alike=False,
    deed_summary=(
        "Credit the creator, link the licence, and state that changes were made. "
        "No commercial use."
    ),
)

CC_BY_NC_4_0 = License(
    name="Creative Commons Attribution-NonCommercial 4.0 International",
    spdx="CC-BY-NC-4.0",
    url="https://creativecommons.org/licenses/by-nc/4.0/",
    allows_commercial_use=False,
    share_alike=False,
    deed_summary=(
        "Credit the creator, link the licence, and state that changes were made. "
        "No commercial use."
    ),
)

CC_BY_4_0 = License(
    name="Creative Commons Attribution 4.0 International",
    spdx="CC-BY-4.0",
    url="https://creativecommons.org/licenses/by/4.0/",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary="Credit the creator, link the licence, and state that changes were made.",
)

ODC_BY_1_0 = License(
    name="Open Data Commons Attribution License (ODC-By) v1.0",
    spdx="ODC-By-1.0",
    url="https://opendatacommons.org/licenses/by/1-0/",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary=(
        "Credit the creator and keep a notice of this licence with the database. "
        "No ShareAlike clause — adaptations may carry stricter terms."
    ),
)

CC_BY_SA_4_0 = License(
    name="Creative Commons Attribution-ShareAlike 4.0 International",
    spdx="CC-BY-SA-4.0",
    url="https://creativecommons.org/licenses/by-sa/4.0/",
    allows_commercial_use=True,
    share_alike=True,
    deed_summary=(
        "Credit the creator, link the licence, and state that changes were made. "
        "Adaptations must carry the same licence."
    ),
)

MIT = License(
    name="MIT License",
    spdx="MIT",
    url="https://opensource.org/license/mit",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary="Keep the copyright notice and licence text with the work.",
)

FACTUAL = License(
    name="Factual data, not subject to copyright",
    spdx="NONE-FACTUAL",
    url="https://en.wikipedia.org/wiki/Idea%E2%80%93expression_distinction",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary=(
        "Attributes such as a character's culture, titles, or house are facts rather than "
        "creative expression and carry no licence. Only discrete attributes may be taken "
        "under this heading — never prose, which is expression regardless of how factual "
        "its content is. Sources are credited anyway."
    ),
)

CC0_1_0 = License(
    name="Creative Commons Zero v1.0 Universal",
    spdx="CC0-1.0",
    url="https://creativecommons.org/publicdomain/zero/1.0/",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary="Dedicated to the public domain. No conditions.",
)

PUBLIC_DOMAIN = License(
    name="Public domain",
    spdx="NONE-PUBLIC-DOMAIN",
    url="https://en.wikipedia.org/wiki/Public_domain",
    allows_commercial_use=True,
    share_alike=False,
    deed_summary=(
        "Out of copyright, with no conditions on reuse. Note for the King James Bible "
        "specifically: it is public domain in the United States and most of the world, but in "
        "the United Kingdom it is held under perpetual Crown copyright administered by "
        "Cambridge University Press, whose permission is required to reproduce the text there. "
        "This project ships a derived co-occurrence graph rather than the text, which is not "
        "the reproduction that restriction covers."
    ),
)

UNRESOLVED = License(
    name="Unresolved",
    spdx="NOASSERTION",
    url="",
    allows_commercial_use=False,
    share_alike=True,
    deed_summary=(
        "Terms have not been established. Treated as the most restrictive case so an "
        "unchecked source cannot be shipped by accident."
    ),
)
