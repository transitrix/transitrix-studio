.PHONY: help install test view clean

help:
	@echo "Usage:"
	@echo "  make install  - Set up Python virtual environment"
	@echo "  make test     - Run test suite"
	@echo "  make view     - Generate example SVG and open in browser"
	@echo "  make clean    - Remove generated files"

install:
	python3 -m venv venv
	. venv/bin/activate && pip install --upgrade pip

test:
	. venv/bin/activate && python test_generator.py

view:
	. venv/bin/activate && python -c "\
from diagram_generator import DiagramGenerator; \
DiagramGenerator().from_file('../../examples/nested-blocks/nested.txt', output='dist/nested.svg'); \
print('Generated dist/nested.svg')"
	open dist/nested.svg

clean:
	rm -rf dist/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
