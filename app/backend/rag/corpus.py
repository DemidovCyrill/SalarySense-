"""Загрузка корпуса базы знаний.

Корпус — 30 проверенных фрагментов о правилах SalarySense. Формат и
требования к данным описаны в ``spec/tech/rag.md`` и ``spec/tech/backend.md``.
Загрузчик проверяет структуру до индексирования: повторяющийся ID или пустой
текст должны остановить сборку индекса, а не тихо испортить поиск.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .bm25 import Document


class CorpusError(Exception):
    """Корпус отсутствует или не соответствует формату."""


@dataclass(frozen=True)
class Corpus:
    version: str
    created: str
    documents: tuple[Document, ...]
    path: Path

    def by_id(self) -> dict[str, Document]:
        return {document.id: document for document in self.documents}


def load_corpus(path: Path) -> Corpus:
    """Читает и проверяет JSON-корпус."""
    path = Path(path)
    if not path.is_file():
        raise CorpusError(f"Файл корпуса не найден: {path}")
    try:
        payload: Any = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CorpusError(f"Корпус не читается как JSON: {error}") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("documents"), list):
        raise CorpusError("Корпус должен содержать массив documents.")
    documents: list[Document] = []
    seen: set[str] = set()
    for position, raw in enumerate(payload["documents"], start=1):
        if not isinstance(raw, dict):
            raise CorpusError(f"Документ №{position} должен быть объектом.")
        doc_id = raw.get("id")
        title = raw.get("title")
        text = raw.get("text")
        source = raw.get("source", {})
        if not isinstance(doc_id, str) or not doc_id.strip():
            raise CorpusError(f"У документа №{position} нет ID.")
        if doc_id in seen:
            raise CorpusError(f"Повторяющийся ID документа: {doc_id}")
        if not isinstance(title, str) or not title.strip():
            raise CorpusError(f"У документа {doc_id} нет заголовка.")
        if not isinstance(text, str) or len(text.strip()) < 20:
            raise CorpusError(f"Текст документа {doc_id} слишком короткий.")
        if not isinstance(source, dict):
            raise CorpusError(f"Поле source документа {doc_id} должно быть объектом.")
        seen.add(doc_id)
        documents.append(
            Document(
                id=doc_id,
                title=title.strip(),
                text=text.strip(),
                source={str(key): str(value) for key, value in source.items()},
            )
        )
    if not documents:
        raise CorpusError("Корпус не содержит документов.")
    return Corpus(
        version=str(payload.get("version", "unknown")),
        created=str(payload.get("created", "")),
        documents=tuple(documents),
        path=path,
    )
