#!/usr/bin/env python3
"""ASCII-to-SVG diagram generator using Svgbob."""

import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Union

_SVG_NS = "http://www.w3.org/2000/svg"

DEPTH_COLORS = ["#DBEAFE", "#DCFCE7", "#FEF9C3", "#FCE7F3", "#F3E8FF"]

# Lines composed only of +, -, and whitespace are horizontal box borders — never escape them.
_BOX_BORDER_RE = re.compile(r'^\s*[+\-]+\s*$')

# Characters svgbob interprets as drawing primitives → visually equivalent Unicode.
# Applied only to text content inside boxes, never to border characters.
_TEXT_ESCAPE = str.maketrans({
    '/':  '∕',  # ∕  DIVISION SLASH     — identical to / in most fonts
    '\\': '⧵',  # ⧵  REVERSE SOLIDUS OP — near-identical to \
    '(':  '❨',  # ❨  MEDIUM LEFT PARENTHESIS ORNAMENT
    ')':  '❩',  # ❩  MEDIUM RIGHT PARENTHESIS ORNAMENT
})


class DiagramGenerator:
    """Convert ASCII diagrams to SVG via Svgbob."""

    def __init__(self, svgbob_cmd: str = "svgbob_cli"):
        self.svgbob_cmd = svgbob_cmd

    def from_file(
        self,
        path: Union[str, Path],
        output: Union[str, Path, None] = None,
        colors: List[str] = DEPTH_COLORS,
    ) -> str:
        """Generate SVG from an ASCII diagram file."""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Diagram file not found: {path}")
        return self.from_string(path.read_text(encoding="utf-8"), output, colors)

    @staticmethod
    def _escape_text_in_boxes(ascii_art: str) -> str:
        """Replace svgbob drawing primitives with Unicode lookalikes in text areas only."""
        lines = []
        for line in ascii_art.splitlines():
            if _BOX_BORDER_RE.match(line):
                lines.append(line)  # pure horizontal border — never touch
            elif '|' in line:
                # Content line: escape only the segments between | box borders
                parts = line.split('|')
                # parts[0] = before first |, parts[-1] = after last | (both outside boxes)
                escaped = [parts[0]] + [p.translate(_TEXT_ESCAPE) for p in parts[1:-1]]
                if len(parts) > 1:
                    escaped.append(parts[-1])
                lines.append('|'.join(escaped))
            else:
                lines.append(line.translate(_TEXT_ESCAPE))  # title / floating text
        return '\n'.join(lines)

    def from_string(
        self,
        ascii: str,
        output: Union[str, Path, None] = None,
        colors: List[str] = DEPTH_COLORS,
    ) -> str:
        """Generate SVG from an ASCII diagram string."""
        svg = self._compile(self._escape_text_in_boxes(ascii))

        if colors:
            svg = self._colorize(svg, colors)

        if output:
            output = Path(output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(svg, encoding="utf-8")

        return svg

    def from_markdown_table(
        self,
        table: str,
        output: Union[str, Path, None] = None,
        colors: List[str] = DEPTH_COLORS,
    ) -> str:
        """Generate SVG from a Markdown table string."""
        ascii_art = self._md_table_to_ascii(table)
        return self.from_string(ascii_art, output, colors)

    def from_markdown_string(
        self,
        text: str,
        colors: List[str] = DEPTH_COLORS,
    ) -> List[str]:
        """Generate SVGs for all Markdown tables found in ``text``."""
        tables = self._extract_md_tables(text)
        return [self.from_markdown_table(table, colors=colors) for table in tables]

    def from_markdown_file(
        self,
        path: Union[str, Path],
        output_dir: Union[str, Path, None] = None,
        colors: List[str] = DEPTH_COLORS,
    ) -> List[str]:
        """Generate SVGs for all Markdown tables found in a .md file.

        Returns a list of SVG strings (one per table).
        If output_dir is given, saves them as <stem>_1.svg, <stem>_2.svg, ...
        """
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        tables = self._extract_md_tables(path.read_text(encoding="utf-8"))

        results = []
        for i, table in enumerate(tables, start=1):
            out = None
            if output_dir:
                out = Path(output_dir) / f"{path.stem}_{i}.svg"
            results.append(self.from_markdown_table(table, output=out, colors=colors))

        return results

    def _extract_md_tables(self, text: str) -> List[str]:
        tables = []
        lines = text.splitlines()
        i = 0
        while i < len(lines):
            if "|" in lines[i]:
                j = i
                while j < len(lines) and "|" in lines[j]:
                    j += 1
                block = "\n".join(lines[i:j])
                if re.search(r"\|[\s:]*-+[\s:]*\|", block):
                    tables.append(block)
                i = j
            else:
                i += 1
        return tables

    def _md_table_to_ascii(self, md: str) -> str:
        lines = [l.strip() for l in md.strip().splitlines() if l.strip()]

        rows = []
        for line in lines:
            if "|" not in line:
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            # Skip separator rows like |---|:---:|---:|
            if all(re.match(r"^:?-+:?$", c) for c in cells if c.strip()):
                continue
            rows.append(cells)

        if not rows:
            return md

        num_cols = max(len(r) for r in rows)
        rows = [r + [""] * (num_cols - len(r)) for r in rows]

        col_widths = [
            max(max(len(r[i]) for r in rows), 3)
            for i in range(num_cols)
        ]

        hline = "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"

        def escape(text: str) -> str:
            return text.replace("-", "‐").translate(_TEXT_ESCAPE)

        def fmt_row(cells: List[str]) -> str:
            return "|" + "|".join(
                f" {escape(cells[i]).ljust(col_widths[i])} " for i in range(num_cols)
            ) + "|"

        result = [hline]
        for i, row in enumerate(rows):
            result.append(fmt_row(row))
            result.append(hline)

        return "\n".join(result)

    def _compile(self, ascii: str) -> str:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            src = tmp / "input.txt"
            dst = tmp / "output.svg"

            src.write_text(ascii, encoding="utf-8")

            try:
                result = subprocess.run(
                    [self.svgbob_cmd, str(src), "-o", str(dst)],
                    capture_output=True,
                    text=True,
                )
            except FileNotFoundError:
                raise FileNotFoundError(
                    f"svgbob_cli not found at '{self.svgbob_cmd}'. "
                    "Install it with: cargo install svgbob_cli. "
                    "Or set transitrix.svgbobPath in VS Code settings to the full path."
                )

            if result.returncode != 0:
                raise subprocess.CalledProcessError(
                    result.returncode, self.svgbob_cmd, stderr=result.stderr
                )

            return dst.read_text(encoding="utf-8")

    def _colorize(self, svg: str, colors: List[str]) -> str:
        ET.register_namespace("", _SVG_NS)
        ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")

        root = ET.fromstring(svg)

        rects = []
        for rect in root.iter(f"{{{_SVG_NS}}}rect"):
            if "backdrop" in rect.get("class", ""):
                continue
            rects.append((
                rect,
                float(rect.get("x", 0)),
                float(rect.get("y", 0)),
                float(rect.get("width", 0)),
                float(rect.get("height", 0)),
            ))

        for i, (rect, x, y, w, h) in enumerate(rects):
            depth = sum(
                1 for j, (_, ox, oy, ow, oh) in enumerate(rects)
                if i != j
                and ox <= x + 0.5 and oy <= y + 0.5
                and ox + ow >= x + w - 0.5 and oy + oh >= y + h - 0.5
            )
            color = colors[min(depth, len(colors) - 1)]

            classes = [c for c in rect.get("class", "").split() if c != "nofill"]
            rect.set("class", " ".join(classes))
            rect.set("style", f"fill: {color};")

        return ET.tostring(root, encoding="unicode")
