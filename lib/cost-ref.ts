// Benchmark cost estimates for grounding "estimated" answers in Ask GatheredOS —
// national 2026 installed prices and typical lifespans, NOT this home's own
// records. Adjusted for the home's state via REGIONAL_MULTIPLIER before it
// reaches the prompt. Cite anything derived from this as type "general",
// ref_id null, confidence "estimated", and phrase it as an estimate.
// Refresh annually (Remodeling Cost-vs-Value / national installed averages).
// This is the playbook's cost_ref object shipped as a static file per the
// object-model decision (no DB table).

export type CostRef = {
  key: string
  label: string
  replaceLow: number
  replaceHigh: number
  lifespanYears: [number, number]
  unit?: 'each' | 'sqft'
}

/** Systems and appliances a homeowner eventually replaces. Ranges are the full
 *  installed job in 2026 USD unless `unit` says otherwise (e.g. per window). */
export const SYSTEM_COSTS: CostRef[] = [
  { key: 'water_heater_tank', label: 'Water heater (tank)', replaceLow: 1200, replaceHigh: 2500, lifespanYears: [8, 12] },
  { key: 'water_heater_tankless', label: 'Water heater (tankless)', replaceLow: 2800, replaceHigh: 5500, lifespanYears: [18, 20] },
  { key: 'furnace', label: 'Gas furnace', replaceLow: 4500, replaceHigh: 9000, lifespanYears: [15, 25] },
  { key: 'central_ac', label: 'Central air conditioner', replaceLow: 4000, replaceHigh: 8500, lifespanYears: [12, 17] },
  { key: 'heat_pump', label: 'Heat pump', replaceLow: 5500, replaceHigh: 12000, lifespanYears: [12, 15] },
  { key: 'roof_asphalt', label: 'Roof (asphalt shingle)', replaceLow: 9000, replaceHigh: 22000, lifespanYears: [20, 30] },
  { key: 'windows', label: 'Replacement window', replaceLow: 500, replaceHigh: 1200, lifespanYears: [20, 40], unit: 'each' },
  { key: 'exterior_paint', label: 'Exterior repaint', replaceLow: 3500, replaceHigh: 8000, lifespanYears: [7, 10] },
  { key: 'interior_paint', label: 'Interior repaint (per room)', replaceLow: 400, replaceHigh: 1000, lifespanYears: [5, 10], unit: 'each' },
  { key: 'deck_build', label: 'Deck build', replaceLow: 6000, replaceHigh: 16000, lifespanYears: [15, 25] },
  { key: 'garage_door', label: 'Garage door + opener', replaceLow: 1200, replaceHigh: 4000, lifespanYears: [15, 30] },
  { key: 'dishwasher', label: 'Dishwasher', replaceLow: 700, replaceHigh: 1600, lifespanYears: [9, 12] },
  { key: 'refrigerator', label: 'Refrigerator', replaceLow: 1200, replaceHigh: 3500, lifespanYears: [10, 15] },
  { key: 'range', label: 'Range / stove', replaceLow: 900, replaceHigh: 2500, lifespanYears: [13, 17] },
  { key: 'washer_dryer', label: 'Washer + dryer', replaceLow: 1400, replaceHigh: 3200, lifespanYears: [10, 14] },
  { key: 'sump_pump', label: 'Sump pump', replaceLow: 400, replaceHigh: 1200, lifespanYears: [7, 10] },
  { key: 'well_pump', label: 'Well pump', replaceLow: 1500, replaceHigh: 4000, lifespanYears: [8, 15] },
  { key: 'septic_system', label: 'Septic system', replaceLow: 6000, replaceHigh: 15000, lifespanYears: [20, 40] },
  { key: 'driveway_asphalt', label: 'Driveway (asphalt)', replaceLow: 3000, replaceHigh: 8000, lifespanYears: [15, 25] },
  { key: 'fence_wood', label: 'Fence (wood)', replaceLow: 2500, replaceHigh: 6500, lifespanYears: [15, 20] },
  { key: 'gutters', label: 'Gutters', replaceLow: 1000, replaceHigh: 3000, lifespanYears: [20, 30] },
  { key: 'electrical_panel', label: 'Electrical panel', replaceLow: 1500, replaceHigh: 4000, lifespanYears: [25, 40] },
  { key: 'water_softener', label: 'Water softener', replaceLow: 1000, replaceHigh: 3000, lifespanYears: [10, 20] },
]

