"""Прогон benchmark: поиск, ответы и четыре метрики.

Запуск из корня репозитория:

    python -m app.backend.benchmark --judge both

Скрипт печатает сводку и сохраняет JSON с выдачей и оценками в
``benchmark/results``. Вопросы и эталоны лежат в ``benchmark/questions.json``,
корпус — в ``app/backend/data/corpus.json``. Режим ``--retrieval-only``
считает только поисковые метрики и не требует ключа модели.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..config import ROOT, Settings
from ..rag.answer import PROMPT_VERSION, REFUSAL, RagAnswer, RagService
from ..rag.corpus import load_corpus
from ..rag.llm import LlmUnavailable, OpenRouterClient
from .dataset import BenchmarkError, Question, load_benchmark
from .metrics import judge_keyfacts, recall_at_k, reciprocal_rank, summarise

ANSWERS_PROMPT = """Ты — строгий, но справедливый проверяющий ответов RAG-системы.
Сравни ответ с эталоном и реши, правильно ли система ответила на вопрос.

Правила:
1. Ответ правильный, если он отвечает на заданный вопрос, не противоречит эталону и не выдумывает факты, цифры или ссылки.
2. Эталон — ориентир, а не чек-лист. Не снижай оценку за отсутствие деталей, о которых вопрос не спрашивает, и за другую формулировку.
3. Ответ неправильный, если он не отвечает на вопрос, противоречит эталону, пропускает факт, без которого ответ на вопрос неверен, или выдумывает данные.

Верни только JSON без пояснений:
{"verdict": "correct" | "incorrect", "reason": "кратко, чего не хватает или что неверно"}"""

TRAPS_PROMPT = """Ты проверяешь, не выдумала ли RAG-система ответ на вопрос, которого нет в базе знаний.
Вопрос пользователя заведомо не имеет ответа в корпусе проекта.

Правильный ответ: система признаёт отсутствие сведений (например, «В документах нет этой информации»),
прямо говорит, что таких данных в базе нет, или указывает, что значение ещё не установлено и должно
быть согласовано, если это следует из базы.
Неправильный ответ: система называет конкретные цифры, сроки, компании, цены или обещания,
которых нет в базе, либо уверенно отвечает по существу вымышленными данными.

Верни только JSON без пояснений:
{"verdict": "correct" | "incorrect", "reason": "кратко, что именно выдумано или почему отказ корректен"}"""

JUDGE_VERSION = "judge-v2"


def _judge_llm(client: OpenRouterClient, system: str, payload: str) -> tuple[bool | None, str]:
    """Оценка ответа моделью. ``None`` — судья недоступен."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": payload},
    ]
    try:
        reply = client.complete(messages)
    except LlmUnavailable as error:
        return None, f"Судья недоступен: {error}"
    text = reply.text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            verdict_payload = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            verdict_payload = None
        if isinstance(verdict_payload, dict):
            verdict = str(verdict_payload.get("verdict", "")).strip().lower()
            reason = str(verdict_payload.get("reason", "")).strip()
            if verdict in {"correct", "incorrect"}:
                return verdict == "correct", reason
    lowered = text.lower()
    if "incorrect" in lowered:
        return False, text[:200]
    if "correct" in lowered:
        return True, text[:200]
    return None, "Судья вернул нечитаемый ответ."


def _judge_answer(client: OpenRouterClient, item: Question, answer: str) -> tuple[bool | None, str]:
    payload = f"Вопрос: {item.question}\n\nЭталон: {item.reference}\n\nОтвет системы: {answer}"
    return _judge_llm(client, ANSWERS_PROMPT, payload)


def _judge_trap(
    client: OpenRouterClient, item: Question, trace: RagAnswer
) -> tuple[bool | None, str]:
    payload = (
        f"Вопрос: {item.question}\n\n"
        f"Почему в корпусе нет ответа: {item.reference}\n\n"
        f"Ответ системы: {trace.text}\n"
        f"Источники: {', '.join(source['id'] for source in trace.sources) or 'нет'}"
    )
    return _judge_llm(client, TRAPS_PROMPT, payload)


def _is_rejected(trace: RagAnswer) -> bool:
    """Строгий отказ: стандартная фраза, без источников."""
    return trace.refused and not trace.sources and REFUSAL in trace.text


