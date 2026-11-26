"""HTTP-контракт SalarySense.

Маршруты повторяют контракт демо-API из ``spec/tech/frontend.md`` и
``app/frontend/demo/server.mjs``: те же пути, поля и коды ошибок. Отличие —
состояние сессий хранится в SQLite, а вопрос к базе знаний обрабатывает
настоящий RAG-конвейер (BM25 + языковая модель), а не подготовленные ответы.
"""

from __future__ import annotations

import copy
import json
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from . import catalog, model
from .errors import ApiError
from .rag.answer import RagUnavailable
from .rag.llm import LlmUnavailable

logger = logging.getLogger(__name__)

router = APIRouter()

_RETURN_TO = re.compile(r"^#/(?:checks|skills|vacancies/[\w-]+)$")


def _settings(request: Request):
    return request.app.state.settings


def _session(request: Request) -> dict[str, Any]:
    return request.state.session_state


async def read_body(request: Request) -> dict[str, Any]:
    """Читает JSON-объект с ограничением размера и единым сообщением об ошибке."""
    limit = _settings(request).body_limit
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, "Данные запроса слишком большие.")
    raw = await request.body()
    if len(raw) > limit:
        raise ApiError(413, "Данные запроса слишком большие.")
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError(400, "Не удалось прочитать запрос.") from None
    if not isinstance(payload, dict):
        raise ApiError(400, "Не удалось прочитать запрос.")
    return payload


def _public_material(material: dict[str, Any]) -> dict[str, Any]:
    """Версия материала без ключей ответов."""
    result = {key: value for key, value in material.items() if key != "questions"}
    if material.get("questions"):
        result["questions"] = [
            {"text": item["text"], "area": item["area"], "options": item["options"]}
            for item in material["questions"]
        ]
    return result


