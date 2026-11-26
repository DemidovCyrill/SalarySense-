"""Общие фикстуры тестов бэкенда.

Тесты не обращаются к сети: ответы модели подменяются ``FakeClient``, а
состояние сессий живёт во временном SQLite-файле.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.server import create_app
from tests.support import CORPUS, FakeClient

__all__ = ["CORPUS", "FakeClient"]


@pytest.fixture
def vector_corpus_path(tmp_path: Path) -> Path:
    """Небольшой корпус для проверки RAG без настоящих 30 документов."""
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps(CORPUS, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_path=tmp_path / "salarysense.sqlite3",
        static_dir=tmp_path / "no-static",
        llm_api_key="test-key",
        llm_model="fake/model",
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
