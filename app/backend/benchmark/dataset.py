"""Загрузка и проверка benchmark-набора.

Набор отделён от индексируемого корпуса: вопросы и эталоны лежат в
``benchmark/questions.json`` и не попадают в базу знаний. Загрузчик проверяет
ссылки на документы, чтобы вопрос не «нашёл» несуществующий ID.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class BenchmarkError(Exception):
    """Набор вопросов отсутствует или нарушает формат."""


@dataclass(frozen=True)
class Question:
    id: str
    question: str
    relevant: tuple[str, ...]
    reference: str
    must: tuple[str, ...]
    trap: bool = False


@dataclass(frozen=True)
class BenchmarkSet:
    version: str
    k: int
    questions: tuple[Question, ...]

    @property
    def normal(self) -> tuple[Question, ...]:
        return tuple(item for item in self.questions if not item.trap)

    @property
    def traps(self) -> tuple[Question, ...]:
        return tuple(item for item in self.questions if item.trap)


def load_benchmark(path: Path, known_ids: Iterable[str], default_k: int = 3) -> BenchmarkSet:
    """Читает вопросы, ловушки и эталоны."""
    path = Path(path)
    if not path.is_file():
        raise BenchmarkError(f"Файл вопросов не найден: {path}")
    try:
        payload: Any = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BenchmarkError(f"Вопросы не читаются как JSON: {error}") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("questions"), list):
        raise BenchmarkError("Файл вопросов должен содержать массив questions.")
    known = set(known_ids)
    questions: list[Question] = []
    seen: set[str] = set()
    for index, raw in enumerate(payload["questions"], start=1):
        questions.append(_question(raw, index, known, seen, trap=False, require_relevant=True))
    for index, raw in enumerate(payload.get("traps", []), start=1):
        questions.append(_question(raw, index, known, seen, trap=True, require_relevant=False))
    k = payload.get("k", default_k)
    if not isinstance(k, int) or k < 1:
        raise BenchmarkError("Поле k должно быть положительным целым числом.")
    if not questions:
        raise BenchmarkError("Benchmark-набор пуст.")
    return BenchmarkSet(
        version=str(payload.get("version", "unknown")), k=k, questions=tuple(questions)
    )


def _question(
    raw: Any,
    index: int,
    known: set[str],
    seen: set[str],
    *,
    trap: bool,
    require_relevant: bool,
) -> Question:
    if not isinstance(raw, dict):
        raise BenchmarkError(f"Вопрос №{index} должен быть объектом.")
    question_id = raw.get("id")
    text = raw.get("question")
    if not isinstance(question_id, str) or not question_id.strip():
        raise BenchmarkError(f"У вопроса №{index} нет ID.")
    if question_id in seen:
        raise BenchmarkError(f"Повторяющийся ID вопроса: {question_id}")
    if not isinstance(text, str) or len(text.strip()) < 8:
        raise BenchmarkError(f"У вопроса {question_id} нет текста.")
    seen.add(question_id)

    relevant_raw = raw.get("relevant", [])
    if require_relevant:
        if not isinstance(relevant_raw, list) or len(relevant_raw) < 3:
            raise BenchmarkError(
                f"У вопроса {question_id} должно быть не менее трёх релевантных документов."
            )
        relevant = tuple(str(item) for item in relevant_raw)
        unknown = [item for item in relevant if item not in known]
        if unknown:
            raise BenchmarkError(
                f"Вопрос {question_id} ссылается на отсутствующие документы: {', '.join(unknown)}"
            )
        reference = raw.get("reference")
        if not isinstance(reference, str) or len(reference.strip()) < 10:
            raise BenchmarkError(f"У вопроса {question_id} нет эталонного ответа.")
        must = raw.get("must")
        if not isinstance(must, list) or not all(
            isinstance(item, str) and item.strip() for item in must
        ):
            raise BenchmarkError(f"У вопроса {question_id} должен быть список must.")
        if not must:
            raise BenchmarkError(f"У вопроса {question_id} пустой список must.")
        return Question(
            id=question_id,
            question=text.strip(),
            relevant=relevant,
            reference=reference.strip(),
            must=tuple(item.strip() for item in must),
        )
    note = raw.get("note", "")
    return Question(
        id=question_id,
        question=text.strip(),
        relevant=(),
        reference=str(note).strip(),
        must=(),
        trap=True,
    )