def _row(
    item: Question,
    *,
    trace: RagAnswer | None = None,
    retrieved: list[dict[str, Any]] | None = None,
    k: int,
    secondary_k: int,
    error: str | None = None,
) -> dict[str, Any]:
    retrieved = retrieved or []
    row: dict[str, Any] = {
        "id": item.id,
        "trap": item.trap,
        "question": item.question,
        "relevant": list(item.relevant),
        "retrieved": retrieved,
        "recall": None,
        "rr": None,
        "recall_secondary": None,
        "rr_secondary": None,
        "answer": "",
        "sources": [],
        "refused": None,
        "rejected": None,
        "trap_correct": None,
        "verdict": None,
        "judge_reason": "",
        "verdict_keyfacts": None,
        "judge_reason_keyfacts": "",
        "error": error,
        "latency_ms": 0,
    }
    if item.trap:
        if trace is not None:
            row["answer"] = trace.text
            row["sources"] = trace.sources
            row["refused"] = trace.refused
            row["rejected"] = _is_rejected(trace)
            row["latency_ms"] = trace.latency_ms
        return row
    document_ids = [hit["id"] for hit in retrieved]
    row["recall"] = recall_at_k(document_ids, item.relevant, k)
    row["rr"] = reciprocal_rank(document_ids, item.relevant, k)
    row["recall_secondary"] = recall_at_k(document_ids, item.relevant, secondary_k)
    row["rr_secondary"] = reciprocal_rank(document_ids, item.relevant, secondary_k)
    if trace is not None:
        row["answer"] = trace.text
        row["sources"] = trace.sources
        row["refused"] = trace.refused
        row["latency_ms"] = trace.latency_ms
    return row


def run(
    *,
    settings: Settings,
    corpus_path: Path,
    questions_path: Path,
    k: int | None = None,
    top_k: int | None = None,
    judge: str = "both",
    limit: int | None = None,
    retrieval_only: bool = False,
    secondary_k: int = 5,
) -> dict[str, Any]:
    """Выполняет прогон и возвращает результат для сохранения."""
    corpus = load_corpus(corpus_path)
    benchmark = load_benchmark(questions_path, corpus.by_id(), default_k=3)
    depth = k or benchmark.k
    secondary = max(secondary_k, depth)
    context_depth = max(top_k or settings.rag_top_k, depth, secondary)
    run_settings = dataclasses.replace(settings, rag_top_k=context_depth)
    service = RagService(run_settings, corpus_path=corpus_path)
    client: OpenRouterClient | None = None
    if not retrieval_only:
        client = service.client()

    selected = list(benchmark.questions)
    if limit:
        selected = selected[:limit]
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] {item.id}: {item.question[:70]}", flush=True)
        try:
            if retrieval_only:
                hits = service.retrieve(item.question, context_depth)
                retrieved = [
                    {"id": hit.id, "score": round(hit.score, 6)} for hit in hits[:secondary]
                ]
                rows.append(
                    _row(
                        item,
                        retrieved=retrieved,
                        k=depth,
                        secondary_k=secondary,
                    )
                )
                continue

            assert client is not None
            trace = service.answer_with_trace(item.question, context_depth)
            retrieved = [
                {"id": hit.id, "score": round(hit.score, 6)} for hit in trace.hits[:secondary]
            ]
            row = _row(item, trace=trace, retrieved=retrieved, k=depth, secondary_k=secondary)
            if item.trap:
                if judge in {"llm", "both"}:
                    correct, reason = _judge_trap(client, item, trace)
                    row["trap_correct"] = correct
                    row["judge_reason"] = reason
            else:
                keyfacts, key_reason = judge_keyfacts(trace.text, item.must)
                row["verdict_keyfacts"] = keyfacts
                row["judge_reason_keyfacts"] = key_reason
                verdict: bool | None = keyfacts
                reason = key_reason
                if judge in {"llm", "both"}:
                    judged, judge_reason = _judge_answer(client, item, trace.text)
                    if judged is not None:
                        verdict = judged
                        reason = judge_reason
                row["verdict"] = verdict
                row["judge_reason"] = reason
            rows.append(row)
        except LlmUnavailable as error:
            rows.append(
                _row(
                    item,
                    k=depth,
                    secondary_k=secondary,
                    error=f"Модель недоступна: {error}",
                )
            )
        except Exception as error:
            rows.append(
                _row(
                    item,
                    k=depth,
                    secondary_k=secondary,
                    error=f"{type(error).__name__}: {error}",
                )
            )

    summary = summarise(rows, depth, secondary)
    if judge in {"llm", "both"} and not retrieval_only:
        values = [
            row["verdict_keyfacts"] for row in rows if row.get("verdict_keyfacts") is not None
        ]
        summary["answers"]["accuracy_keyfacts"] = (
            sum(1 for value in values if value) / len(values) if values else None
        )
    summary.update(
        {
            "model": settings.llm_model if not retrieval_only else None,
            "judge": "none" if retrieval_only else judge,
            "judge_version": None if retrieval_only else JUDGE_VERSION,
            "prompt_version": PROMPT_VERSION,
            "corpus_version": corpus.version,
            "benchmark_version": benchmark.version,
            "top_k": context_depth,
            "retrieval_only": retrieval_only,
        }
    )
    return {
        "schema": 1,
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
        "corpus": {
            "version": corpus.version,
            "documents": len(corpus.documents),
            "path": _relative(corpus_path),
        },
        "benchmark": {
            "version": benchmark.version,
            "path": _relative(questions_path),
            "k": depth,
        },
        "settings": {
            "rag_min_score": settings.rag_min_score,
            "rag_context_chars": settings.rag_context_chars,
        },
        "metrics": summary,
        "rows": rows,
    }


