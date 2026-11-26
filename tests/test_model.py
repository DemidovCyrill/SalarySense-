"""Проверки доменных правил: совпадение, зарплаты, рынок, письмо."""

from __future__ import annotations

from app.backend import catalog, model


def test_matching_example_from_architecture() -> None:
    requirements = [
        {
            "id": "java",
            "topic": "core",
            "weight": 3,
            "expected": 1,
            "mandatory": True,
            "skill": "Java",
        },
        {
            "id": "api",
            "topic": "rest",
            "weight": 3,
            "expected": 1,
            "mandatory": False,
            "skill": "API",
        },
        {
            "id": "sql",
            "topic": "design",
            "weight": 2,
            "expected": 1,
            "mandatory": False,
            "skill": "SQL",
        },
        {
            "id": "ci",
            "topic": "general",
            "weight": 2,
            "expected": 1,
            "mandatory": False,
            "skill": "CI",
        },
    ]
    evidence = [
        {"skillId": "java", "topic": "core", "correct": 3, "total": 3},
        {"skillId": "api", "topic": "rest", "correct": 1, "total": 2},
        {"skillId": "sql", "topic": "joins", "correct": 3, "total": 3},
    ]
    result = model.find_matches(requirements, {"java": 3, "api": 2, "sql": 1}, evidence)
    assert (result["profile"], result["verified"]) == (63, 45)
    assert result["rows"][2]["checked"] == []
    assert model.find_matches([], {}, [])["profile"] is None


def test_rounding_matches_portal() -> None:
    assert model.round_half_up(62.5) == 63
    assert model.round_half_up(2.5) == 3
    assert model.round_half_up(0.4) == 0


def test_salary_statistics_exclusions_and_threshold() -> None:
    offers = [
        {
            "salary": {
                "min": 100_000,
                "max": 200_000,
                "currency": "RUB",
                "tax": "gross",
                "period": "month",
            }
        }
        for _ in range(9)
    ]
    offers.append(
        {
            "salary": {
                "min": 100_000,
                "max": 300_000,
                "currency": "RUB",
                "tax": "gross",
                "period": "month",
            }
        }
    )
    offers.append(
        {
            "salary": {
                "min": 100_000,
                "max": None,
                "currency": "RUB",
                "tax": "gross",
                "period": "month",
            }
        }
    )
    offers.append(
        {
            "salary": {
                "min": 100_000,
                "max": 200_000,
                "currency": "RUB",
                "tax": "net",
                "period": "month",
            }
        }
    )
    offers.append({"salary": None})
    result = model.salary_stats(offers)
    assert result["total"] == 13
    assert result["salary"] == 12
    assert result["missing"] == 1
    assert result["oneSided"] == 1
    assert result["incompatible"] == 1
    assert result["eligible"] == 10
    assert result["median"] == 150_000
    assert result["minimum"] == 10


def test_salary_threshold_returns_no_aggregate() -> None:
    offers = [
        {
            "salary": {
                "min": 100_000,
                "max": 200_000,
                "currency": "RUB",
                "tax": "gross",
                "period": "month",
            }
        }
        for _ in range(9)
    ]
    result = model.salary_stats(offers)
    assert result["eligible"] == 9
    assert result["median"] is None
    assert result["histogram"] == []


def test_market_counts_match_demo_api() -> None:
    session = model.new_session(True)
    result = model.market(session, "frontend", dict(model.DEFAULT_FILTERS), "demo")
    assert (result["active"], result["stale"], result["archived"]) == (22, 1, 1)
    assert result["salary"]["median"] == 230_000
    assert result["salary"]["eligible"] == 19
    assert len(result["jobs"]) == 24
    assert result["status"] == "ready"
    assert "requirements" not in result["jobs"][0]


def test_live_mode_never_substitutes_demo_data() -> None:
    session = model.new_session(True)
    result = model.market(session, "frontend", dict(model.DEFAULT_FILTERS), "live")
    assert result["status"] == "source-unavailable"
    assert result["jobs"] == []
    assert result["salary"]["total"] == 0


def test_vacancy_explanation_citations_resolve() -> None:
    session = model.new_session(True)
    job = catalog.get_vacancy("frontend-1")
    comparison = model.job_match(session, job["requirements"], job["roleId"])
    explanation = model.explanation(job, comparison)
    assert explanation["state"] == "ready"
    source_ids = {source["id"] for source in explanation["sources"]}
    for section in explanation["sections"]:
        assert section["citationIds"]
        assert all(citation in source_ids for citation in section["citationIds"])


def test_unavailable_explanation_for_archived_and_special_vacancy() -> None:
    session = model.new_session(True)
    for vacancy_id in ("frontend-3", "frontend-23"):
        job = catalog.get_vacancy(vacancy_id)
        comparison = model.job_match(session, job["requirements"], job["roleId"])
        assert model.explanation(job, comparison) == {"state": "unavailable"}


def test_letter_uses_only_selected_profile_facts() -> None:
    session = model.new_session(True)
    job = catalog.get_vacancy("frontend-1")
    text = model.make_letter(job, session, ["claim:javascript", "evidence:sample-frontend-js"])
    assert "Меня заинтересовала позиция" in text
    assert "JavaScript" in text
    assert "3 из 3" in text
    assert "Заявленный опыт с «React»" not in text


def test_letter_from_other_role_has_no_profile_paragraphs() -> None:
    session = model.new_session(True)
    job = catalog.get_vacancy("qa-1")
    text = model.make_letter(job, session, ["claim:javascript"])
    assert "JavaScript" not in text
    assert text.split("\n\n")[0].startswith("Здравствуйте!")
