"""Проверки RAG-конвейера и обработчика ``POST /ask``."""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.backend.config import Settings
from app.backend.rag.answer import REFUSAL, RagService, cited_ids
from app.backend.rag.llm import LlmUnavailable
from app.backend.server import create_app
from tests.support import CORPUS, FakeClient


def make_service(
    settings: Settings, corpus_path: Path, replies: list[str]
) -> tuple[RagService, FakeClient]:
    fake = FakeClient(replies)
    return RagService(settings, corpus_path=corpus_path, client=fake), fake


def test_grounded_answer_returns_cited_sources(
    settings: Settings, vector_corpus_path: Path
) -> None:
    service, fake = make_service(
        settings, vector_corpus_path, ["Короткая проверка подтверждает тему [D01]."]
    )
    result = service.answer("Что подтверждает короткая проверка?")
    assert result["answer"] == "Короткая проверка подтверждает тему [D01]."
    assert [source["id"] for source in result["sources"]] == ["D01"]
    assert result["sources"][0]["fragment"] == CORPUS["documents"][0]["text"]
    assert result["sources"][0]["title"] == CORPUS["documents"][0]["title"]
    assert "Фрагменты:" in fake.calls[0][1]["content"]
    assert len(fake.calls) == 1


def test_refusal_has_no_sources(settings: Settings, vector_corpus_path: Path) -> None:
    service, _ = make_service(settings, vector_corpus_path, [REFUSAL])
    assert service.answer("Что подтверждает короткая проверка?") == {
        "answer": REFUSAL,
        "sources": [],
    }


def test_missing_citation_is_retried_once(settings: Settings, vector_corpus_path: Path) -> None:
    service, fake = make_service(
        settings, vector_corpus_path, ["Ответ без ссылок.", "Короткая проверка [D01]."]
    )
    result = service.answer("Что подтверждает короткая проверка?")
    assert [source["id"] for source in result["sources"]] == ["D01"]
    assert len(fake.calls) == 2
    assert any("хотя бы одну ссылку" in message["content"] for message in fake.calls[1])


def test_ungrounded_answer_becomes_refusal(settings: Settings, vector_corpus_path: Path) -> None:
    service, fake = make_service(
        settings, vector_corpus_path, ["Просто ответ.", "И снова без ссылок."]
    )
    assert service.answer("Что подтверждает короткая проверка?") == {
        "answer": REFUSAL,
        "sources": [],
    }
    assert len(fake.calls) == 2


def test_unknown_citation_is_not_a_source(settings: Settings, vector_corpus_path: Path) -> None:
    service, _ = make_service(settings, vector_corpus_path, ["Факт [Z99].", "Факт [Z99][D01]."])
    result = service.answer("Что подтверждает короткая проверка?")
    assert [source["id"] for source in result["sources"]] == ["D01"]


def test_low_score_threshold_skips_model(settings: Settings, vector_corpus_path: Path) -> None:
    strict = dataclasses.replace(settings, rag_min_score=1000)
    service, fake = make_service(strict, vector_corpus_path, ["Не должен вызываться."])
    assert service.answer("Что подтверждает короткая проверка?")["sources"] == []
    assert fake.calls == []


def test_model_failure_is_reported(settings: Settings, vector_corpus_path: Path) -> None:
    service = RagService(
        settings,
        corpus_path=vector_corpus_path,
        client=FakeClient([], error=LlmUnavailable("модель упала")),
    )
    with pytest.raises(LlmUnavailable):
        service.answer("Что подтверждает короткая проверка?")


def test_citation_order_and_deduplication(settings: Settings, vector_corpus_path: Path) -> None:
    service, _ = make_service(
        settings, vector_corpus_path, ["Медиана [D03], совпадение [D02], снова [D03]."]
    )
    sources = service.answer("Как считается совпадение и медиана?")["sources"]
    assert [source["id"] for source in sources] == ["D03", "D02"]


