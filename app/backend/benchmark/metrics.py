"""Метрики качества поиска и ответов.

Recall@k и MRR@k считаются по выдаче поискового индекса и эталонным ID.
Accuracy проверяет, что ответ содержит все обязательные факты эталона и не
является отказом. Correct Rejection Rate считает долю ловушек, на которые
система не выдумала ответ.
"""

from __future__ import annotations

from collections.abc import Iterable
from statistics import fmean
from typing import Any

from ..rag.text import terms


def recall_at_k(retrieved: Iterable[str], relevant: Iterable[str], k: int) -> float:
    """Доля релевантных документов, попавших в первые k результатов."""
    expected = set(relevant)
    if not expected:
        return 0.0
    found = expected & set(list(retrieved)[:k])
    return len(found) / len(expected)


def reciprocal_rank(retrieved: Iterable[str], relevant: Iterable[str], k: int) -> float:
    """1/позиция первого релевантного документа в top-k, иначе 0."""
    expected = set(relevant)
    for position, document_id in enumerate(list(retrieved)[:k], start=1):
        if document_id in expected:
            return 1 / position
    return 0.0


def missing_facts(answer: str, must: Iterable[str]) -> list[str]:
    """Факты эталона, которых нет в ответе (сравнение по леммам)."""
    answer_terms = set(terms(answer))
    missing = []
    for fact in must:
        required = set(terms(fact))
        if not required.issubset(answer_terms):
            missing.append(fact)
    return missing


def judge_keyfacts(answer: str, must: Iterable[str]) -> tuple[bool, str]:
    """Детерминированная проверка ответа по обязательным фактам."""
    if not answer.strip():
        return False, "Пустой ответ."
    missing = missing_facts(answer, must)
    if missing:
        return False, "Нет фактов: " + "; ".join(missing)
    return True, "Все обязательные факты присутствуют."


def _judged_accuracy(rows: list[dict[str, Any]]) -> tuple[float | None, int, int]:
    judged = [row for row in rows if not row["trap"] and row.get("verdict") is not None]
    if not judged:
        return None, 0, 0
    correct = sum(1 for row in judged if row["verdict"])
    return correct / len(judged), correct, len(judged)


def trap_verdict(row: dict[str, Any]) -> bool | None:
    """Итог по ловушке: оценка судьи, иначе строгая проверка отказа."""
    if row.get("trap_correct") is not None:
        return bool(row["trap_correct"])
    if row.get("rejected") is not None:
        return bool(row["rejected"])
    return None


def _trap_rate(rows: list[dict[str, Any]]) -> tuple[float | None, int, int]:
    traps = [row for row in rows if row["trap"] and trap_verdict(row) is not None]
    if not traps:
        return None, 0, 0
    correct = sum(1 for row in traps if trap_verdict(row))
    return correct / len(traps), correct, len(traps)


def _mean(rows: list[dict[str, Any]], key: str) -> float | None:
    values = [row[key] for row in rows if row.get(key) is not None]
    return fmean(values) if values else None


def summarise(rows: list[dict[str, Any]], k: int, secondary_k: int = 5) -> dict[str, Any]:
    """Сводка по всем вопросам: поиск, ответы и ловушки."""
    normal = [row for row in rows if not row["trap"]]
    scored = [row for row in normal if row.get("recall") is not None]
    accuracy, correct, judged = _judged_accuracy(rows)
    rate, rejected, measured = _trap_rate(rows)
    return {
        "k": k,
        "secondary_k": secondary_k,
        "questions": {
            "total": len(rows),
            "normal": len(normal),
            "traps": len(rows) - len(normal),
            "errors": sum(1 for row in rows if row.get("error")),
        },
        "retrieval": {
            "measured": len(scored),
            "recall_at_k": fmean(row["recall"] for row in scored) if scored else None,
            "mrr_at_k": fmean(row["rr"] for row in scored) if scored else None,
            "full_recall": sum(1 for row in scored if row["recall"] >= 1.0),
            "recall_at_secondary": _mean(scored, "recall_secondary"),
            "mrr_at_secondary": _mean(scored, "rr_secondary"),
        },
        "answers": {"accuracy": accuracy, "correct": correct, "judged": judged},
        "traps": {
            "correct_rejections": rejected,
            "measured": measured,
            "correct_rejection_rate": rate,
            "strict_rejections": sum(1 for row in rows if row.get("rejected")),
        },
    }
