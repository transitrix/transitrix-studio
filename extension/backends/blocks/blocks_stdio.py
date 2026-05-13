#!/usr/bin/env python3
"""JSON stdin → JSON stdout adapter for Transitrix Studio (Node invokes this script)."""

import json
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from diagram_generator import DiagramGenerator  # noqa: E402

_SVGBOB_FIX_PROMPT = """\
Transitrix Studio needs svgbob_cli to render block diagrams, but it was not found on this system.

Please install it:

1. Install Rust and Cargo (if not already installed):
   https://rustup.rs/

2. Install svgbob_cli via Cargo:
   cargo install svgbob_cli

3. Verify the installation:
   svgbob_cli --version

If svgbob_cli is installed to a non-standard path, open VS Code Settings,
search for "transitrix.svgbobPath", and set it to the full executable path.
Example: /home/user/.cargo/bin/svgbob_cli
         C:\\Users\\You\\.cargo\\bin\\svgbob_cli.exe\
"""


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
        msg = str(exc)
        fix_prompt = None
        if "svgbob" in msg.lower() or "svgbob_cli" in msg.lower():
            fix_prompt = _SVGBOB_FIX_PROMPT
        _emit({"ok": False, "message": msg, "details": [], "fixPrompt": fix_prompt})
    except OSError as exc:
        msg = str(exc)
        lowered = msg.lower()
        is_not_found = "ENOENT" in msg or "no such file" in lowered or lowered.startswith("[errno 2]")
        fix_prompt = _SVGBOB_FIX_PROMPT if is_not_found else None
        display_msg = (
            f"svgbob_cli not found. See the prompt below to install it."
            if is_not_found else msg
        )
        _emit({"ok": False, "message": display_msg, "details": [msg] if is_not_found else [], "fixPrompt": fix_prompt})
    except Exception as exc:  # noqa: BLE001 — surface any generator failure as JSON for the Studio host
        _emit({"ok": False, "message": str(exc), "details": []})


if __name__ == "__main__":
    main()
