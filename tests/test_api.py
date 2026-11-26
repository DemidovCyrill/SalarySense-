"""Проверки HTTP-контракта ``/api/v1``.

Сценарии повторяют проверки демо-API из ``tests/frontend-smoke.test.mjs``,
но выполняются на Python-бэкенде с постоянным хранилищем сессий.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.backend import model
from app.backend.config import Settings
from app.backend.server import create_app
from app.backend.store import SessionStore


def test_bootstrap_gives_sample_profile_and_catalog(client: TestClient) -> None:
    payload = client.get("/api/v1/bootstrap").json()
    assert payload["profile"]["roleId"] == "frontend"
    assert len(payload["roles"]) == 11
    assert len(payload["checks"]) == 5
    assert payload["checks"][0]["id"] == "frontend-js"
    assert payload["editor"] == {"mode": "demo", "available": True}
    assert any(role["criteria"] for role in payload["roles"])
    assert payload["profile"]["evidence"][0]["correct"] == 3


def test_session_cookie_is_httponly(client: TestClient) -> None:
    response = client.get("/api/v1/profile")
    cookie = response.headers.get("set-cookie", "")
    assert "salarysense_session=" in cookie
    assert "HttpOnly" in cookie
    assert "samesite=strict" in cookie.lower()


def test_market_and_modes(client: TestClient) -> None:
    market = client.get("/api/v1/market?roleId=frontend").json()
    assert (market["active"], market["stale"], market["archived"]) == (22, 1, 1)
    assert market["salary"]["median"] == 230_000
    assert market["salary"]["eligible"] == 19
    assert market["status"] == "ready"
    assert (
        client.get("/api/v1/market?roleId=frontend&mode=live").json()["status"]
        == "source-unavailable"
    )
    assert client.get("/api/v1/market?roleId=qa").json()["salary"]["median"] is None
    assert client.get("/api/v1/market?roleId=unknown").status_code == 400


def test_vacancy_comparison_and_explanation(client: TestClient) -> None:
    vacancy = client.get("/api/v1/vacancies/frontend-1").json()
    assert vacancy["match"]["profile"] == 68
    assert vacancy["match"]["verified"] == 50
    explanation = vacancy["explanation"]
    assert explanation["state"] == "ready"
    source_ids = {source["id"] for source in explanation["sources"]}
    for section in explanation["sections"]:
        assert all(citation in source_ids for citation in section["citationIds"])
    assert client.get("/api/v1/vacancies/frontend-3").json()["explanation"] == {
        "state": "unavailable"
    }
    assert client.get("/api/v1/vacancies/nope").status_code == 404


def test_profile_claim_validation(client: TestClient) -> None:
    assert client.patch("/api/v1/profile", json={"roleId": "nope"}).status_code == 400
    assert client.patch("/api/v1/profile", json={"region": "Луна"}).status_code == 400
    assert (
        client.patch("/api/v1/profile", json={"claim": {"id": "sql", "rank": 0}}).status_code == 400
    )
    result = client.patch(
        "/api/v1/profile", json={"roleId": "qa", "claim": {"id": "sql", "rank": 0}}
    ).json()
    assert result["claims"]["sql"] == 0
    assert result["evidence"] == []
    removed = client.patch("/api/v1/profile", json={"claim": {"id": "sql", "rank": None}}).json()
    assert "sql" not in removed["claims"]


def test_attempts_finish_and_privacy(client: TestClient) -> None:
    client.patch("/api/v1/profile", json={"roleId": "qa", "claim": {"id": "sql", "rank": 0}})
    attempt = client.post("/api/v1/checks/qa-sql/attempts", json={"returnTo": "#/skills"}).json()
    path = f"/api/v1/attempts/{attempt['id']}"
    assert attempt["returnTo"] == "#/skills"
    assert attempt["count"] == 3
    assert all("answer" not in question for question in attempt["questions"])

    other = TestClient(client.app)
    assert other.get(path).status_code == 404
    assert client.post(path + "/finish").status_code == 409

    for index, option in enumerate([4, 2, 0]):
        saved = client.put(f"{path}/answers/{index}", json={"option": option})
        assert saved.status_code == 200
        assert saved.json()["answers"][str(index)] == option

    completed = client.post(path + "/finish").json()
    assert completed["result"]["correct"] == 2
    assert [area["status"] for area in completed["result"]["areas"]] == [
        "unknown",
        "correct",
        "correct",
    ]
    assert completed["profile"]["revision"] == 3
    again = client.post(path + "/finish").json()
    assert again["result"] == completed["result"]


def test_editor_versions_do_not_rewrite_started_attempt(client: TestClient) -> None:
    client.patch("/api/v1/profile", json={"roleId": "qa", "claim": {"id": "sql", "rank": 0}})
    attempt = client.post("/api/v1/checks/qa-sql/attempts", json={}).json()
    path = f"/api/v1/attempts/{attempt['id']}"

    draft = client.post("/api/v1/editor/materials/qa-sql/1/fork").json()
    assert draft["version"] == 2
    assert all("answer" not in question for question in draft["questions"])

    questions = [{**question, "answer": None} for question in draft["questions"]]
    questions[0] = {
        **questions[0],
        "text": "Какой вариант выберет эту строку?",
        "options": ["Новый вариант", *questions[0]["options"][1:]],
    }
    body = {"source": draft["source"], "rights": draft["rights"], "questions": questions}
    assert client.patch("/api/v1/editor/materials/qa-sql/2", json=body).status_code == 400

    questions[0]["answer"] = 0
    assert client.patch("/api/v1/editor/materials/qa-sql/2", json=body).status_code == 200
    assert (
        client.post(
            "/api/v1/editor/materials/qa-sql/2/status", json={"status": "review"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/editor/materials/qa-sql/2/status", json={"status": "published"}
        ).status_code
        == 200
    )

    stored = client.get(path).json()
    assert stored["questions"][0]["text"] == attempt["questions"][0]["text"]

    for index, option in enumerate([4, 2, 0]):
        client.put(f"{path}/answers/{index}", json={"option": option})
    client.post(path + "/finish")

    following = client.post("/api/v1/checks/qa-sql/attempts", json={}).json()
    assert following["version"] != attempt["version"]
    assert following["questions"][0]["text"] == "Какой вариант выберет эту строку?"


def test_editor_rejects_invalid_transitions(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/editor/materials/qa-sql/1/status", json={"status": "review"}
        ).status_code
        == 409
    )
    assert client.get("/api/v1/editor/materials").status_code == 200
    materials = client.get("/api/v1/editor/materials").json()
    assert all(
        "answer" not in question for item in materials for question in item.get("questions", [])
    )
    assert client.get("/api/v1/criteria/frontend").json()[0]["type"] == "criterion"
    assert client.get("/api/v1/criteria/nope").status_code == 404


def test_letter_and_criteria(client: TestClient) -> None:
    letter = client.post(
        "/api/v1/vacancies/frontend-1/letter",
        json={"facts": ["claim:javascript", "evidence:sample-frontend-js"]},
    ).json()
    assert "JavaScript" in letter["text"]
    assert "3 из 3" in letter["text"]
    assert client.post("/api/v1/vacancies/frontend-1/letter", json={}).status_code == 400


def test_delete_profile_starts_empty_session(client: TestClient) -> None:
    attempt = client.post(
        "/api/v1/checks/frontend-js/attempts", json={"returnTo": "#/checks"}
    ).json()
    assert client.delete("/api/v1/profile").json()["roleId"] is None
    assert client.get("/api/v1/profile").json()["claims"] == {}
    assert client.get(f"/api/v1/attempts/{attempt['id']}").status_code == 404


def test_cross_origin_and_limits(client: TestClient) -> None:
    assert (
        client.get("/api/v1/bootstrap", headers={"Origin": "https://evil.example"}).status_code
        == 403
    )
    assert (
        client.get("/api/v1/bootstrap", headers={"Origin": "http://testserver"}).status_code == 200
    )
    assert (
        client.patch(
            "/api/v1/profile",
            content=b"{" + b"x" * 25_000,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )
    assert (
        client.patch(
            "/api/v1/profile", content=b"{", headers={"Content-Type": "application/json"}
        ).status_code
        == 400
    )
    assert client.get("/api/v1/unknown").status_code == 404
    assert client.get("/api/v1/unknown").json()["message"] == "Действие недоступно."
    assert client.get("/ask").status_code == 405
    assert client.get("/health").json() == {"status": "ok"}


def test_sessions_survive_store_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "sessions.sqlite3"
    store = SessionStore(path)
    state = model.new_session(True)
    state["attempts"][0]["answers"] = {0: 2, 2: 4}
    store.save("a" * 32, state)
    loaded = store.get("a" * 32)
    assert loaded is not None
    assert loaded["attempts"][0]["answers"] == {0: 2, 2: 4}
    store.delete("a" * 32)
    assert store.get("a" * 32) is None


def test_profile_persists_between_app_instances(tmp_path: Path) -> None:
    settings = Settings(
        database_path=tmp_path / "shared.sqlite3",
        static_dir=tmp_path / "no-static",
        llm_api_key="test",
    )
    with TestClient(create_app(settings)) as first:
        first.patch("/api/v1/profile", json={"roleId": "qa"})
        cookie = first.cookies.get(settings.cookie_name)

    with TestClient(create_app(settings)) as second:
        second.cookies.set(settings.cookie_name, cookie)
        assert second.get("/api/v1/profile").json()["roleId"] == "qa"