def _valid_text(value: Any, max_length: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= max_length


def _edit_questions(previous: list[dict[str, Any]], questions: Any) -> list[dict[str, Any]]:
    if not isinstance(questions, list) or len(questions) != len(previous):
        raise ApiError(400, "Число вопросов в версии должно совпадать с исходным банком.")
    updated: list[dict[str, Any]] = []
    for index, item in enumerate(previous):
        question = questions[index] if isinstance(questions[index], dict) else {}
        text, area, options = question.get("text"), question.get("area"), question.get("options")
        if not (_valid_text(text, 800) and _valid_text(area, 160)):
            raise ApiError(400, f"Заполните формулировку и тему вопроса {index + 1}.")
        if (
            not isinstance(options, list)
            or len(options) != len(item["options"])
            or not all(_valid_text(value, 200) for value in options)
        ):
            raise ApiError(400, f"Заполните варианты ответа на вопрос {index + 1}.")
        trimmed = [value.strip() for value in options]
        if len({value.lower() for value in trimmed}) != len(trimmed):
            raise ApiError(400, f"Варианты ответа на вопрос {index + 1} должны различаться.")
        changed = any(value != item["options"][position] for position, value in enumerate(trimmed))
        answer = question.get("answer", "missing")
        if answer is None:
            if changed:
                raise ApiError(400, f"Укажите верный вариант для вопроса {index + 1}.")
            answer = item["answer"]
        elif (
            not isinstance(answer, int)
            or isinstance(answer, bool)
            or not 0 <= answer < len(trimmed)
        ):
            raise ApiError(400, f"Укажите верный вариант для вопроса {index + 1}.")
        updated.append(
            {"text": text.strip(), "area": area.strip(), "options": trimmed, "answer": answer}
        )
    return updated


def _material(session: dict[str, Any], material_id: str, version: Any) -> dict[str, Any]:
    try:
        number = int(version)
    except (TypeError, ValueError):
        raise ApiError(404, "Версия материала не найдена.") from None
    for item in session["materials"]:
        if item["id"] == material_id and item["version"] == number:
            return item
    raise ApiError(404, "Версия материала не найдена.")


def _owned_attempt(session: dict[str, Any], attempt_id: str) -> dict[str, Any]:
    for attempt in session["attempts"]:
        if attempt["id"] == attempt_id:
            return attempt
    raise ApiError(404, "Попытка не найдена в текущем профиле.")


@router.get("/bootstrap")
async def bootstrap(request: Request) -> dict[str, Any]:
    session = _session(request)
    return {
        "profile": model.public_profile(session),
        "directions": catalog.DIRECTIONS,
        "roles": [
            {
                **role,
                "criteria": any(
                    item["roleId"] == role["id"]
                    and item["type"] == "criterion"
                    and item["status"] == "published"
                    for item in session["materials"]
                ),
            }
            for role in catalog.ROLES
        ],
        "levels": catalog.LEVELS,
        "dimensions": catalog.DIMENSIONS,
        "skills": catalog.SKILLS,
        "regions": catalog.REGIONS,
        "formats": catalog.FORMATS,
        "experience": catalog.EXPERIENCE,
        "checks": model.published_checks(session),
        "snapshot": catalog.SNAPSHOT,
        "editor": {"mode": "demo", "available": _settings(request).editor_available},
    }


@router.get("/profile")
async def get_profile(request: Request) -> dict[str, Any]:
    return model.public_profile(_session(request))


@router.patch("/profile")
async def patch_profile(request: Request) -> dict[str, Any]:
    session = _session(request)
    payload = await read_body(request)
    profile = session["profile"]

    if "roleId" in payload and catalog.get_role(payload["roleId"]) is None:
        raise ApiError(400, "Выберите роль из каталога.")
    if "region" in payload and payload["region"] not in catalog.REGIONS:
        raise ApiError(400, "Выберите регион из списка.")
    if "format" in payload and payload["format"] not in catalog.FORMATS:
        raise ApiError(400, "Выберите формат из списка.")

    claim = payload.get("claim")
    if claim is not None:
        if not isinstance(claim, dict):
            raise ApiError(400, "Навык отсутствует в каталоге роли.")
        skill_id, rank = claim.get("id"), claim.get("rank", "missing")
        active_role = catalog.get_role(payload.get("roleId", profile["roleId"]))
        if active_role is None or skill_id not in active_role["skillIds"]:
            raise ApiError(400, "Навык отсутствует в каталоге роли.")
        if rank is not None and (
            not isinstance(rank, int)
            or isinstance(rank, bool)
            or not 0 <= rank < len(catalog.EXPERIENCE)
        ):
            raise ApiError(400, "Выберите опыт из списка.")
        if rank is None:
            profile["claims"].pop(skill_id, None)
        else:
            profile["claims"][skill_id] = rank

    for key in ("roleId", "region", "format"):
        if key in payload:
            profile[key] = payload[key]

    profile["revision"] += 1
    return model.public_profile(session)


@router.delete("/profile")
async def delete_profile(request: Request) -> dict[str, Any]:
    service = request.app.state.sessions
    session_id, state = service.rotate(request)
    request.state.session_id = session_id
    request.state.session_state = state
    request.state.session_new = True
    return model.public_profile(state)


@router.get("/market")
async def get_market(request: Request) -> dict[str, Any]:
    session = _session(request)
    profile = session["profile"]
    role_id = request.query_params.get("roleId")
    if role_id is None:
        role_id = profile["roleId"]
    region = request.query_params.get("region")
    if region is None:
        region = profile["region"]
    work_format = request.query_params.get("format")
    if work_format is None:
        work_format = profile["format"]
    mode = request.query_params.get("mode", "demo")

    if role_id and catalog.get_role(role_id) is None:
        raise ApiError(400, "Роль отсутствует в каталоге.")
    if (
        region not in catalog.REGIONS
        or work_format not in catalog.FORMATS
        or mode not in {"demo", "live"}
    ):
        raise ApiError(400, "Проверьте условия поиска.")
    return model.market(session, role_id, {"region": region, "format": work_format}, mode)


@router.get("/vacancies/{vacancy_id}")
async def get_vacancy(request: Request, vacancy_id: str) -> dict[str, Any]:
    job = catalog.get_vacancy(vacancy_id)
    if job is None:
        raise ApiError(404, "Вакансия не найдена.")
    comparison = model.job_match(_session(request), job["requirements"], job["roleId"])
    return {**job, **comparison, "explanation": model.explanation(job, comparison)}


@router.post("/vacancies/{vacancy_id}/letter")
async def post_letter(request: Request, vacancy_id: str) -> dict[str, Any]:
    job = catalog.get_vacancy(vacancy_id)
    if job is None:
        raise ApiError(404, "Вакансия не найдена.")
    payload = await read_body(request)
    facts = payload.get("facts")
    if not isinstance(facts, list):
        raise ApiError(400, "Выберите факты для письма.")
    return {"text": model.make_letter(job, _session(request), facts)}


@router.get("/criteria/{role_id}")
async def get_criteria(request: Request, role_id: str) -> list[dict[str, Any]]:
    if catalog.get_role(role_id) is None:
        raise ApiError(404, "Роль не найдена.")
    return [
        item
        for item in _session(request)["materials"]
        if item["roleId"] == role_id
        and item["type"] == "criterion"
        and item["status"] == "published"
    ]


@router.post("/checks/{check_id}/attempts")
async def start_attempt(request: Request, check_id: str) -> dict[str, Any]:
    session = _session(request)
    profile = session["profile"]
    role_id = profile["roleId"]
    payload = await read_body(request)
    return_to = payload.get("returnTo")
    if not (isinstance(return_to, str) and _RETURN_TO.fullmatch(return_to)):
        return_to = "#/checks"

    existing = next(
        (
            item
            for item in session["attempts"]
            if item["checkId"] == check_id and item["roleId"] == role_id and not item["result"]
        ),
        None,
    )
    if existing is not None:
        existing["returnTo"] = return_to
        return model.public_attempt(session, existing)

    bank = next(
        (
            item
            for item in session["materials"]
            if item["id"] == check_id
            and item["roleId"] == role_id
            and item["type"] == "quiz"
            and item["status"] == "published"
        ),
        None,
    )
    if bank is None:
        raise ApiError(404, "Проверка для выбранной роли недоступна.")

    attempt = {
        "id": uuid.uuid4().hex,
        "checkId": check_id,
        "roleId": role_id,
        "revision": bank["version"],
        "answers": {},
        "result": None,
        "returnTo": return_to,
    }
    session["attempts"].append(attempt)
    return model.public_attempt(session, attempt)


@router.get("/attempts/{attempt_id}")
async def get_attempt(request: Request, attempt_id: str) -> dict[str, Any]:
    session = _session(request)
    return model.public_attempt(session, _owned_attempt(session, attempt_id))


@router.put("/attempts/{attempt_id}/answers/{index}")
async def put_answer(request: Request, attempt_id: str, index: str) -> dict[str, Any]:
    session = _session(request)
    attempt = _owned_attempt(session, attempt_id)
    if attempt["result"]:
        raise ApiError(409, "Попытка уже завершена.")
    payload = await read_body(request)
    position = _index(index)
    material = model.attempt_material(session, attempt)
    questions = material["questions"] if material else []
    question = questions[position] if 0 <= position < len(questions) else None
    option = payload.get("option", "missing")
    if (
        question is None
        or not isinstance(option, int)
        or isinstance(option, bool)
        or not 0 <= option <= len(question["options"])
    ):
        raise ApiError(400, "Выберите ответ из списка.")
    attempt["answers"][position] = option
    return model.public_attempt(session, attempt)


@router.post("/attempts/{attempt_id}/finish")
async def finish_attempt(request: Request, attempt_id: str) -> dict[str, Any]:
    session = _session(request)
    attempt = _owned_attempt(session, attempt_id)
    material = model.attempt_material(session, attempt)
    if material is None:
        raise ApiError(409, "Версия банка вопросов недоступна.")
    questions = material["questions"]
    if not attempt["result"]:
        if len(attempt["answers"]) != len(questions):
            raise ApiError(409, "Ответьте на все вопросы или выберите «Не знаю».")
        areas = []
        for position, question in enumerate(questions):
            answer = attempt["answers"].get(position)
            if answer == question["answer"]:
                status = "correct"
            elif answer == len(question["options"]):
                status = "unknown"
            else:
                status = "incorrect"
            areas.append({"name": question["area"], "status": status})
        attempt["result"] = {
            "date": model.portal_date(),
            "total": len(questions),
            "correct": sum(1 for area in areas if area["status"] == "correct"),
            "areas": areas,
        }
        session["profile"]["revision"] += 1
    return {**model.public_attempt(session, attempt), "profile": model.public_profile(session)}


@router.get("/editor/materials")
async def editor_materials(request: Request) -> list[dict[str, Any]]:
    return [_public_material(item) for item in _session(request)["materials"]]


@router.post("/editor/materials/{material_id}/{version}/fork")
async def fork_material(request: Request, material_id: str, version: str) -> dict[str, Any]:
    session = _session(request)
    material = _material(session, material_id, version)
    if material["status"] not in {"published", "retired"}:
        raise ApiError(409, "Новая версия доступна после публикации материала.")
    if any(
        item["id"] == material_id and item["status"] in {"draft", "review"}
        for item in session["materials"]
    ):
        raise ApiError(409, "У материала уже есть версия в работе.")
    following = (
        max(item["version"] for item in session["materials"] if item["id"] == material_id) + 1
    )
    draft = {
        **copy.deepcopy(material),
        "version": following,
        "status": "draft",
        "date": model.portal_date(),
    }
    session["materials"].append(draft)
    return _public_material(draft)


@router.patch("/editor/materials/{material_id}/{version}")
async def patch_material(request: Request, material_id: str, version: str) -> dict[str, Any]:
    session = _session(request)
    material = _material(session, material_id, version)
    if material["status"] != "draft":
        raise ApiError(409, "Редактировать можно только черновик материала.")
    payload = await read_body(request)
    if not (_valid_text(payload.get("source"), 1000) and _valid_text(payload.get("rights"), 1000)):
        raise ApiError(400, "Заполните источник и права, до 1000 символов в каждом поле.")
    if material["type"] == "quiz":
        material["questions"] = _edit_questions(material["questions"], payload.get("questions"))
    else:
        texts = payload.get("texts")
        values = [
            texts[index] if isinstance(texts, list) and index < len(texts) else None
            for index in range(len(catalog.DIMENSIONS))
        ]
        if not all(_valid_text(value, 1000) for value in values):
            raise ApiError(400, "Заполните все критерии, до 1000 символов в каждом поле.")
        material["content"] = [
            {"dimension": dimension, "text": value.strip()}
            for dimension, value in zip(catalog.DIMENSIONS, values, strict=True)
        ]
    material["source"] = payload["source"].strip()
    material["rights"] = payload["rights"].strip()
    material["date"] = model.portal_date()
    return _public_material(material)


@router.post("/editor/materials/{material_id}/{version}/status")
async def material_status(request: Request, material_id: str, version: str) -> dict[str, Any]:
    session = _session(request)
    material = _material(session, material_id, version)
    payload = await read_body(request)
    target = payload.get("status")
    transitions = {
        "draft": {"review"},
        "review": {"published", "draft"},
        "published": {"retired"},
    }
    if target not in transitions.get(material["status"], set()):
        raise ApiError(409, "Этот переход недоступен.")
    if target == "published":
        for prior in session["materials"]:
            if prior["id"] == material_id and prior["status"] == "published":
                prior["status"] = "retired"
    material["status"] = target
    if target != "retired":
        material["date"] = model.portal_date()
    return _public_material(material)


def _index(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ApiError(400, "Выберите ответ из списка.") from None


async def ask(request: Request) -> dict[str, Any]:
    """Вопрос базе знаний: поиск BM25, ответ модели и источники."""
    payload = await read_body(request)
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip() or len(question) > 600:
        raise ApiError(400, "Введи вопрос до 600 символов.")
    service = request.app.state.rag
    try:
        return await run_in_threadpool(service.answer, question.strip())
    except RagUnavailable:
        logger.warning("ask: корпус базы знаний недоступен")
        raise ApiError(503, "База знаний недоступна. Попробуйте ещё раз.") from None
    except LlmUnavailable as error:
        logger.warning("ask: модель недоступна (%s)", error)
        raise ApiError(503, "Модель временно недоступна. Попробуйте ещё раз.") from None


async def ask_get() -> None:
    """Вопрос базе знаний принимается только методом POST."""
    raise ApiError(405, "Для вопроса используется POST.")


async def health() -> dict[str, str]:
    """Техническая проверка живости процесса."""
    return {"status": "ok"}
