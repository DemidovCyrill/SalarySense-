"""Поисковый индекс BM25, реализованный без готовых поисковых библиотек.

Формула из методических указаний к НИРС:

    IDF(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
    BM25(q, d) = Σ_t IDF(t) · tf(t, d) · (k1 + 1) /
                 (tf(t, d) + k1 · (1 - b + b · |d| / avgdl))

Индекс хранит обратное соответствие «терм → документ → частота», длины
документов и среднюю длину. Ранжирование детерминировано: при равных баллах
документы упорядочиваются по ID.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from .text import query_terms, terms


@dataclass(frozen=True)
class Document:
    """Индексируемый фрагмент корпуса."""

    id: str
    title: str
    text: str
    source: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Hit:
    """Результат поиска: документ, балл BM25 и вклад каждого терма."""

    document: Document
    score: float
    contributions: dict[str, float]

    @property
    def id(self) -> str:
        return self.document.id


class BM25Index:
    """Обратный индекс и ранжирование по BM25."""

    def __init__(
        self,
        documents: Iterable[Document],
        k1: float = 1.2,
        b: float = 0.75,
        analyzer: Callable[[str], list[str]] = terms,
    ) -> None:
        if k1 < 0:
            raise ValueError("k1 не может быть отрицательным")
        if not 0 <= b <= 1:
            raise ValueError("b должен быть в диапазоне от 0 до 1")
        self.k1 = k1
        self.b = b
        self.analyzer = analyzer
        self.documents = list(documents)
        if not self.documents:
            raise ValueError("Корпус пуст: индексировать нечего")
        self.postings: dict[str, dict[str, int]] = {}
        self.lengths: dict[str, int] = {}
        self.by_id: dict[str, Document] = {}
        for document in self.documents:
            if document.id in self.by_id:
                raise ValueError(f"Повторяющийся ID документа: {document.id}")
            tokens = analyzer(f"{document.title} {document.text}")
            self.by_id[document.id] = document
            self.lengths[document.id] = len(tokens)
            counts: dict[str, int] = {}
            for token in tokens:
                counts[token] = counts.get(token, 0) + 1
            for token, frequency in counts.items():
                self.postings.setdefault(token, {})[document.id] = frequency
        self.count = len(self.documents)
        self.avgdl = sum(self.lengths.values()) / self.count

    def idf(self, term: str) -> float:
        """Модифицированная IDF из BM25; неизвестный терм даёт 0."""
        postings = self.postings.get(term)
        if not postings:
            return 0.0
        df = len(postings)
        return math.log(1 + (self.count - df + 0.5) / (df + 0.5))

    def contributions(self, query: str, document_id: str) -> dict[str, float]:
        """Вклад термов запроса в балл конкретного документа."""
        result: dict[str, float] = {}
        length = self.lengths[document_id]
        for term in query_terms(query):
            frequency = self.postings.get(term, {}).get(document_id)
            if not frequency:
                continue
            norm = self.k1 * (1 - self.b + self.b * length / self.avgdl) if self.avgdl else 0.0
            result[term] = self.idf(term) * frequency * (self.k1 + 1) / (frequency + norm)
        return result

    def search(self, query: str, k: int = 3) -> list[Hit]:
        """Топ-k документов по убыванию балла, при равенстве — по ID."""
        if k <= 0:
            raise ValueError("k должен быть положительным")
        scores: dict[str, float] = {}
        contributions: dict[str, dict[str, float]] = {}
        for term in query_terms(query):
            postings = self.postings.get(term)
            if not postings:
                continue
            weight = self.idf(term)
            for document_id, frequency in postings.items():
                length = self.lengths[document_id]
                norm = self.k1 * (1 - self.b + self.b * length / self.avgdl) if self.avgdl else 0.0
                value = weight * frequency * (self.k1 + 1) / (frequency + norm)
                scores[document_id] = scores.get(document_id, 0.0) + value
                contributions.setdefault(document_id, {})[term] = value
        ranked = sorted(scores, key=lambda document_id: (-scores[document_id], document_id))
        return [
            Hit(
                document=self.by_id[document_id],
                score=scores[document_id],
                contributions=contributions[document_id],
            )
            for document_id in ranked[:k]
        ]

    def search_hits(self, query: str, k: int = 3) -> Sequence[Hit]:
        """Псевдоним ``search`` для читаемости в вызывающем коде."""
        return self.search(query, k)
