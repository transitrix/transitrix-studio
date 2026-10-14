# Security Policy

## Reporting a Security Vulnerability

If you discover a security vulnerability in Transitrix Studio, please report it privately by emailing [security@transitrix.com](mailto:security@transitrix.com) with:

- A description of the vulnerability
- Steps to reproduce it (if possible)
- The affected versions
- Any suggested mitigation or fix

**Do not open a public GitHub issue for security vulnerabilities.** We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Supported Versions

Security updates are provided for:

| Version | Support Status |
|---------|----------------|
| 3.5.x   | Current release |
| 3.4.x   | Maintenance fixes |
| < 3.4   | End of life |

We recommend keeping your extension updated to the latest version to receive security patches promptly.

## Published Verification Evidence

The [release history](https://github.com/transitrix/transitrix-studio/releases) identifies published versions and their verification materials. Release availability does not by itself establish a security-support commitment for a version branch.

The [3.2.0 audit finding](docs/internal/vsix-audit-v3.2.0/FINDING.md) covers the four packages distributed through Open VSX. It records file-origin and dependency checks, [scan results](docs/internal/vsix-audit-v3.2.0/scans.md), and a [Windows x64 rebuild](docs/internal/vsix-audit-v3.2.0/reproducibility.md) whose 519 extracted files matched by content hash. The original Microsoft-served packages were unavailable; byte-for-byte identity with those packages was not independently verified.

Microsoft Defender reported no threats in the examined 3.2.0 packages. VirusTotal recorded zero malicious and zero suspicious results, with some engines unable to complete analysis. These point-in-time results do not guarantee safety and are not scan results for later releases, including 3.8.1.

## Verifying Release 3.8.1

[Release 3.8.1](https://github.com/transitrix/transitrix-studio/releases/tag/v3.8.1) provides the VSIX, SHA-256 checksums, a CycloneDX software bill of materials (`sbom.xml`), and build-provenance verification instructions. Consult each release's notes and assets for the evidence available for that specific version.

To verify the downloaded 3.8.1 VSIX's build provenance:

```bash
gh attestation verify --owner transitrix transitrix-studio-3.8.1.vsix
```

Review the verification output for the artifact digest, source repository and build workflow. Provenance associates an artifact with its recorded build; it is not a malware scan or a guarantee of safety. Checksums establish file integrity against the published values, and the SBOM supports component review.

Review the published evidence against your organisation's requirements and keep security protections enabled.

## Questions or Concerns?

For non-security questions about Transitrix Studio, please open an issue on [GitHub](https://github.com/transitrix/transitrix-studio/issues) or visit [transitrix.com](https://transitrix.com).
