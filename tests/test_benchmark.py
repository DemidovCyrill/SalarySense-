"""Проверки корпуса, набора вопросов, метрик и CLI-прогона benchmark."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.backend.benchmark.dataset import BenchmarkError, load_benchmark
from app.backend.benchmark.metrics import (
    judge_keyfacts,
    recall_at_k,
    reciprocal_rank,
    summarise,
)
from app.backend.benchmark.run import main, run
from app.backend.config import ROOT, Settings
from app.backend.rag.corpus import CorpusError, load_corpus
from app.backend.rag.text import terms

CORPUS_PATH = ROOT / "app" / "backend" / "data" / "corpus.json"
QUESTIONS_PATH = ROOT / "benchmark" / "questions.json"


def test_corpus_has_thirty_distinct_documents() -> None:
    corpus = load_corpus(CORPUS_PATH)
    assert len(corpus.documents) == 30
    assert [document.id for document in corpus.documents] == [
        f"D{index:02d}" for index in range(1, 31)
    ]
    assert len({document.title for document in corpus.documents}) == 30
    for document in corpus.documents:
        words = len(document.text.split())
        assert 50 <= words <= 120, (document.id, words)
        source = document.source.get("doc", "")
        assert (ROOT / source).is_file(), source


def test_benchmark_has_ten_questions_and_five_traps() -> None:
    corpus = load_corpus(CORPUS_PATH)
    benchmark = load_benchmark(QUESTIONS_PATH, corpus.by_id())
    assert len(benchmark.normal) == 10
    assert len(benchmark.traps) == 5
    assert benchmark.k == 3
    documents = corpus.by_id()
    for question in benchmark.normal:
        assert len(question.relevant) == 3
        assert all(item in documents for item in question.relevant)
        union = set()
        for document_id in question.relevant:
            union |= set(terms(documents[document_id].title + " " + documents[document_id].text))
        for fact in question.must:
            assert set(terms(fact)).issubset(union), (question.id, fact)
    assert all(question.relevant == () for question in benchmark.traps)


def test_dataset_rejects_unknown_document(tmp_path: Path) -> None:
    path = tmp_path / "bad.json"
    path.write_text(
        json.dumps(
            {
                "version": "bad",
                "k": 3,
                "questions": [
                    {
                        "id": "Q01",
                        "question": "Вопрос без документа?",
                        "relevant": ["D01", "D02", "D99"],
                        "reference": "Эталонный ответ.",
                        "must": ["факт"],
                    }
                ],
                "traps": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    with pytest.raises(BenchmarkError):
        load_benchmark(path, {"D01", "D02"})


def test_corpus_rejects_empty_or_duplicate_documents(tmp_path: Path) -> None:
    path = tmp_path / "bad.json"
    path.write_text(
        json.dumps(
            {
                "version": "bad",
                "documents": [
                    {"id": "D01", "title": "Один", "text": "Короткий текст."},
                    {"id": "D01", "title": "Два", "text": "Ещё один короткий текст."},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    with pytest.raises(CorpusError):
        load_corpus(path)


def test_retrieval_metrics() -> None:
    retrieved = ["D02", "D05", "D01"]
    relevant = ["D01", "D02", "D03"]
    assert recall_at_k(retrieved, relevant, 3) == pytest.approx(2 / 3)
    assert recall_at_k(retrieved, relevant, 1) == pytest.approx(1 / 3)
    assert reciprocal_rank(retrieved, relevant, 3) == 1.0
    assert reciprocal_rank(["D09", "D08"], relevant, 2) == 0.0


def test_keyfacts_judge() -> None:
    answer = "Считается медиана середины двусторонних вилок, минимум 10 пригодных вилок."
    correct, _ = judge_keyfacts(answer, ["двусторонних вилок", "10 пригодных вилок"])
    assert correct
    correct, reason = judge_keyfacts("Считается медиана.", ["10 пригодных вилок"])
    assert not correct
    assert "10 пригодных вилок" in reason


def test_summary_aggregates_answers_and_traps() -> None:
    rows = [
        {
            "trap": False,
            "verdict": True,
            "recall": 1.0,
            "rr": 1.0,
            "recall_secondary": 1.0,
            "rr_secondary": 1.0,
        },
        {
            "trap": False,
            "verdict": False,
            "recall": 1 / 3,
            "rr": 0.5,
            "recall_secondary": 2 / 3,
            "rr_secondary": 0.5,
        },
        {"trap": True, "trap_correct": True, "rejected": False},
        {"trap": True, "trap_correct": False, "rejected": True},
    ]
    summary = summarise(rows, 3, 5)
    assert summary["answers"] == {"accuracy": 0.5, "correct": 1, "judged": 2}
    assert summary["traps"]["correct_rejection_rate"] == 0.5
    assert summary["retrieval"]["recall_at_k"] == pytest.approx(2 / 3)
    assert summary["retrieval"]["mrr_at_k"] == pytest.approx(0.75)


def test_retrieval_only_run_uses_real_corpus(tmp_path: Path) -> None:
    settings = Settings(database_path=tmp_path / "db.sqlite3", static_dir=tmp_path / "no-static")
    result = run(
        settings=settings,
        corpus_path=CORPUS_PATH,
        questions_path=QUESTIONS_PATH,
        retrieval_only=True,
    )
    metrics = result["metrics"]
    assert len(result["rows"]) == 15
    assert metrics["questions"]["errors"] == 0
    assert metrics["retrieval"]["recall_at_k"] == pytest.approx(0.6)
    assert metrics["retrieval"]["recall_at_secondary"] == pytest.approx(5 / 6)
    assert metrics["retrieval"]["mrr_at_k"] == pytest.approx(1.0)
    assert metrics["answers"]["accuracy"] is None
    assert result["corpus"]["documents"] == 30


def test_cli_writes_result_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    output = tmp_path / "benchmark.json"
    code = main(["--retrieval-only", "--output", str(output)])
    assert code == 0
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["metrics"]["retrieval_only"] is True
    assert len(payload["rows"]) == 15
    assert "Recall@3" in capsys.readouterr().out
