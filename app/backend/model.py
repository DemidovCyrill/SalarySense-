"""Доменные правила SalarySense.

Здесь реализованы правила, которые в демо-версии описаны в
``app/frontend/demo/model.mjs``: совпадение с вакансией (matching-v0.1),
зарплатная статистика (salary-v0.1), профиль, попытки и письмо. Числовые
решения принимает код; языковая модель к этим числам не допускается.

Правила перенесены без изменения поведения: те же входы дают те же числа,
что и в демо-API, включая округление половины вверх (``Math.round``).
"""

from __future__ import annotations

import copy
import math
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from typing import Any

from . import catalog

# Москва живёт в UTC+3 круглый год, отдельная база часовых поясов не нужна.
MOSCOW = timezone(timedelta(hours=3))
SCORES = (0.25, 0.5, 0.75, 1.0)
DEFAULT_FILTERS = {"region": catalog.REGIONS[0], "format": catalog.FORMATS[0]}


def portal_date() -> str:
    """Дата в часовом поясе портала, формат ``ГГГГ-ММ-ДД``."""
    return datetime.now(MOSCOW).date().isoformat()


def round_half_up(value: float) -> int:
    """Округляет половину вверх, как ``Math.round`` в демо-API."""
    return math.floor(value + 0.5)


def initial_materials() -> list[dict[str, Any]]:
    """Копия исходного банка критериев и вопросов для новой сессии."""
    return copy.deepcopy(catalog.MATERIALS)


def new_session(sample: bool) -> dict[str, Any]:
    """Новая сессия. Первому посетителю демо достаётся учебный профиль."""
    attempts: list[dict[str, Any]] = []
    if sample:
        for index, check in enumerate(catalog.CHECKS[:2]):
            attempts.append(
                {
                    "id": f"sample-{check['id']}",
                    "checkId": check["id"],
                    "revision": 1,
                    "roleId": check["roleId"],
                    "answers": {},
                    "result": {
                        "date": catalog.SNAPSHOT["date"],
                        "correct": 3 if index == 0 else 2,
                        "total": len(check["questions"]),
                        "areas": [
                            {
                                "name": question["area"],
                                "status": "unknown" if index == 1 and position == 2 else "correct",
                            }
                            for position, question in enumerate(check["questions"])
                        ],
                    },
                }
            )
    return {
        "profile": {
            "roleId": "frontend" if sample else None,
            **DEFAULT_FILTERS,
            "revision": 1,
            "sample": sample,
            "claims": (
                {
                    "html-css": 2,
                    "javascript": 3,
                    "typescript": 2,
                    "react": 2,
                    "api": 1,
                    "git": 2,
                }
                if sample
                else {}
            ),
        },
        "materials": initial_materials(),
        "attempts": attempts,
    }


def check_card(material: dict[str, Any]) -> dict[str, Any]:
    """Публичная карточка проверки без ключей ответов."""
    return {
        "id": material["id"],
        "roleId": material["roleId"],
        "skillId": material["skillId"],
        "topic": material["checkTopic"],
        "title": material["title"],
        "scope": material["topic"],
        "limit": material["limit"],
        "version": f"{material['bankVersion']}-v{material['version']}",
        "source": material["source"],
        "minutes": material["minutes"],
        "count": len(material["questions"]),
    }


def published_checks(session: dict[str, Any]) -> list[dict[str, Any]]:
    """Опубликованные версии банков вопросов текущей сессии."""
    return [
        check_card(item)
        for item in session["materials"]
        if item["type"] == "quiz" and item["status"] == "published"
    ]


def attempt_material(session: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any] | None:
    """Версия банка, закреплённая за попыткой."""
    for item in session["materials"]:
        if (
            item["type"] == "quiz"
            and item["id"] == attempt["checkId"]
            and item["version"] == attempt["revision"]
        ):
            return item
    return None


