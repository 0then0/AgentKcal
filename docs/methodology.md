# Methodology

AgentKcal separates recorded token accounting from an energy scenario. Tokens are reported by software, not verified by a power meter. Their availability and meaning depend on the originating provider and agent version.

## Units and boundaries

One watt-hour is 3,600 joules. One thermochemical kilocalorie is 4,184 joules, so 1 Wh is approximately 0.86042 kcal. This conversion is physical and exact for those unit definitions; the uncertainty is in the energy estimate upstream. Food labels and human metabolism are not part of the model.

The token scenario assigns separate Wh per million tokens to uncached input, visible output, cache reads, cache writes, and separately reported reasoning. The default values are deliberately labeled illustrative. They are not inferred from money spent, model parameters, subscription tier, or a claim about any vendor's efficiency. The default cache relationship is an assumption, not a measured energy saving.

PUE (power usage effectiveness) multiplies the IT energy scenario by a data-center overhead factor. It must be at least 1. The default 1.2 is an assumption, not the PUE of your provider. CPU, memory, storage and host overhead are not separately modeled; calibrate coefficients to your chosen system boundary. Do not apply PUE again if supplied power or coefficients already include facility overhead.

## Calibrate a scenario

Run `agentkcal init` and edit `config.json`. Every profile needs `model_pattern` and all five non-negative finite coefficients:

```json
{
  "model_pattern": "my-local-model*",
  "input_wh_per_million": 100,
  "output_wh_per_million": 400,
  "cache_read_wh_per_million": 10,
  "cache_write_wh_per_million": 125,
  "reasoning_wh_per_million": 400
}
```

These sample values are the same illustrative defaults, not a new benchmark. Insert a profile before the final `*` profile, replace values using your own evidence, and describe that evidence in `energy.label`. First matching model pattern wins. Matching is case-insensitive. Cline may have model `unknown`, so it generally uses the fallback. A model ID alone cannot reveal hardware, quantization, speculative decoding, context length, routing or request batching.

Energy is recalculated from raw normalized records when a report is requested. Export JSON to preserve a result together with the full configuration and generation time; there is no historical configuration version ledger. CSV includes the scenario as a JSON-valued column.

## Compute telemetry

Normalized JSONL can supply both `gpu_seconds` and `gpu_watts`. This selects the compute method for that event, even when token counts are also present:

```text
GPU time: 60 seconds
Effective GPU power: 180 W
PUE: 1.2
Energy: 60 × 180 / 3,600 × 1.2 = 3.6 Wh
Equivalent: 3.6 × 3,600 / 4,184 ≈ 3.0975 kcal
```

GPU time should represent allocated device time summed across the devices attributable to the record. Power should represent the corresponding effective average watts per allocated GPU. A 10-second request is not necessarily 10 GPU-seconds; asynchronous work, shared batching, CPU steps and network waits prevent that equivalence. AgentKcal does not collect hardware telemetry or obtain backend allocation data itself.

## Sensitivity range

The report multiplies the central scenario by `low_multiplier` and `high_multiplier`. Defaults are 0.1 and 10. These are sensitivity controls; no underlying probability distribution or measured coverage supports them. They are not an assurance that the real value is within the range. They apply to supplied-compute scenarios too, because effective power attribution can also be uncertain.

When all profiles produce zero energy, the application reports zero rather than inventing a minimum. Display rounding can turn tiny positive values into `0`; JSON exports retain full numerical precision.

## Completeness

Reported tokens omit work an agent or provider did not record. Private reasoning may be reported separately, inside output, or not at all. Agent retries, compaction, tool calls and subagents are included only where their records are available. Forked transcripts can repeat ancestry. The initial Codex cumulative snapshot is attributed to its recorded time because finer-grained timing is unavailable. Token buckets do not represent unique text, and different tokenizers prevent strict comparison of equivalent work.

The estimate excludes training, embodied hardware energy, agent-host energy, external tool execution, network traffic and user-device consumption. It also does not estimate emissions: converting energy into CO₂ requires additional location/time-dependent evidence. Food comparisons below illustrate equivalent energy; they do not infer actual food consumption, human effort or metabolism.

## Food comparisons

The dashboard uses the same filtered report's kcal and divides by the energy in an explicitly defined comparison portion:

```text
portion_kcal = portion_grams × kcal_per_100g / 100
equivalent_portions = estimated_kcal / portion_kcal
```

