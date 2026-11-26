"""Предобработка текста для поискового индекса.

Выбранный подход: нижний регистр, замена ``ё`` на ``е``, разбиение по
не-буквам, отбрасывание служебных слов и лемматизация русских слов через
``pymorphy3``. Лемматизация снимает падеж, число и другие формы, поэтому
«проверки» и «проверок» попадают в один терм. Если библиотека недоступна,
используется встроенное усечение окончаний — качество ниже, но индекс
продолжает работать. Токенизация и лемматизация применяются одинаково к
документам и к запросу, как требует модель BM25.
"""

from __future__ import annotations

import re
from functools import lru_cache

_TOKEN = re.compile(r"[0-9a-zа-я]+")
_CYRILLIC = re.compile(r"[а-я]")

# Служебные слова не несут темы и только завышают совпадение. Отрицание
# («не», «ни») намеренно оставлено: оно меняет смысл утверждения.
STOPWORDS = frozenset(
    [
        "и",
        "в",
        "во",
        "на",
        "с",
        "со",
        "к",
        "ко",
        "о",
        "об",
        "от",
        "до",
        "по",
        "из",
        "за",
        "для",
        "при",
        "у",
        "а",
        "но",
        "или",
        "что",
        "как",
        "это",
        "этот",
        "эта",
        "эти",
        "то",
        "же",
        "бы",
        "чем",
        "кто",
        "где",
        "когда",
        "почему",
        "зачем",
        "какой",
        "какая",
        "какие",
        "каких",
        "я",
        "мы",
        "вы",
        "он",
        "она",
        "они",
        "оно",
        "его",
        "ее",
        "их",
        "мне",
        "нам",
        "вам",
        "меня",
        "тебя",
        "себя",
        "ли",
    ]
)

# Запасной вариант: усечение частых русских окончаний. Применяется только
# если pymorphy3 не установлен.
_FALLBACK_SUFFIXES = (
    "ившись",
    "ывшись",
    "вшись",
    "ившие",
    "ывшие",
    "ивши",
    "ывши",
    "вши",
    "иями",
    "ями",
    "ами",
    "ией",
    "иях",
    "ях",
    "ов",
    "ев",
    "ие",
    "ье",
    "еи",
    "ии",
    "ей",
    "ой",
    "ий",
    "ым",
    "им",
    "ем",
    "ом",
    "ам",
    "ах",
    "ию",
    "ью",
    "ия",
    "ья",
    "ую",
    "юю",
    "ая",
    "яя",
    "ое",
    "ее",
    "ые",
    "его",
    "ого",
    "ему",
    "ому",
    "их",
    "ых",
    "ею",
    "ою",
    "ить",
    "ыть",
    "ать",
    "ять",
    "ишь",
    "ете",
    "ите",
    "ут",
    "ют",
    "ат",
    "ят",
    "ил",
    "ыла",
    "ила",
    "ило",
    "ыло",
    "ено",
    "ена",
    "ены",
    "ует",
    "ю",
    "а",
    "я",
    "ы",
    "и",
    "е",
    "о",
    "у",
    "ь",
)

_morph = None
_morph_checked = False


def _analyzer():
    global _morph, _morph_checked
    if not _morph_checked:
        _morph_checked = True
        try:
            import pymorphy3
        except ImportError:
            _morph = None
        else:
            _morph = pymorphy3.MorphAnalyzer()
    return _morph


def normalize(text: str) -> str:
    """Нижний регистр и единая буква «е»."""
    return text.lower().replace("ё", "е")


def _fallback_stem(word: str) -> str:
    for suffix in _FALLBACK_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


@lru_cache(maxsize=50_000)
def lemma(word: str) -> str:
    """Начальная форма слова (или его усечённая основа без библиотеки)."""
    analyzer = _analyzer()
    if analyzer is not None and _CYRILLIC.search(word):
        return analyzer.parse(word)[0].normal_form
    if (
        not _CYRILLIC.search(word)
        and len(word) > 4
        and word.endswith("s")
        and not word.endswith("ss")
    ):
        return word[:-1]
    return _fallback_stem(word) if _CYRILLIC.search(word) else word


def terms(text: str) -> list[str]:
    """Термы текста в порядке появления, без служебных слов."""
    result: list[str] = []
    for match in _TOKEN.finditer(normalize(text)):
        token = match.group(0)
        if len(token) < 2 or token in STOPWORDS:
            continue
        result.append(lemma(token))
    return result


def query_terms(query: str) -> list[str]:
    """Уникальные термы запроса с сохранением порядка."""
    return list(dict.fromkeys(terms(query)))


def explanation_terms(text: str) -> list[str]:
    """Термы без лемматизации — для сравнения ключевых фраз эталона."""
    return [
        match.group(0) for match in _TOKEN.finditer(normalize(text)) if len(match.group(0)) >= 2
    ]
