"""Deterministic lexicon of emotion / hype cues in an investor message (French and English)."""

from __future__ import annotations

import re
import unicodedata

CATEGORY_LABELS = {
    "fomo": "Peur de manquer (FOMO)",
    "panique": "Panique",
    "autorite_sociale": "Autorité sociale / effet de foule",
    "surconfiance": "Surconfiance",
    "ancrage": "Ancrage",
    "concentration": "Concentration excessive",
    "urgence": "Urgence",
    "euphorie": "Euphorie",
}

PATTERNS: dict[str, tuple[str, ...]] = {
    "autorite_sociale": (r"tout le monde", r"tous mes amis", r"everyone", r"tout le monde en parle",
                         r"influenceu\w+", r"reddit", r"tiktok", r"youtube", r"mon (beau-frère|voisin|collègue)",
                         r"les experts disent"),
    "fomo": (r"avant qu'il (ne )?soit trop tard", r"\brater\b", r"\bmanquer\b", r"\bfomo\b", r"to the moon",
             r"d[ée]colle", r"s'envole", r"le train"),
    "concentration": (r"toute ma retraite", r"toutes mes [ée]conomies", r"tout mon (argent|reer|celi|portefeuille)",
                      r"\ball[- ]in\b", r"tout miser", r"je mets tout", r"100 ?%"),
    "urgence": (r"tout de suite", r"imm[ée]diatement", r"\bvite\b", r"maintenant", r"aujourd'hui", r"!{2,}"),
    "panique": (r"tout vendre", r"vendre tout", r"panique", r"krach", r"s'effondre", r"je perds tout",
                r"sortir du march[ée]", r"peur que la baisse", r"avant de perdre"),
    "surconfiance": (r"c'est s[ûu]r", r"garanti", r"impossible de perdre", r"sans risque", r"ne peut que monter",
                     r"certain que"),
    "euphorie": (r"incroyable", r"jackpot", r"exploser", r"devenir riche", r"🚀"),
    "ancrage": (r"il [ée]tait [àa]", r"revenir [àa]", r"mon prix d'achat", r"remonter [àa]"),
}


# Typographic apostrophes and non-breaking spaces, as a French keyboard, a phone or the app's own proposed
# message write them, read as their plain forms (one character for one: positions in the text are kept).
_PLAIN = str.maketrans({"\u2019": "'", "\u2018": "'", "\u02bc": "'", "\u00a0": " ", "\u202f": " ", "\u2009": " "})


def _fold(text: str) -> str:
    return unicodedata.normalize("NFC", text).translate(_PLAIN).lower()


def _loose(text: str) -> str:
    """Folded, without the quotes or ellipsis a model wraps a quotation in, and with single spaces."""
    return " ".join(_fold(text).strip(" \t\n\"«»“”…").strip(".").split())


def detect(message: str) -> list[dict]:
    """[{category, excerpt, intensity, method}] with the excerpt copied verbatim from the message."""
    folded = _fold(message)
    out = []
    for category, patterns in PATTERNS.items():
        for pat in patterns:
            m = re.search(pat, folded)
            if m:
                out.append({"category": category, "excerpt": message[m.start():m.end()],
                            "intensity": 0.6, "method": "lexique"})
                break
    return out


def excerpt_is_verbatim(excerpt: str, message: str) -> bool:
    """The excerpt is really in the message: same words, whatever the apostrophe (' or ’), the case, the
    spacing or the quotes around it. Anything else was invented and is rejected."""
    wanted = _loose(excerpt)
    return bool(wanted) and wanted in _loose(message)
