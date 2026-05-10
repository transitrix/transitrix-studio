# Nested Blocks Diagram to SVG

Generate complex nested block diagrams (phases → steps → systems) as SVG using ASCII templates and Svgbob.

## Architecture

- **Svgbob**: ASCII-to-SVG compiler (installed via Cargo)
- **Python**: Template generator with data substitution
- **ASCII Templates**: Human-readable diagram definitions

## Installation

```bash
# Install Svgbob (already done)
cargo install svgbob_cli

# Python environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Quick Start

```bash
# Generate diagram from template with data
python generate.py --template examples/workflow.txt --output dist/workflow.svg \
  --data examples/workflow.json

# Or use programmatic API
from diagram_generator import DiagramGenerator

gen = DiagramGenerator()
svg = gen.generate(template_path="examples/workflow.txt", data={...})
```

## File Structure

Sample inputs wired into the Studio web UI live under **`examples/nested-blocks/`** at the repository root (`nested.txt`, `tables.md`).

```
.
├── generate.py              # CLI entry point
├── diagram_generator.py     # Core template engine
├── requirements.txt         # Python dependencies
├── examples/
│   ├── workflow.txt         # ASCII template example
│   └── workflow.json        # Sample data
├── dist/                    # Output SVG files
└── templates/               # Reusable template components
```

## Template Syntax

ASCII templates use placeholders for dynamic content:

```
┌─────────────────────────────────────────────┐
│  {{TITLE}}                                  │
├─────────────────────────────────────────────┤
│  Phase: {{PHASE_NAME}}                      │
│  ├─ Step 1: {{STEP_1}}                      │
│  └─ Step 2: {{STEP_2}}                      │
└─────────────────────────────────────────────┘
```

Data is provided as JSON and substituted into the template before compilation.
