"""Вспомогательные объекты тестов: общий тестовый корпус и подмена модели."""

from __future__ import annotations

from app.backend.rag.llm import LlmReply

CORPUS = {
    "version": "test-corpus-1",
    "created": "2026-11-27",
    "documents": [
        {
            "id": "D01",
            "title": "Результат короткой проверки",
            "text": "Короткая проверка подтверждает знание конкретной темы, показывает дату и версию, но не заменяет рабочий опыт.",
            "source": {"doc": "spec/product/product.md", "section": "FR06"},
        },
        {
            "id": "D02",
            "title": "Совпадение с вакансией",
            "text": "Совпадение с вакансией считается по формуле с весами и уровнями требований; обязательный пробел показывается отдельно.",
            "source": {"doc": "spec/tech/architecture.md", "section": "Расчёт совпадения"},
        },
        {
            "id": "D03",
            "title": "Медиана зарплат",
            "text": "Медиана зарплат считается по серединам двусторонних вилок в рублях за месяц до налогов.",
            "source": {"doc": "spec/tech/architecture.md", "section": "Расчёт зарплат"},
        },
        {
            "id": "D04",
            "title": "Сроки хранения",
            "text": "Сроки хранения резервных копий и логов согласуют до запуска, конкретное значение пока не установлено.",
            "source": {"doc": "spec/tech/architecture.md", "section": "Доступ"},
        },
    ],
}


class FakeClient:
    """Подмена OpenRouter: отдаёт заранее заданные ответы и помнит вызовы."""

    def __init__(self, replies: list[str], error: Exception | None = None) -> None:
        self.replies = list(replies)
        self.error = error
        self.calls: list[list[dict[str, str]]] = []

    def complete(self, messages: list[dict[str, str]], temperature: float = 0.0) -> LlmReply:
        self.calls.append(messages)
        if self.error is not None:
            raise self.error
        if not self.replies:
            raise AssertionError("FakeClient: закончились подготовленные ответы")
        return LlmReply(
            text=self.replies.pop(0),
            model="fake/model",
            prompt_tokens=10,
            completion_tokens=5,
            latency_ms=1,
        )
