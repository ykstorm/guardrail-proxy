# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-11

### Added
- Initial release on npm (`@ykstorm/guardrail-proxy`)
- `StreamingGuard` class — 16-token sliding window, hard-abort + soft-observe patterns
- `checkResponse` function — post-hoc audit with 23 CHECK cases
- Pattern library: `CONTACT_LEAK`, `BUSINESS_LEAK`, `PRICE_COMMITMENT_LEAK`, `COMMISSION_DISCUSSION_LEAK`, `NO_MARKDOWN`, `PLACEHOLDER_LEAK`
- MIT License
- 19 unit tests (streaming + check)

### Fixed
- `.npmignore` excludes `src/` from published package
- Build outputs CJS + ESM + TypeScript declarations

### Security
- Patterns designed for buyerchat production use — hard abort on contact/business leak, no data exfiltration