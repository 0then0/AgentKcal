import type { EnergySettings } from "../config.ts";
import { TOKEN_FIELDS, type UsageEvent } from "../models.ts";

export interface EnergyEstimate {
  wh: number;
  low_wh: number;
  high_wh: number;
  kcal: number;
  method: "tokens" | "compute";
  profile: string;
}
export interface EnergyProvider {
  estimate(event: UsageEvent): EnergyEstimate;
}

/** Shell-style model patterns, including character classes, independent of OS paths. */
export function matches(model: string, pattern: string): boolean {
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") regex += ".*";
    else if (char === "?") regex += ".";
    else if (char === "[") {
      const end = pattern.indexOf("]", i + (pattern[i + 1] === "!" ? 2 : 1));
      if (end < 0) regex += "\\[";
      else {
        const body = pattern.slice(i + 1, end);
        regex += `[${body.startsWith("!") ? `^${body.slice(1)}` : body.replace(/^\^/, "\\^").replaceAll("\\", "\\\\")}]`;
        i = end;
      }
    } else regex += char?.replace(/[\\^$+?.()|{}\]]/g, "\\$&");
  }
  try {
    return new RegExp(`${regex}$`, "i").test(model);
  } catch {
    return false;
  }
}
export class ScenarioProvider implements EnergyProvider {
  readonly settings: EnergySettings;
  constructor(settings: EnergySettings) {
    this.settings = settings;
  }
  estimate(event: UsageEvent): EnergyEstimate {
    let wh: number, method: EnergyEstimate["method"], pattern: string;
    if (event.gpu_seconds !== null && event.gpu_watts !== null) {
      wh = (event.gpu_seconds * event.gpu_watts) / 3600;
      method = "compute";
      pattern = "reported GPU time × supplied power";
    } else {
      const profile = this.settings.profiles.find((profile) =>
        matches(event.model, profile.model_pattern),
      );
      if (!profile) throw new Error("no matching energy profile; configure a '*' fallback");
      const coefficients = [
        profile.input_wh_per_million,
        profile.output_wh_per_million,
        profile.cache_read_wh_per_million,
        profile.cache_write_wh_per_million,
        profile.reasoning_wh_per_million,
      ];
      wh =
        TOKEN_FIELDS.reduce((sum, key, index) => sum + event[key] * (coefficients[index] ?? 0), 0) /
        1e6;
      method = "tokens";
      pattern = profile.model_pattern;
    }
    wh *= this.settings.pue;
    const result = {
      wh,
      low_wh: wh * this.settings.low_multiplier,
      high_wh: wh * this.settings.high_multiplier,
      kcal: (wh * 3600) / 4184,
      method,
      profile: pattern,
    };
    if (![result.wh, result.low_wh, result.high_wh, result.kcal].every(Number.isFinite))
      throw new Error("energy scenario exceeds numeric range");
    return result;
  }
}
