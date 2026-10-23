import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonical, type UsageEvent, usageEvent } from "./models.ts";

export class Store implements Disposable {
  readonly path: string;
  readonly db: DatabaseSync;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.path = join(dataDir, "usage.sqlite3");
    this.db = new DatabaseSync(this.path);
    try {
      chmodSync(this.path, 0o600);
      this.db.exec("PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL");
      const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
      if (version !== 0 && version !== 1)
        throw new Error(`unsupported database version ${version}`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS events (
        agent TEXT NOT NULL, session_id TEXT NOT NULL, event_id TEXT NOT NULL,
        timestamp TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(agent,session_id,event_id));
        CREATE INDEX IF NOT EXISTS events_timestamp ON events(timestamp);
        PRAGMA user_version=1;`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
  [Symbol.dispose](): void {
    this.close();
  }
  upsert(events: UsageEvent[]): number {
    const select = this.db.prepare(
      "SELECT payload FROM events WHERE agent=? AND session_id=? AND event_id=?",
    );
    const insert =
      this.db.prepare(`INSERT INTO events VALUES(?,?,?,?,?) ON CONFLICT(agent,session_id,event_id)
      DO UPDATE SET timestamp=excluded.timestamp,payload=excluded.payload`);
    let changed = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const value of events) {
        const event = usageEvent(value);
        const previous = select.get(event.agent, event.session_id, event.event_id);
        const payload = canonical(event as unknown as Record<string, unknown>);
        if (
          previous &&
          canonical(
            usageEvent(JSON.parse(String(previous.payload))) as unknown as Record<string, unknown>,
          ) === payload
        )
          continue;
        changed += Number(
          insert.run(event.agent, event.session_id, event.event_id, event.timestamp, payload)
            .changes,
        );
      }
      this.db.exec("COMMIT");
      return changed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  events(since?: string, agent?: string, session?: string): UsageEvent[] {
    const conditions: string[] = [],
      params: string[] = [];
    if (since) {
      conditions.push("timestamp >= ?");
      params.push(since);
    }
    if (agent) {
      conditions.push("agent = ?");
      params.push(agent);
    }
    if (session) {
      conditions.push("session_id = ?");
      params.push(session);
    }
    return this.db
      .prepare(
        `SELECT payload FROM events${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY timestamp,agent,event_id`,
      )
      .all(...params)
      .map((row) => usageEvent(JSON.parse(String(row.payload))));
  }
  agents(): string[] {
    return this.db
      .prepare("SELECT DISTINCT agent FROM events ORDER BY agent")
      .all()
      .map((row) => String(row.agent));
  }
}