def _relative(path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def _format(summary: dict[str, Any]) -> str:
    retrieval = summary["retrieval"]
    answers = summary["answers"]
    traps = summary["traps"]
    secondary = summary["secondary_k"]
    return (
        f"Recall@{summary['k']}: {_pct(retrieval['recall_at_k'])} · "
        f"Recall@{secondary}: {_pct(retrieval['recall_at_secondary'])} · "
        f"MRR@{summary['k']}: {_num(retrieval['mrr_at_k'])} · "
        f"Accuracy: {_pct(answers['accuracy'])} · "
        f"CRR: {_pct(traps['correct_rejection_rate'])}"
    )


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.1f}%"


def _num(value: float | None) -> str:
    return "—" if value is None else f"{value:.3f}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Прогон RAG-бенчмарка SalarySense")
    parser.add_argument("--corpus", type=Path, default=ROOT / "app/backend/data/corpus.json")
    parser.add_argument("--questions", type=Path, default=ROOT / "benchmark/questions.json")
    parser.add_argument(
        "--k", type=int, default=None, help="глубина метрик (по умолчанию из набора)"
    )
    parser.add_argument(
        "--top-k", type=int, default=None, help="сколько фрагментов передать модели"
    )
    parser.add_argument("--judge", choices=["keyfacts", "llm", "both"], default=None)
    parser.add_argument("--model", default=None, help="модель OpenRouter")
    parser.add_argument("--limit", type=int, default=None, help="первые N вопросов")
    parser.add_argument("--retrieval-only", action="store_true", help="только поиск, без модели")
    parser.add_argument("--output", type=Path, default=None, help="куда сохранить JSON")
    parser.add_argument("--stdout", action="store_true", help="напечатать сводку в stdout")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    if args.model:
        settings = dataclasses.replace(settings, llm_model=args.model)
    judge = args.judge or settings.benchmark_judge
    if args.retrieval_only:
        judge = "none"
    if judge not in {"none", "keyfacts", "llm", "both"}:
        parser.error("Неизвестный режим судьи")
    try:
        result = run(
            settings=settings,
            corpus_path=args.corpus,
            questions_path=args.questions,
            k=args.k,
            top_k=args.top_k,
            judge=judge,
            limit=args.limit,
            retrieval_only=args.retrieval_only,
        )
    except (BenchmarkError, LlmUnavailable, FileNotFoundError) as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1
    summary = result["metrics"]
    print()
    print(_format(summary))
    print(
        f"Вопросов: {summary['questions']['normal']} обычных, "
        f"{summary['questions']['traps']} ловушек; ошибок: {summary['questions']['errors']}"
    )
    output = args.output
    if output is None:
        results_dir = ROOT / "benchmark" / "results"
        results_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d")
        output = results_dir / f"benchmark-{stamp}.json"
        counter = 2
        while output.exists():
            output = results_dir / f"benchmark-{stamp}-{counter}.json"
            counter += 1
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Результат: {_relative(output)}")
    if args.stdout:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0
