# Extending AgentKcal

Adapters normalize source records; energy providers estimate energy from those records. Both are TypeScript interfaces, independent of CLI, HTTP and MCP presentation.

## Add an adapter

Create a module under `src/adapters/` implementing `Adapter`:

```ts
import type { Adapter } from "./base.ts";
import { jsonLines } from "./base.ts";
import { usageEvent, type UsageEvent } from "../models.ts";

export class ExampleAdapter implements Adapter {
  readonly name = "example";
  readonly title = "Example agent";
  readonly mode = "Local JSONL";
  readonly patterns = ["*.jsonl"];

  defaultRoots(): string[] {
    return [];
  }

  read(path: string): UsageEvent[] {
    return jsonLines(path).map((row) =>
      usageEvent({
        agent: this.name,
        event_id: row.request_id,
        session_id: row.session_id,
        timestamp: row.timestamp,
        model: row.model || "unknown",
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
      }),
    );
  }
}
```

Register an instance in `ADAPTERS` in `src/adapters/index.ts`. CLI choices, source configuration, dashboard metadata and MCP adapter choices use that registry. Add a friendly title/symbol in `src/web/app.ts` if useful; unknown IDs already display safely. Update the README adapter badge count for built-in additions.

Verify whether cache/reasoning counters are subsets before normalizing them into disjoint buckets. Do not estimate tokens from characters, prices or subscription limits. Preserve stable native IDs and replace repeated streaming snapshots. Keep missing model IDs as `unknown`.

The service acquires the SQLite writer lock before reading each complete file, then writes its normalized events in the same transaction. Keep source reading inside the `Store.upsert` callback so concurrent imports cannot overwrite newer snapshots with older ones. Malformed/truncated files must commit no prefix. Errors must not include source contents. Never execute source-provided commands or load plugins from an agent's private directory. Fixtures must be synthetic, without prompts, credentials, account identifiers or personal paths.

## Add an energy provider

Implement `EnergyProvider.estimate(event): EnergyEstimate` under `src/providers/`. Return `wh`, `low_wh`, `high_wh`, `kcal`, `method` and `profile`. `report` accepts an optional provider as its final parameter. Wire a selected provider into all presentation paths, including `snapshot` for compact integrations. There is no external plugin loader.

Preserve raw usage so changing coefficients does not require reimport. Document provenance and boundaries. GPU telemetry replaces token inference for the same work; never add both, or substitute session wall time for accelerator allocation.

## Verify

```sh
npm run check
npm run typecheck
npm test
npm run test:package
```

Use disposable homes and explicit fixture paths. Protect bucket semantics, idempotency, updates, file atomicity, SQLite compatibility, unknown models and the absence of persisted conversation content. MCP protocol details are in `src/integrations/mcp.ts`; do not add arbitrary file access or shell execution tools.
