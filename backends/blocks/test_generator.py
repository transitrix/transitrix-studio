#!/usr/bin/env python3
"""Tests for DiagramGenerator."""

from pathlib import Path

from diagram_generator import DiagramGenerator


def _nested_blocks_examples_root() -> Path:
    """``examples/nested-blocks/`` at repository root (this file lives in ``backends/blocks/``)."""
    return Path(__file__).resolve().parents[2] / "examples" / "nested-blocks"


def test_from_string():
    gen = DiagramGenerator()

    svg = gen.from_string("""
+-------+
|  Box  |
+-------+
""")

    assert "<svg" in svg
    assert "Box" in svg
    print("✓ from_string test passed")


def test_from_file():
    gen = DiagramGenerator()

    svg = gen.from_file(_nested_blocks_examples_root() / "nested.txt")

    assert "<svg" in svg
    assert "Application" in svg
    assert "Frontend" in svg
    assert "Backend" in svg
    assert "Data" in svg
    print("✓ from_file test passed")


def test_from_markdown_table():
    gen = DiagramGenerator()

    table = """
| Name    | Role    | Status  |
|---------|---------|---------|
| Alice   | Dev     | Active  |
| Bob     | QA      | Active  |
"""
    svg = gen.from_markdown_table(table)

    assert "<svg" in svg
    assert "Name" in svg
    assert "Alice" in svg
    print("✓ from_markdown_table test passed")


def test_from_markdown_string():
    gen = DiagramGenerator()

    text = (_nested_blocks_examples_root() / "tables.md").read_text(encoding="utf-8")
    svgs = gen.from_markdown_string(text)

    assert len(svgs) == 2
    assert all("<svg" in s for s in svgs)
    print("✓ from_markdown_string test passed")


def test_from_markdown_file(tmp_path):
    gen = DiagramGenerator()

    svgs = gen.from_markdown_file(
        _nested_blocks_examples_root() / "tables.md",
        output_dir=tmp_path,
    )

    assert len(svgs) == 2
    assert all("<svg" in s for s in svgs)
    assert (tmp_path / "tables_1.svg").exists()
    assert (tmp_path / "tables_2.svg").exists()
    print("✓ from_markdown_file test passed")


def test_save_to_file(tmp_path):
    gen = DiagramGenerator()
    output = tmp_path / "out.svg"

    gen.from_string("+---+\n| X |\n+---+\n", output=output)

    assert output.exists()
    assert "<svg" in output.read_text()
    print("✓ save_to_file test passed")


if __name__ == "__main__":
    import tempfile, pathlib

    test_from_string()
    test_from_file()
    test_from_markdown_string()
    test_from_markdown_table()
    with tempfile.TemporaryDirectory() as d:
        test_from_markdown_file(pathlib.Path(d))
    with tempfile.TemporaryDirectory() as d:
        test_save_to_file(pathlib.Path(d))
    print("\n✓ All tests passed!")
