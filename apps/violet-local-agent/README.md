# VIOLET Local Agent — Windows

This package is the local execution-plane component for VIOLET. It runs in the signed-in Windows user's session and exposes a small authenticated localhost API to a trusted desktop shell or local orchestrator adapter.

## Current capabilities

- Local health and capability discovery.
- File listing and UTF-8 text reading inside explicitly approved roots.
- Create-new text files; existing files are never overwritten.
- Named command execution from an administrator-maintained allowlist. The model cannot supply arbitrary command arguments.
- On-demand primary-screen screenshots.
- Redacted JSONL audit events.

Desktop mouse/keyboard control, arbitrary shell commands, browser profile access and remote pairing are intentionally not included in this first package. They need a visible desktop approval surface, user-session integration, stronger device identity and action-specific consent.

## Security model

- Binds to 127.0.0.1 only; non-loopback bind is rejected.
- Requires a random bearer token, compared in constant time.
- Does not enable permissive CORS.
- Does not expose the agent directly to the LAN or internet.
- File operations are constrained to resolved paths under configured approved roots.
- Reads are size-limited and UTF-8 only.
- Writes create new files only and reject overwrite.
- Commands are selected by a fixed command ID and run with shell=False, fixed arguments, timeout, bounded output and approved working directory.
- Audit logs omit file contents and secrets.

A localhost API is not a secure remote pairing system. Do not port-forward it or tunnel it publicly. Future remote access must use an authenticated outbound relay with per-device keys, short-lived task grants and revocation.

## Setup

Use Python 3.12 on Windows 11:

~~~powershell
cd apps/violet-local-agent
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
~~~

Generate a token:

~~~powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
~~~

Set VIOLET_API_TOKEN and edit VIOLET_ALLOWED_ROOTS in .env. Paths must be existing directories. Keep VIOLET_HOST=127.0.0.1.

Start:

~~~powershell
violet-local-agent
~~~

Open http://127.0.0.1:8765/docs. The /health endpoint is unauthenticated for local health checks; all /v1/* endpoints require Authorization: Bearer <token>.

## Named command allowlist

The default allowlist is empty. Configure VIOLET_COMMANDS_JSON as a JSON object mapping IDs to fixed executable, argument array, approved-root index and risk. Only read_only commands are accepted until the local approval gateway is implemented. For example:

~~~json
{
  "git_status": {
    "executable": "git",
    "args": ["status", "--short"],
    "root_index": 0,
    "risk": "read_only"
  },
  "python_version": {
    "executable": "python",
    "args": ["--version"],
    "root_index": 0
  }
}
~~~

The request contains only command_id; it cannot add arguments or override the working directory. Do not configure commands that delete, install, publish, deploy, transfer money or otherwise create consequential side effects without a separate approval workflow.

## Tests

~~~powershell
python -m pip install -e .[dev]
python -m pytest
~~~

This starter does not claim to be a production-hardened remote-control service. Device pairing, visible approval UI, signed updates, Windows UI Automation and browser handoff are separate roadmap items.