def test_cited_ids_parsing() -> None:
    allowed = {"D01", "D02"}
    assert cited_ids("[D01, D02] и [D02]", allowed) == ["D01", "D02"]
    assert cited_ids("без ссылок", allowed) == []


def ask_app(settings: Settings, corpus_path: Path, replies: list[str]):
    fake = FakeClient(replies)
    rag = RagService(settings, corpus_path=corpus_path, client=fake)
    return create_app(settings, rag=rag), fake


def test_ask_endpoint_contract(settings: Settings, vector_corpus_path: Path) -> None:
    app, _ = ask_app(settings, vector_corpus_path, ["Короткая проверка подтверждает тему [D01]."])
    with TestClient(app) as client:
        response = client.post("/ask", json={"question": "Что подтверждает короткая проверка?"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["sources"][0]["id"] == "D01"
        assert set(payload) == {"answer", "sources"}
        assert client.post("/ask", json={"question": " "}).status_code == 400
        assert client.post("/ask", json={"question": "а" * 601}).status_code == 400
        assert client.get("/ask").status_code == 405
        refusal_app, _ = ask_app(settings, vector_corpus_path, [REFUSAL])
    with TestClient(refusal_app) as client:
        response = client.post("/ask", json={"question": "Сколько лун у Юпитера?"})
        assert response.status_code == 200
        assert response.json() == {"answer": REFUSAL, "sources": []}


def test_ask_without_key_returns_503(settings: Settings, vector_corpus_path: Path) -> None:
    no_key = dataclasses.replace(settings, llm_api_key="")
    rag = RagService(no_key, corpus_path=vector_corpus_path)
    app = create_app(no_key, rag=rag)
    with TestClient(app) as client:
        response = client.post("/ask", json={"question": "Что подтверждает проверка?"})
        assert response.status_code == 503
        assert "ключ" not in response.json()["message"].lower()


def test_ask_model_failure_returns_503(settings: Settings, vector_corpus_path: Path) -> None:
    rag = RagService(
        settings,
        corpus_path=vector_corpus_path,
        client=FakeClient([], error=LlmUnavailable("boom")),
    )
    app = create_app(settings, rag=rag)
    with TestClient(app) as client:
        response = client.post("/ask", json={"question": "Что подтверждает проверка?"})
        assert response.status_code == 503
        assert response.json()["message"] == "Модель временно недоступна. Попробуйте ещё раз."


def test_corpus_file_is_required(settings: Settings, tmp_path: Path) -> None:
    rag = RagService(settings, corpus_path=tmp_path / "missing.json", client=FakeClient([REFUSAL]))
    app = create_app(settings, rag=rag)
    with TestClient(app) as client:
        response = client.post("/ask", json={"question": "Что подтверждает проверка?"})
        assert response.status_code == 503


def test_corpus_path_and_prompt_come_from_settings(
    settings: Settings, vector_corpus_path: Path
) -> None:
    custom = dataclasses.replace(
        settings,
        corpus_path=vector_corpus_path,
        rag_prompt="neutral",
    )
    fake = FakeClient(["Короткая проверка подтверждает тему [D01]."])
    service = RagService(custom, client=fake)
    result = service.answer("Что подтверждает короткая проверка?")
    assert result["sources"][0]["id"] == "D01"
    system_message = fake.calls[0][0]["content"]
    assert "ассистент базы знаний" in system_message
    assert "SalarySense" not in system_message


def test_grounded_answer_meta(settings: Settings, vector_corpus_path: Path) -> None:
    service, _ = make_service(settings, vector_corpus_path, ["Тема [D01]."])
    trace = service.answer_with_trace("Что подтверждает короткая проверка?")
    assert trace.model == "fake/model"
    assert trace.prompt_version
    assert trace.citations == ["D01"]
    assert json.dumps(trace.sources, ensure_ascii=False)
