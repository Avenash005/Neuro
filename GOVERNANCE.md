# Project Governance

This document describes how Neuro AI is managed, how decisions are made, and how contributors interact with maintainers.

---

## 1. Roles and Responsibilities

### Project Lead / Owner
- **Primary Maintainer:** [@Avenash005](https://github.com/Avenash005)
- **Authority:** Retains ultimate responsibility and administrative control over the GitHub repository, default branch protection, secrets management, issue triage, and official releases.

### Contributors
Anyone who submits code, documentation, bug reports, feature suggestions, or participates in community discussions is a valued contributor. Contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and [Contribution Guidelines](CONTRIBUTING.md).

---

## 2. Decision-Making Process

### Technical & Architectural Decisions
- Major architectural changes (such as adding dependencies, changing database schemas, introducing new AI providers, or altering privacy guarantees) must be proposed and discussed via a GitHub Issue or Discussion before opening a Pull Request.
- Technical decisions are evaluated on:
  1. **User Privacy & Data Ownership:** Local-first by default; zero unapproved data leakage.
  2. **Code Quality & Maintenance Overhead:** Clean TypeScript types, comprehensive tests, minimal bloated dependencies.
  3. **Security:** Least privilege, verified RLS, and safe secret handling.

### Breaking Changes
Breaking changes to database migrations, API contracts, or configuration must be explicitly approved by the project lead and announced in [CHANGELOG.md](CHANGELOG.md).

---

## 3. Pull Request Review & Merging Policy

1. **All changes to `main` must arrive via Pull Requests:** Direct commits to `main` are restricted.
2. **Automated Verification:** All CI checks (linting, type checking, unit tests, and production build) must pass before a PR can be merged.
3. **Approval:** Every Pull Request requires review and explicit approval by the primary maintainer (`@Avenash005`).
4. **Merge Method:** The preferred merge method for external contributions is **Squash and Merge** to maintain a clean, readable Git history on `main`.

---

## 4. Conflict Resolution

If consensus cannot be reached during technical discussions or pull request reviews:
- The primary maintainer makes the final determination based on project vision, architectural integrity, and security considerations.
- The decision will be documented transparently on the relevant issue or PR with reasoned rationale.

---

## 5. Adding New Maintainers

As the contributor community grows, active contributors who demonstrate consistent high-quality contributions, thoughtful code reviews, adherence to security principles, and alignment with project goals may be invited by the project lead to join as triagers or co-maintainers.