def public_attempt(session: dict[str, Any], attempt: dict[str, Any]) -> dict[str, Any]:
    """Попытка глазами пользователя: варианты без ключа и сохранённые ответы."""
    material = attempt_material(session, attempt)
    if material is None:
        # Банк вопросов удалён из сессии — попытка остаётся, но без вопросов.
        raise LookupError(f"Материал попытки {attempt['checkId']} не найден")
    return {
        **check_card(material),
        "id": attempt["id"],
        "checkId": material["id"],
        "answers": attempt["answers"],
        "result": attempt["result"],
        "checkState": "complete" if attempt["result"] else "active",
        "returnTo": attempt.get("returnTo"),
        "questions": [
            {"id": index, "text": question["text"], "options": [*question["options"], "Не знаю"]}
            for index, question in enumerate(material["questions"])
        ],
    }


def get_evidence(session: dict[str, Any], role_id: str | None) -> list[dict[str, Any]]:
    """Завершённые проверки роли как доказательства."""
    evidence = []
    for attempt in session["attempts"]:
        if attempt["roleId"] != role_id or not attempt["result"]:
            continue
        card = public_attempt(session, attempt)
        evidence.append(
            {
                "id": card["id"],
                "checkId": card["checkId"],
                "skillId": card["skillId"],
                "topic": card["topic"],
                "scope": card["scope"],
                "title": card["title"],
                "date": card["result"]["date"],
                "source": card["source"],
                "version": card["version"],
                "correct": card["result"]["correct"],
                "total": card["result"]["total"],
            }
        )
    return evidence


