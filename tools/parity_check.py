"""Сверка Python-бэкенда с демонстрационным API на Node.

Запускает ``app/frontend/demo/server.mjs`` на случайном порту и отправляет
одинаковые запросы в оба сервера: демо-API и Python-бэкенд. Ответы
сравниваются после нормализации идентификаторов попыток.

    python tools/parity_check.py

Скрипт нужен при изменении правил совпадения, зарплат, попыток или редакции:
поведение бэкенда должно совпадать с эталонным демо-API. Для запуска нужен
Node.js 22+; обычные тесты бэкенда Node не требуют.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.backend.config import Settings  # noqa: E402
from app.backend.server import create_app  # noqa: E402

IDENTIFIER = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32}\b"
)


def normalize(value):
    """Убирает случайные ID и необязательные поля, которых нет в JSON Node."""
    if isinstance(value, dict):
        return {
            key: normalize(item)
            for key, item in value.items()
            if not (key == "returnTo" and item is None)
        }
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, str):
        return IDENTIFIER.sub("<id>", value)
    return value


class Client:
    def __init__(self, http) -> None:
        self.http = http

    def call(self, method: str, path: str, payload=None):
        response = (
            self.http.request(method, path, json=payload)
            if payload is not None
            else self.http.request(method, path)
        )
        return response.status_code, response.json() if response.content else None


def start_node() -> tuple[subprocess.Popen, str]:
    process = subprocess.Popen(
        ["node", "app/frontend/demo/server.mjs"],
        cwd=ROOT,
        env={**os.environ, "PORT": "0"},
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
    )
    line = process.stdout.readline()
    match = re.search(r"http://127\.0\.0\.1:\d+", line)
    if not match:
        process.kill()
        raise RuntimeError(f"Node не запустился: {line!r}")
    return process, match.group(0)


def main() -> int:
    process, base_url = start_node()
    differences = 0
    try:
        node_http = httpx.Client(base_url=base_url, timeout=10, trust_env=False)
        node = Client(node_http)
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            settings = Settings(
                database_path=Path(folder) / "parity.sqlite3",
                static_dir=Path(folder) / "no-static",
                llm_api_key="",
            )
            python_http = TestClient(create_app(settings))
            python = Client(python_http)

            steps = [
                ("GET", "/api/v1/bootstrap", None),
                ("GET", "/api/v1/market?roleId=frontend", None),
                ("GET", "/api/v1/market?roleId=frontend&mode=live", None),
                ("GET", "/api/v1/market?roleId=qa", None),
                ("GET", "/api/v1/vacancies/frontend-1", None),
                ("GET", "/api/v1/vacancies/frontend-3", None),
                ("GET", "/api/v1/vacancies/frontend-24", None),
                ("PATCH", "/api/v1/profile", {"roleId": "qa", "claim": {"id": "sql", "rank": 0}}),
                ("POST", "/api/v1/checks/qa-sql/attempts", {"returnTo": "#/skills"}),
            ]
            attempts: dict[str, str] = {}
            for method, path, payload in steps:
                node_status, node_body = node.call(method, path, payload)
                py_status, py_body = python.call(method, path, payload)
                if method == "POST" and path.endswith("/attempts"):
                    attempts = {"node": node_body["id"], "python": py_body["id"]}
                if (node_status, normalize(node_body)) != (py_status, normalize(py_body)):
                    differences += 1
                    print(f"РАСХОЖДЕНИЕ {method} {path}: {node_status} vs {py_status}")
                    print(" node:", json.dumps(normalize(node_body), ensure_ascii=False)[:800])
                    print(" py:  ", json.dumps(normalize(py_body), ensure_ascii=False)[:800])

            for name, client, attempt_id in (
                ("node", node, attempts["node"]),
                ("python", python, attempts["python"]),
            ):
                path = f"/api/v1/attempts/{attempt_id}"
                for index, option in enumerate([4, 2, 0]):
                    status, body = client.call("PUT", f"{path}/answers/{index}", {"option": option})
                    if status != 200:
                        differences += 1
                        print(f"РАСХОЖДЕНИЕ ответа {name} {index}: {status} {body}")

            checks = [
                ("POST", f"/api/v1/attempts/{attempts['node']}/finish", None),
                (
                    "POST",
                    "/api/v1/vacancies/frontend-1/letter",
                    {"facts": ["claim:javascript", "claim:react", "evidence:sample-frontend-js"]},
                ),
                ("GET", "/api/v1/criteria/frontend", None),
                ("GET", "/api/v1/editor/materials", None),
                ("POST", "/api/v1/editor/materials/qa-sql/1/fork", {}),
                ("POST", "/api/v1/editor/materials/qa-sql/2/status", {"status": "review"}),
                ("POST", "/api/v1/editor/materials/qa-sql/2/status", {"status": "published"}),
                ("DELETE", "/api/v1/profile", None),
            ]
            for method, path, payload in checks:
                python_path = path.replace(attempts["node"], attempts["python"])
                node_status, node_body = node.call(method, path, payload)
                py_status, py_body = python.call(method, python_path, payload)
                if (node_status, normalize(node_body)) != (py_status, normalize(py_body)):
                    differences += 1
                    print(f"РАСХОЖДЕНИЕ {method} {path}: {node_status} vs {py_status}")
                    print(" node:", json.dumps(normalize(node_body), ensure_ascii=False)[:800])
                    print(" py:  ", json.dumps(normalize(py_body), ensure_ascii=False)[:800])
        print("Расхождений:", differences)
        return 0 if differences == 0 else 1
    finally:
        process.kill()


if __name__ == "__main__":
    sys.exit(main())
