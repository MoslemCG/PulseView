# Security and privacy

PulseView is a local Windows performance monitor. It has no account, cloud sync,
or remote monitoring service. Browser-preview values are simulated. Build-time
dependency downloads and GitHub Actions are separate from application telemetry.

## Reporting a vulnerability

Use the repository's **Security > Advisories > Report a vulnerability** option
when private vulnerability reporting is enabled. If that option is unavailable,
ask a maintainer for a private reporting channel without posting exploit details
or sensitive data in a public issue. No private contact address is bundled here.

Include the affected version, prerequisites, impact and minimal reproduction.
Remove credentials and personal data from all attachments. No formal security
support window or completed native Windows acceptance is claimed.

## Sharing diagnostics

Application data lives under `%LOCALAPPDATA%\PulseView`. Logs, diagnostics,
WebView2 profiles, real saved presets and session drafts are not source files.
Diagnostics can contain local paths and hardware/interface labels; presets can
contain device identifiers and monitor geometry. Review and redact them before
sharing. Do not commit the runtime data directory, credentials, local environment
files, signing keys, build caches, debug symbols or workstation shortcuts.

Install only trusted local CSS themes. See README for safe-mode recovery and
`docs/WINDOWS_ACCEPTANCE.md` for native validation still required before release.
