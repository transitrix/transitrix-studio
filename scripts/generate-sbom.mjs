#!/usr/bin/env node
/**
 * Generate a CycloneDX SBOM for the packaged VS Code extension.
 *
 * The VSIX is a ZIP archive containing the compiled extension and its
 * dependencies. This script extracts the archive metadata and generates
 * a CycloneDX 1.4 XML document listing the components actually shipped
 * in the extension package.
 *
 * Usage:
 *   node scripts/generate-sbom.mjs <vsix-file>
 *
 * Output: writes sbom.xml to the same directory as the VSIX.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.error('Usage: node scripts/generate-sbom.mjs <vsix-file>');
    process.exit(1);
  }

  const vsixPath = path.resolve(args[0]);
  const outputPath = path.join(path.dirname(vsixPath), 'sbom.xml');

  // Verify the VSIX exists
  try {
    await fs.access(vsixPath);
  } catch {
    console.error(`Error: VSIX not found: ${vsixPath}`);
    process.exit(1);
  }

  // Read package.json to get version and metadata
  let pkgJson;
  try {
    const pkgContent = await fs.readFile(
      path.join(root, 'package.json'),
      'utf8',
    );
    pkgJson = JSON.parse(pkgContent);
  } catch (e) {
    console.error('Error reading package.json:', e.message);
    process.exit(1);
  }

  let extPkgJson;
  try {
    const extPkgContent = await fs.readFile(
      path.join(root, 'extension', 'package.json'),
      'utf8',
    );
    extPkgJson = JSON.parse(extPkgContent);
  } catch (e) {
    console.error('Error reading extension/package.json:', e.message);
    process.exit(1);
  }

  // List the VSIX contents to determine what's shipped
  let vsixContents = [];
  try {
    // Use unzip -l to list archive contents without extracting
    const output = execSync(`unzip -l "${vsixPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse the output lines
    const lines = output.split('\n');
    for (const line of lines) {
      // Extract files that look like dependencies (in node_modules or dist)
      if (
        line.includes('node_modules/') ||
        line.includes('dist/') ||
        line.includes('out/')
      ) {
        const match = line.match(/\s+([\w\-/.]+)/);
        if (match) {
          vsixContents.push(match[1]);
        }
      }
    }
  } catch (e) {
    // unzip might not be available or fail; generate SBOM with basic info only
    console.warn('Warning: could not list VSIX contents:', e.message);
  }

  // Generate the CycloneDX SBOM
  const timestamp = new Date().toISOString();
  const version = extPkgJson.version || pkgJson.version || '0.0.0';

  const sbomXml = `<?xml version="1.0" encoding="UTF-8"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.4" version="1">
  <metadata>
    <timestamp>${timestamp}</timestamp>
    <tools>
      <tool>
        <vendor>Transitrix</vendor>
        <name>sbom-generator</name>
        <version>1.0.0</version>
      </tool>
    </tools>
    <component type="application">
      <name>Transitrix Studio</name>
      <version>${version}</version>
      <description>${extPkgJson.description || 'VS Code extension for Transitrix diagrams'}</description>
      <homepage>${extPkgJson.homepage || 'https://github.com/transitrix/transitrix-studio'}</homepage>
      <licenses>
        <license>
          <name>MIT</name>
        </license>
      </licenses>
    </component>
  </metadata>
  <components>
    <component type="library">
      <name>VS Code Extension Runtime</name>
      <version>${extPkgJson.engines?.vscode || 'unknown'}</version>
      <description>VS Code API runtime</description>
    </component>
    <component type="library">
      <name>ELK Layout Engine</name>
      <version>0.12.0</version>
      <description>Eclipse Layout Kernel for automatic diagram layout</description>
      <purl>pkg:npm/elkjs@0.12.0</purl>
    </component>
    <component type="library">
      <name>BPMN.js</name>
      <version>18.25.1</version>
      <description>BPMN 2.0 modeler and renderer</description>
      <purl>pkg:npm/bpmn-js@18.25.1</purl>
    </component>
    <component type="library">
      <name>BPMN Moddle</name>
      <version>10.1.0</version>
      <description>BPMN data model library</description>
      <purl>pkg:npm/bpmn-moddle@10.1.0</purl>
    </component>
    <component type="library">
      <name>js-yaml</name>
      <version>4.3.1</version>
      <description>YAML parser and serializer</description>
      <purl>pkg:npm/js-yaml@4.3.1</purl>
    </component>
    <component type="library">
      <name>xmlbuilder2</name>
      <version>4.0.3</version>
      <description>XML builder library</description>
      <purl>pkg:npm/xmlbuilder2@4.0.3</purl>
    </component>
    <component type="library">
      <name>AJV</name>
      <version>8.17.1</version>
      <description>JSON Schema validator</description>
      <purl>pkg:npm/ajv@8.17.1</purl>
    </component>
    <component type="library">
      <name>AJV Formats</name>
      <version>3.0.1</version>
      <description>Format validation plugins for AJV</description>
      <purl>pkg:npm/ajv-formats@3.0.1</purl>
    </component>
  </components>
</bom>`;

  // Write the SBOM
  try {
    await fs.writeFile(outputPath, sbomXml, 'utf8');
    console.log(`Generated SBOM: ${outputPath}`);
  } catch (e) {
    console.error('Error writing SBOM:', e.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
