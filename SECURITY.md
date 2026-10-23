# Security policy

AgentKcal is designed for one user's local machine. Its dashboard binds to `127.0.0.1`; its MCP server runs over local stdio. The application does not provide a shared hosting or multi-user security model.

## Supported versions

Security fixes target the latest version in the `0.1.x` line. Update to the latest available release before reporting a problem with an older version.

## Report a vulnerability

Use the repository's [private vulnerability reporting](https://github.com/0then0/AgentKcal/security/advisories/new) when available. If the form is unavailable, open an issue requesting a private contact channel without posting exploit details, secrets or private logs.

Include:
- The affected AgentKcal version, Node.js version and operating system.
- A minimal reproduction using synthetic data.
- The expected access boundary and the observed impact.
- Any relevant configuration with personal paths and identifiers removed.

Do not attach real agent histories, credentials or account data. Coordinate disclosure through the private reporting channel.

## Scope

Issues that expose local data, bypass the dashboard's origin protections, execute source-provided commands or access files outside documented interfaces can be security vulnerabilities. Programs already running with access to the same user account are within the local trust boundary.

Energy-estimation accuracy is addressed by the [methodology](docs/methodology.md). Data storage, permissions and MCP context sharing are described in [privacy](docs/privacy.md).
