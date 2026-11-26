"""Проверки поискового индекса BM25 и предобработки текста."""

from __future__ import annotations

import math

import pytest

from app.backend.rag.bm25 import BM25Index, Document
from app.backend.rag.text import lemma, query_terms, terms


def lecture_corpus() -> list[Document]:
    """Три документа из примера методических указаний без служебных слов.

    В методичке длины документов равны 4 токенам вместе с предлогами. Наша
    предобработка убирает служебные слова, поэтому для точного повторения
    чисел 0,940 и 0,470 документы приведены к равной длине из трёх термов.
    """
    return [
        Document("A", "A.txt", "возврат оплата карта"),
        Document("B", "B.txt", "статус оплата приложение"),
        Document("C", "C.txt", "возврат билет касса"),
    ]


def test_lecture_example_scores_and_order() -> None:
    index = BM25Index(lecture_corpus())
    hits = index.search("Как происходит возврат оплаты?", k=3)
    assert [hit.id for hit in hits] == ["A", "B", "C"]
    idf = math.log(1 + (3 - 2 + 0.5) / (2 + 0.5))
    assert hits[0].score == pytest.approx(2 * idf)
    assert hits[1].score == pytest.approx(idf)
    assert hits[2].score == pytest.approx(idf)
    assert hits[0].score == pytest.approx(0.940, abs=1e-3)


def test_longer_document_with_same_frequency_scores_lower() -> None:
    index = BM25Index(
        [
            Document("D1", "Короткий", "термин раз два"),
            Document("D2", "Длинный", "термин раз два три четыре"),
        ]
    )
    scores = {hit.id: hit.score for hit in index.search("термин", k=2)}
    assert scores["D1"] > scores["D2"]


def test_equal_scores_are_ordered_by_document_id() -> None:
    index = BM25Index(
        [
            Document("D2", "Второй", "Общий термин."),
            Document("D1", "Первый", "Общий термин."),
        ]
    )
    assert [hit.id for hit in index.search("термин", k=2)] == ["D1", "D2"]


def test_idf_grows_for_rare_terms() -> None:
    index = BM25Index(
        [
            Document("D1", "Один", "редкий общий"),
            Document("D2", "Два", "общий"),
            Document("D3", "Три", "общий"),
        ]
    )
    assert index.idf("редкий") > index.idf("общий")


def test_document_title_is_indexed() -> None:
    index = BM25Index([Document("D1", "Медиана зарплат", "Правила расчёта.")])
    assert index.search("медиана", k=1)[0].id == "D1"


def test_k_and_parameters_are_validated() -> None:
    with pytest.raises(ValueError):
        BM25Index([])
    with pytest.raises(ValueError):
        BM25Index(lecture_corpus(), b=1.5)
    with pytest.raises(ValueError):
        BM25Index(lecture_corpus()).search("возврат", k=0)
    with pytest.raises(ValueError):
        BM25Index([Document("A", "A", "текст"), Document("A", "B", "текст")])


def test_empty_query_returns_nothing() -> None:
    assert BM25Index(lecture_corpus()).search("", k=3) == []
    assert BM25Index(lecture_corpus()).search("что и как", k=3) == []


def test_stemming_conflates_forms() -> None:
    forms = {lemma(word) for word in ("проверка", "проверки", "проверок", "проверками")}
    assert forms == {"проверка"}


def test_stopwords_and_punctuation_are_removed() -> None:
    assert query_terms("Что подтверждает короткая проверка?") == [
        "подтверждать",
        "короткий",
        "проверка",
    ]
    assert "что" not in terms("что такое проверка")


def test_contributions_explain_score() -> None:
    index = BM25Index(lecture_corpus())
    contributions = index.contributions("возврат оплаты", "A")
    assert set(contributions) == {"возврат", "оплата"}
    assert sum(contributions.values()) == pytest.approx(
        index.search("возврат оплаты", k=1)[0].score
    )