Low/high scenario values are converted using the same portion. Nutritional variation is not assigned an additional statistical range. Portion masses are application assumptions, not a claim that every item or package has that size. The comparison catalog uses these reference values:
- **Buckwheat:** an assumed 800 g pack of dry grain, at 335 kcal per 100 g, gives 2,680 kcal per comparison pack. The energy density is listed for Mistral grain by [this retailer](https://www.delo.spb.ru/catalog/product/12092-krupa-grechka-mistral-yadrica-900-g/); its actual retail package is 900 g. AgentKcal deliberately uses a generic assumed 800 g portion. Cooking adds water and changes calories per 100 g, so cooked-porridge mass is not interchangeable with this dry-grain mass.
- **Dumplings:** an assumed 15 g frozen dumpling, at 270 kcal per 100 g, gives 40.5 kcal each. The energy density follows [Sibirskaya Collection's classic product label](https://sibircollection.ru/products/pelmeni/gourmet/klassicheskie/). The weight of one dumpling is an assumption; sauces and preparation are excluded.
- **White bread:** an assumed 400 g loaf, at 265 kcal per 100 g, gives 1,060 kcal. This [retail product listing](https://m.integration.vs.market.yandex.net/card/baton-nareznoy-kolomenskiy-v-narezke/103809380196) reports both values for a sliced white loaf. Other recipes and loaf sizes vary.
- **Milk:** an assumed 1,000 g carton of 3.2% milk, at 59 kcal per 100 g, gives 590 kcal. The energy density comes from [Prostokvashino's product page](https://prostokvashino.ru/product/moloko-pasterizovannoe-3-2--1-4-l/). The comparison uses **mass, not litres**; the manufacturer's listed package has a different volume. No density conversion is assumed.
- **Banana:** an assumed 118 g edible portion without peel, at 89 kcal per 100 g, gives 105.02 kcal. [USDA FoodData Central record 173944](https://fdc.nal.usda.gov/food-details/173944/nutrients) identifies raw bananas; this [record summary](https://whatyoueat.io/foods/173944-bananas) reports the per-100 g energy. The actual fruit's edible mass varies.

- **Rice:** an assumed 800 g pack of dry white long-grain rice, at 365 kcal per 100 g, gives 2,920 kcal. The per-100 g value is reported in this [USDA-derived record summary](https://nutritiondatahub.com/food/rice-white-long-grain-regular-raw-enriched-168877). The portion is dry grain; cooked rice includes added water and has a different energy density.
- **Corn:** an assumed cob with 100 g of edible raw sweet-corn kernels, at 86 kcal per 100 g, gives 86 kcal. The energy density is reported in this [USDA-derived record summary](https://rawpawiq.com/ingredient/corn-sweet-yellow-raw-169998). Husk and inedible cob mass are excluded; the 100 g edible yield per cob is an application assumption. Canned corn and corn cooked with additions are not this comparison.
- **Potato:** an assumed 150 g raw potato including skin, at 77 kcal per 100 g, gives 115.5 kcal. This [USDA-derived record summary](https://nutritiondatahub.com/food/potatoes-flesh-and-skin-raw-170026) reports the energy density. The assumed tuber mass varies in practice; frying, added oil and other preparations are not modeled.

The panel uses original, unbranded local SVG illustrations and makes no runtime request to food databases or retailers. There is no endorsement, product inventory, personal dietary target or nutrition recommendation. Food definitions live in `src/web/foods.ts`; the UI supports English, Russian, Spanish, German, French, Japanese and Brazilian Portuguese in both themes. Selection is a local browser preference and does not change the underlying ledger or exports.

At most five portion icons are drawn; a badge displays equivalents beyond those five. A partially filled icon represents a fractional portion. The progress bar is `100 × fractional_part(equivalent_portions)` and resets to zero at whole portions, including zero. Quantities are approximately displayed to two decimals, with a less-than label for tiny positive values; unit grammar follows the displayed number. Binary floating-point artifacts at exact whole-portion boundaries are normalized.

## References and interpretation

- [OpenAI Codex usage protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs): source accounting fields, not energy coefficients.
- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage): reported usage and cache conventions.
- [Gemini CLI token recording](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/chatRecordingService.ts): mapping API counters into session records.
- [OpenCode usage normalization](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/usage.ts): disjoint usage fields.
- [NIST SI guide, unit conversions](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b8): physical unit conventions.

These links explain field semantics and units. None validates AgentKcal's illustrative default energy coefficients.
