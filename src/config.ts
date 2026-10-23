import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { array, object, type TokenField } from "./models.ts";

export type Coefficient =
  `${Exclude<TokenField, never> extends `${infer B}_tokens` ? B : never}_wh_per_million`;
export type EnergyProfile = Record<Coefficient, number> & { model_pattern: string };
export interface EnergySettings {
  label: string;
  pue: number;
  low_multiplier: number;
  high_multiplier: number;
  profiles: EnergyProfile[];
}
export interface Config {
  version: 1;
  sources: Record<string, string[]>;
  energy: EnergySettings;
}
export const DEFAULT: Config = {
  version: 1,
  sources: {},
  energy: {
    label: "Illustrative scenario · not a measurement",
    pue: 1.2,
    low_multiplier: 0.1,
    high_multiplier: 10,
    profiles: [
      {
        model_pattern: "*",
        input_wh_per_million: 100,
        output_wh_per_million: 400,
        cache_read_wh_per_million: 10,
        cache_write_wh_per_million: 125,
        reasoning_wh_per_million: 400,
      },
    ],
  },
};
export function expandPath(path: string): string {
  return resolve(
    path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path,
  );
}
export function defaultDataDir(): string {
  return expandPath(
    process.env.AGENTKCAL_HOME ||
      join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "agentkcal"),
  );
}
export function validate(value: unknown): Config {
  const config = object(value);
  if (config.version !== 1) throw new Error("unsupported config version; expected version 1");
  const sources = object(config.sources);
  if (
    Object.values(sources).some(
      (paths) => !Array.isArray(paths) || paths.some((path) => typeof path !== "string"),
    )
  )
    throw new Error("sources must map adapter names to lists of paths");
  const energy = object(config.energy);
  const number = (value: unknown, name: string, min = 0): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min)
      throw new Error(`invalid energy setting: ${name}`);
    return value;
  };
  number(energy.pue, "pue", 1);
  if (number(energy.low_multiplier, "low_multiplier") > 1)
    throw new Error("low_multiplier must be <= 1");
  number(energy.high_multiplier, "high_multiplier", 1);
  if (typeof energy.label !== "string" || !energy.label.trim())
    throw new Error("energy label is required");
  const profiles = array(energy.profiles);
  if (!profiles.length) throw new Error("at least one energy profile is required");
  for (const value of profiles) {
    const profile = object(value);
    if (typeof profile.model_pattern !== "string") throw new Error("profile needs model_pattern");
    for (const bucket of ["input", "output", "cache_read", "cache_write", "reasoning"])
      number(profile[`${bucket}_wh_per_million`], bucket);
  }
  if (object(profiles.at(-1)).model_pattern !== "*")
    throw new Error("last profile must be the '*' fallback");
  return config as unknown as Config;
}
export function load(dataDir: string): Config {
  const path = join(dataDir, "config.json");
  return existsSync(path)
    ? validate(JSON.parse(readFileSync(path, "utf8")))
    : structuredClone(DEFAULT);
}
export function initialize(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "config.json");
  try {
    writeFileSync(path, `${JSON.stringify(DEFAULT, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return path;
}
