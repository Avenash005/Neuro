# Security Policy

Neuro AI takes the security of its application, local knowledge storage, and user data seriously. This document outlines our vulnerability disclosure process and security policies.

---

## Supported Versions

Only the latest release and the current `main` branch receive active security updates.

| Version | Supported | Notes |
|---|---|---|
| `0.2.x` / `main` | :white_check_mark: | Active development & security patches |
| `< 0.2.0` | :x: | Legacy / unsupported |

---

## Reporting a Security Vulnerability

> [!IMPORTANT]
> **Do NOT report security vulnerabilities through public GitHub Issues, Discussions, or Pull Requests.**

### Preferred Method: GitHub Private Vulnerability Reporting
Please submit vulnerability reports privately using GitHub's built-in Private Vulnerability Reporting mechanism:

1. Navigate to the repository's **Security** tab.
2. Select **Advisories** from the left navigation.
3. Click **Report a vulnerability** (or go directly to [Report an Advisory](https://github.com/Avenash005/Neuro/security/advisories/new)).
4. Fill in the advisory details, severity assessment, and reproduction steps.

### Information to Include
To help us triage and resolve the issue quickly, please provide:
- A clear summary of the potential vulnerability.
- Affected components (e.g. Edge Functions, Local File Access API, RLS policies, Authentication flows, Connectors).
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Any potential impact on user data or system integrity.
- Proposed remediation or patch, if known.

---

## Response Process & Timeline

1. **Initial Acknowledgment:** The maintainer will acknowledge receipt of your report within **48 hours**.
2. **Triage & Assessment:** We will verify the vulnerability and assess its severity and affected components within **5 business days**.
3. **Patch Development:** Fixes will be prepared in a private fork or private advisory workspace.
4. **Coordinated Disclosure:** Once the fix is verified and deployed to `main`, a security advisory and patched release will be published with attribution to the reporter.

---

## Credential Leakage & Revocation Guidance

If you discover an exposed credential (API key, token, or secret) in the repository or its commit history:
- Do **not** post the credential publicly or test its permissions against live systems.
- Report it immediately via [Private Vulnerability Advisory](https://github.com/Avenash005/Neuro/security/advisories/new).
- The maintainers will immediately revoke the affected credential in provider dashboards (e.g., Supabase, NVIDIA) and schedule a Git history purge.

---

## Dependency Vulnerabilities

Automated dependency alerts are managed via Dependabot. If you identify a known CVE in an upstream dependency that is directly exploitable within Neuro AI's runtime environment, please submit an advisory with reproduction steps demonstrating exploitability.

