"""Каталог SalarySense: роли, навыки, вакансии и исходные материалы.

Данные выгружены из демонстрационных фикстур фронтенда скриптом
``tools/export_catalog.mjs`` в ``app/backend/data/catalog.json``. Это
серверные данные: ключи ответов квизов остаются здесь и не попадают в
публичные ответы API.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
CATALOG_PATH = DATA_DIR / "catalog.json"

_CATALOG: dict[str, Any] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

META: dict[str, Any] = _CATALOG["meta"]
SNAPSHOT: dict[str, Any] = _CATALOG["snapshot"]
REGIONS: list[str] = _CATALOG["regions"]
FORMATS: list[str] = _CATALOG["formats"]
LEVELS: list[str] = _CATALOG["levels"]
DIMENSIONS: list[str] = _CATALOG["dimensions"]
EXPERIENCE: list[str] = _CATALOG["experience"]
SKILLS: dict[str, dict[str, Any]] = _CATALOG["skills"]
DIRECTIONS: list[dict[str, Any]] = _CATALOG["directions"]
ROLES: list[dict[str, Any]] = _CATALOG["roles"]
VACANCIES: list[dict[str, Any]] = _CATALOG["vacancies"]
CHECKS: list[dict[str, Any]] = _CATALOG["checks"]
MATERIALS: list[dict[str, Any]] = _CATALOG["materials"]

_ROLES_BY_ID = {item["id"]: item for item in ROLES}
_VACANCIES_BY_ID = {item["id"]: item for item in VACANCIES}


def get_role(role_id: str | None) -> dict[str, Any] | None:
    """Роль по устойчивому ID или ``None``."""
    return _ROLES_BY_ID.get(role_id) if role_id else None


def get_vacancy(vacancy_id: str) -> dict[str, Any] | None:
    """Вакансия по ID или ``None``."""
    return _VACANCIES_BY_ID.get(vacancy_id)


def skill_name(skill_id: str) -> str:
    """Название навыка; неизвестный ID не подменяется другим навыком."""
    return SKILLS.get(skill_id, {}).get("name", skill_id)