def find_matches(
    requirements: Iterable[dict[str, Any]],
    claims: dict[str, int],
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """Покрытие требований: ``profile`` по заявленному и проверенному, ``verified`` только по проверкам."""
    rows = []
    for item in requirements:
        declared = SCORES[claims[item["id"]]] if item["id"] in claims else 0.0
        checked = [
            record
            for record in evidence
            if record["skillId"] == item["id"] and record["topic"] == item["topic"]
        ]
        verified = max(
            [0.0] + [record["correct"] / record["total"] for record in checked if record["total"]]
        )
        rows.append(
            {
                **item,
                "declared": declared,
                "checked": checked,
                "verified": verified,
                "profileShare": min(1.0, max(declared, verified) / item["expected"]),
                "checkedShare": min(1.0, verified / item["expected"]),
            }
        )

    total = sum(row["weight"] for row in rows)
    has_evidence = any(row["declared"] or row["checked"] for row in rows)

    def percent(key: str) -> int | None:
        if not total or not has_evidence:
            return None
        return round_half_up(100 * sum(row[key] * row["weight"] for row in rows) / total)

    return {
        "profile": percent("profileShare"),
        "verified": percent("checkedShare"),
        "gaps": [row["skill"] for row in rows if row["mandatory"] and row["profileShare"] < 1],
        "unknown": [row["skill"] for row in rows if not row["declared"] and not row["checked"]],
        "rows": rows,
        "version": "matching-demo-v0.1",
    }


def salary_stats(offers: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Медиана середины двусторонних вилок и причины исключений (salary-v0.1)."""
    offers = list(offers)
    values: list[float] = []
    counts = {"salary": 0, "missing": 0, "oneSided": 0, "incompatible": 0}
    for offer in offers:
        salary = offer.get("salary")
        if not salary or (not salary.get("min") and not salary.get("max")):
            counts["missing"] += 1
            continue
        counts["salary"] += 1
        if (
            salary.get("currency") != "RUB"
            or salary.get("tax") != "gross"
            or salary.get("period") != "month"
        ):
            counts["incompatible"] += 1
            continue
        if not salary.get("min") or not salary.get("max"):
            counts["oneSided"] += 1
            continue
        values.append((salary["min"] + salary["max"]) / 2)
    values.sort()

    def quantile(share: float) -> int:
        index = (len(values) - 1) * share
        lower = math.floor(index)
        upper = math.ceil(index)
        return round_half_up(values[lower] + (values[upper] - values[lower]) * (index - lower))

    enough = len(values) >= 10
    bins = [
        {"max": 150_000, "label": "до 150"},
        {"max": 180_000, "label": "150–179"},
        {"max": 210_000, "label": "180–209"},
        {"max": 240_000, "label": "210–239"},
        {"max": 270_000, "label": "240–269"},
        {"max": 300_000, "label": "270–299"},
        {"max": math.inf, "label": "300+"},
    ]
    histogram = [
        {
            "label": item["label"],
            "count": sum(
                1
                for value in values
                if value < item["max"] and (position == 0 or value >= bins[position - 1]["max"])
            ),
        }
        for position, item in enumerate(bins)
    ]
    return {
        **counts,
        "total": len(offers),
        "eligible": len(values),
        "minimum": 10,
        "version": "salary-demo-v0.1",
        "median": quantile(0.5) if enough else None,
        "lower": quantile(0.25) if enough else None,
        "upper": quantile(0.75) if enough else None,
        "histogram": histogram if enough else [],
        "currency": "RUB",
        "tax": "gross",
        "period": "month",
    }


def _fits(setting: str, value: str, options: list[str]) -> bool:
    return setting == options[0] or setting == value


def market(
    session: dict[str, Any],
    role_id: str | None,
    filters: dict[str, str],
    mode: str,
) -> dict[str, Any]:
    """Сводка рынка по выбранным условиям. Demo и live не смешиваются."""
    source = {**catalog.SNAPSHOT, "mode": mode}
    accepted = mode == "demo" and catalog.get_role(role_id) is not None
    offers = (
        [
            job
            for job in catalog.VACANCIES
            if job["roleId"] == role_id
            and _fits(filters["region"], job["region"], catalog.REGIONS)
            and _fits(filters["format"], job["format"], catalog.FORMATS)
        ]
        if accepted
        else []
    )
    active = [job for job in offers if job["status"] == "active"]
    frequency: dict[str, dict[str, Any]] = {}
    for job in active:
        for requirement in job["requirements"]:
            item = frequency.setdefault(
                requirement["id"],
                {"id": requirement["id"], "skill": requirement["skill"], "count": 0},
            )
            item["count"] += 1
    evidence = get_evidence(session, role_id)
    jobs = []
    for job in offers:
        summary = {key: value for key, value in job.items() if key != "requirements"}
        jobs.append(
            {
                **summary,
                **job_match(session, job["requirements"], role_id, evidence, detailed=False),
            }
        )
    return {
        "source": source,
        "roleId": role_id,
        "filters": filters,
        "status": "source-unavailable" if mode == "live" else ("ready" if active else "empty"),
        "active": len(active),
        "stale": sum(1 for job in offers if job["status"] == "stale"),
        "archived": sum(1 for job in offers if job["status"] == "archived"),
        "salary": salary_stats(active),
        "requirements": sorted(frequency.values(), key=lambda item: item["count"], reverse=True),
        "jobs": jobs,
    }


def job_match(
    session: dict[str, Any],
    requirements: list[dict[str, Any]],
    role_id: str,
    evidence: list[dict[str, Any]] | None = None,
    detailed: bool = True,
) -> dict[str, Any]:
    """Сравнение требований вакансии с профилем только совпадающей роли."""
    profile = session["profile"]
    if evidence is None:
        evidence = get_evidence(session, role_id)
    same_role = profile["roleId"] == role_id
    result = find_matches(
        requirements,
        profile["claims"] if same_role else {},
        evidence if same_role else [],
    )
    rows = result.pop("rows")
    match = {**result, "rows": rows} if detailed else result
    return {"match": match, "profileRevision": profile["revision"]}


def explanation(job: dict[str, Any], comparison: dict[str, Any]) -> dict[str, Any]:
    """Детерминированный разбор без модели: числа, обязательный пробел, доказательство."""
    match = comparison["match"]
    profile_revision = comparison["profileRevision"]
    if job["id"] == "frontend-3" or job["status"] != "active":
        return {"state": "unavailable"}
    if match["profile"] is None:
        return {"state": "insufficient-context"}
    unique: list[dict[str, Any]] = []
    for row in [
        next((item for item in match["rows"] if item["verified"] > 0), None),
        next(
            (item for item in match["rows"] if item["mandatory"] and item["profileShare"] < 1), None
        ),
    ]:
        if row is not None and all(existing["id"] != row["id"] for existing in unique):
            unique.append(row)
    sources: dict[str, dict[str, Any]] = {}
    sections: list[dict[str, Any]] = []
    for row in unique:
        requirement_id = f"vacancy:{job['id']}:{row['id']}"
        sources[requirement_id] = {
            "id": requirement_id,
            "title": f"Требование вакансии · {row['skill']}",
            "version": job["snapshotVersion"],
            "fragment": row["text"],
        }
        evidence = next((item for item in row["checked"] if item["correct"] > 0), None)
        if evidence:
            sources[evidence["id"]] = {
                "id": evidence["id"],
                "title": f"Результат короткой проверки · {evidence['scope']}",
                "version": evidence["version"],
                "fragment": (
                    f"{evidence['correct']} из {evidence['total']} верных ответов. "
                    f"Источник: {evidence['source']}."
                ),
            }
            sections.append(
                {
                    "text": (
                        f"Часть требования по {row['skill']} покрыта проверкой "
                        f"по теме «{evidence['scope']}»."
                    ),
                    "citationIds": [requirement_id, evidence["id"]],
                }
            )
        elif row["declared"]:
            profile_id = f"profile:{profile_revision}:{row['id']}"
            sources[profile_id] = {
                "id": profile_id,
                "title": "Заявленный опыт",
                "version": f"Профиль v{profile_revision}",
                "fragment": f"Отметка пользователя по навыку «{row['skill']}».",
            }
            sections.append(
                {
                    "text": (
                        f"Опыт по {row['skill']} отмечен в профиле. "
                        "Обязательное требование покрыто частично."
                    ),
                    "citationIds": [requirement_id, profile_id],
                }
            )
        else:
            sections.append(
                {
                    "text": f"По обязательному требованию «{row['skill']}» пока нет сведений в профиле.",
                    "citationIds": [requirement_id],
                }
            )
    if not sections:
        return {"state": "insufficient-context"}
    return {
        "state": "ready",
        "mode": "demo",
        "sections": sections,
        "sources": list(sources.values()),
    }


def public_profile(session: dict[str, Any]) -> dict[str, Any]:
    """Профиль с доказательствами и попытками текущей роли."""
    profile = session["profile"]
    attempts = []
    for attempt in session["attempts"]:
        if attempt["roleId"] != profile["roleId"]:
            continue
        material = attempt_material(session, attempt)
        attempts.append(
            {
                "id": attempt["id"],
                "checkId": attempt["checkId"],
                "complete": bool(attempt["result"]),
                "title": material["title"] if material else None,
                "scope": material["topic"] if material else None,
            }
        )
    return {
        **profile,
        "evidence": get_evidence(session, profile["roleId"]),
        "attempts": attempts,
    }


def make_letter(job: dict[str, Any], session: dict[str, Any], facts: list[str]) -> str:
    """Черновик письма только из выбранных фактов профиля."""
    role = catalog.get_role(job["roleId"])
    if role is None:
        raise LookupError(f"Роль {job['roleId']} отсутствует в каталоге")
    evidence = get_evidence(session, role["id"])
    profile = session["profile"]
    allowed: list[tuple[str, str]] = []
    for skill_id in role["skillIds"]:
        rank = profile["claims"].get(skill_id)
        if isinstance(rank, int) and not isinstance(rank, bool):
            allowed.append(
                (
                    f"claim:{skill_id}",
                    f"Мой заявленный опыт с «{catalog.skill_name(skill_id)}» — {catalog.EXPERIENCE[rank].lower()}.",
                )
            )
    for item in evidence:
        if item["correct"] > 0:
            allowed.append(
                (
                    f"evidence:{item['id']}",
                    f"В короткой проверке по теме «{item['scope']}» я дал(а) {item['correct']} из {item['total']} правильных ответов.",
                )
            )
    paragraphs = (
        [text for fact_id, text in allowed if fact_id in facts]
        if profile["roleId"] == job["roleId"]
        else []
    )
    return "\n\n".join(
        [
            f"Здравствуйте! Меня заинтересовала позиция «{job['title']}» в {job['company']}.",
            *paragraphs,
            "Буду рад(а) обсудить задачи команды и ответить на вопросы.",
        ]
    )
