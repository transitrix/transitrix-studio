#!/usr/bin/env python3
"""JSON stdin → JSON stdout adapter for Transitrix Studio (Node invokes this script)."""

import json
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from diagram_generator import DiagramGenerator  # noqa: E402


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        _emit({"ok": False, "message": f"Invalid JSON: {exc}", "details": []})
        sys.exit(0)

    mode = data.get("mode")
    source = data.get("source")
    svgbob_cmd = data.get("svgbobCommand") or "svgbob_cli"

    valid_modes = ("ascii", "markdown_table", "markdown_tables")
    if mode not in valid_modes:
        _emit({
            "ok": False,
            "message": f"Expected mode as one of: {', '.join(valid_modes)}",
            "details": [],
        })
        sys.exit(0)

    if not isinstance(source, str):
        _emit({"ok": False, "message": "Field 'source' must be a string", "details": []})
        sys.exit(0)

    if not isinstance(svgbob_cmd, str):
        _emit({"ok": False, "message": "Field 'svgbobCommand' must be a string when set", "details": []})
        sys.exit(0)

    try:
        gen = DiagramGenerator(svgbob_cmd=svgbob_cmd)
        if mode == "ascii":
            svgs = [gen.from_string(source)]
        elif mode == "markdown_table":
            svgs = [gen.from_markdown_table(source)]
        else:
            svgs = gen.from_markdown_string(source)

        if not svgs:
            _emit({
                "ok": False,
                "message": "No diagrams produced (Markdown document may contain no tables)",
                "details": [],
            })
            sys.exit(0)

        _emit({"ok": True, "svgs": svgs})
    except FileNotFoundError as exc:
        _emit({"ok": False, "message": str(exc), "details": []})
    except OSError as exc:
        msg = str(exc)
        hint = ""
        lowered = msg.lower()
        if "ENOENT" in msg or ("no such file" in lowered) or lowered.startswith("[errno 2]"):
            hint = (
                "Svgbob executable not found. Install with: cargo install svgbob_cli "
                "(CLI name is typically `svgbob_cli`)."
            )
        _emit({"ok": False, "message": hint or msg, "details": [msg] if hint else []})
    except Exception as exc:  # noqa: BLE001 — surface any generator failure as JSON for the Studio host
        _emit({"ok": False, "message": str(exc), "details": []})


if __name__ == "__main__":
    main()
