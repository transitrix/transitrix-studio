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

## Security Audits

Transitrix Studio has undergone formal security audits, including provenance verification of published artifacts. Our audit process includes:

- Source code review
- Dependency inventory (SBOM)
- Build provenance attestation
- Binary integrity verification

Published audit findings are available in the [security audit record](https://github.com/transitrix/transitrix-studio/pull/518).

## Verifying Build Provenance

Each release is attested using [GitHub build provenance](https://docs.github.com/en/actions/publishing-packages/publishing-docker-images#publishing-images-to-github-packages). To verify the provenance of a released `.vsix` file:

```bash
gh attestation verify --owner transitrix transitrix-studio-X.Y.Z.vsix
```

Replace `X.Y.Z` with the version number. The command confirms that the artifact was built by our CI pipeline and has not been tampered with.

Detailed attestation verification instructions are included in each release's notes.

## Dependency Management

Transitrix Studio:

- Declares all production dependencies in `package.json`
- Pins dependency versions to ensure reproducible builds
- Receives automated dependency security updates via Dependabot
- Does not include proprietary or closed-source components

The complete component inventory for each release is available as a CycloneDX SBOM (Software Bill of Materials) attached to the release.

## Software Bill of Materials (SBOM)

Each published release includes a CycloneDX-format SBOM (`sbom.xml`) listing all components and their versions as shipped in the extension package. This allows you to:

- Audit what is included in the release
- Cross-reference against known vulnerabilities
- Verify component versions against your compliance requirements

The SBOM is generated during the build process from the actual packaged extension, not from source declarations.

## Secure Development Practices

- All commits are signed
- Pull requests require review before merge
- CI/CD pipeline verifies code quality and tests
- Build artifacts are attested and signed
- Archive hashes are reproducible and published

## Questions or Concerns?

For non-security questions about Transitrix Studio, please open an issue on [GitHub](https://github.com/transitrix/transitrix-studio/issues) or visit [transitrix.com](https://transitrix.com).