export type ProjectRecoup = {
  key: string
  label: string
  costLow: number
  costHigh: number
  /** Share of cost recouped at resale, low/high, as decimals (0.75 = 75%). */
  recoupPct: [number, number]
}

/** Remodel projects with typical 2026 cost and cost-recouped-at-resale range,
 *  Remodeling Cost-vs-Value style. recoupPct is a fraction, not a dollar value. */
export const PROJECT_RECOUP: ProjectRecoup[] = [
  { key: 'kitchen_minor', label: 'Minor kitchen remodel (midrange)', costLow: 27000, costHigh: 32000, recoupPct: [0.75, 0.96] },
  { key: 'kitchen_major', label: 'Major kitchen remodel (midrange)', costLow: 75000, costHigh: 90000, recoupPct: [0.40, 0.53] },
  { key: 'bath_midrange', label: 'Bathroom remodel (midrange)', costLow: 25000, costHigh: 30000, recoupPct: [0.55, 0.67] },
  { key: 'bath_upscale', label: 'Bathroom remodel (upscale)', costLow: 70000, costHigh: 80000, recoupPct: [0.36, 0.45] },
  { key: 'deck_wood', label: 'Wood deck addition', costLow: 17000, costHigh: 20000, recoupPct: [0.50, 0.68] },
  { key: 'deck_composite', label: 'Composite deck addition', costLow: 24000, costHigh: 28000, recoupPct: [0.40, 0.55] },
  { key: 'siding', label: 'Fiber-cement siding replacement', costLow: 20000, costHigh: 24000, recoupPct: [0.55, 0.88] },
  { key: 'entry_door', label: 'Steel entry door replacement', costLow: 2200, costHigh: 2500, recoupPct: [0.90, 1.88] },
  { key: 'garage_door', label: 'Garage door replacement', costLow: 4500, costHigh: 5000, recoupPct: [0.90, 1.94] },
  { key: 'solar', label: 'Solar panel installation', costLow: 25000, costHigh: 35000, recoupPct: [0.30, 0.60] },
  { key: 'finished_basement', label: 'Finished basement', costLow: 40000, costHigh: 75000, recoupPct: [0.45, 0.70] },
  { key: 'primary_suite', label: 'Primary suite addition (upscale)', costLow: 150000, costHigh: 320000, recoupPct: [0.22, 0.35] },
]

/** State cost-of-construction multiplier vs. national average (1.0). Coastal
 *  metros run hot; much of the midwest and south runs below average. */
export const REGIONAL_MULTIPLIER: Record<string, number> = {
  AL: 0.88, AK: 1.25, AZ: 0.98, AR: 0.85, CA: 1.35, CO: 1.08, CT: 1.20,
  DE: 1.05, DC: 1.30, FL: 0.98, GA: 0.92, HI: 1.45, ID: 0.95, IL: 1.05,
  IN: 0.90, IA: 0.90, KS: 0.88, KY: 0.88, LA: 0.90, ME: 1.05, MD: 1.18,
  MA: 1.35, MI: 0.95, MN: 1.02, MS: 0.85, MO: 0.90, MT: 0.98, NE: 0.90,
  NV: 1.02, NH: 1.10, NJ: 1.28, NM: 0.92, NY: 1.30, NC: 0.92, ND: 0.95,
  OH: 0.92, OK: 0.85, OR: 1.12, PA: 1.05, RI: 1.18, SC: 0.90, SD: 0.90,
  TN: 0.90, TX: 0.95, UT: 0.98, VT: 1.08, VA: 1.02, WA: 1.20, WV: 0.88,
  WI: 0.98, WY: 0.95,
}

const round50 = (n: number) => Math.round(n / 50) * 50

/** Region-adjusted snapshot of the benchmarks, ready to JSON.stringify into the
 *  Ask prompt. Dollar values scale by the home's state multiplier and round to
 *  $50; lifespans and recoup percentages are region-independent. */
export function costRefFor(home: { state?: string | null }) {
  const multiplier = REGIONAL_MULTIPLIER[(home.state ?? '').toUpperCase()] ?? 1.0
  return {
    multiplier,
    systems: SYSTEM_COSTS.map((s) => ({
      ...s,
      replaceLow: round50(s.replaceLow * multiplier),
      replaceHigh: round50(s.replaceHigh * multiplier),
    })),
    projects: PROJECT_RECOUP.map((p) => ({
      ...p,
      costLow: round50(p.costLow * multiplier),
      costHigh: round50(p.costHigh * multiplier),
    })),
  }
}
