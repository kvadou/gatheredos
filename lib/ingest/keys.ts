/**
 * Dedupe keys for proposed entities.
 *
 * Every key here is built from model prose, and model prose drifts. One Rheem
 * water heater arrived as "40 gallon natural gas power vent", "…powervent",
 * "…power-vent", "40 gallon gas power vent water heater" and plain "water
 * heater" across five documents, so a key built from the raw string produced
 * five cards for one appliance. The same company arrived as "B&D Plumbing,
 * Heating & Air Conditioning Inc." from a PDF and "B&D Plumbing, Heating & Air
 * Conditioning" from an email.
 *
 * So: normalize hard, and use the SAME function on every path. The document
 * and email pipelines previously built contractor keys in different formats
 * (`contractor:<lowercased raw>` vs `email:contractor:<slug>`), which meant one
 * contractor could never dedupe against itself across sources.
 */

/** Legal suffixes carry no identity — "Acme Inc." and "Acme" are one company. */
const LEGAL_SUFFIXES = /\b(?:inc|llc|l\.l\.c|ltd|co|corp|corporation|company|plc|pllc|llp|lp|gmbh)\b\.?/g

/**
 * Lowercase, expand `&`, drop punctuation, collapse whitespace. Spaces and
 * hyphens are removed entirely in the `tight` form so "power vent",
 * "power-vent" and "powervent" converge — free-text drift is almost always
 * whitespace and hyphenation.
 */
function normalize(value: string, tight: boolean): string {
  const base = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return tight ? base.replace(/\s+/g, '') : base.replace(/\s+/g, '-')
}

/**
 * One key per company, whatever spelled it. Used by both the document and the
 * email pipelines so a contractor seen in an invoice PDF and in the platform's
 * confirmation email produces one card, not two.
 */
export function contractorKey(name: string): string {
  const cleaned = name.toLowerCase().replace(/&/g, ' and ').replace(LEGAL_SUFFIXES, ' ')
  const slug = normalize(cleaned, false)
  // Everything was a legal suffix (or empty) — fall back to the raw name rather
  // than collapsing unrelated contractors onto `contractor:`.
  return `contractor:${slug || normalize(name, false) || 'unknown'}`
}

/**
 * The identity of a purchase: who, when, how much. Null when any part is
 * missing, so callers fall back to a source-scoped key rather than collapsing
 * unrelated rows onto `spend:::`.
 *
 * The vendor runs through the same contractor normalization, because the same
 * drift shows up here: one invoice re-rendered twice came back as "Hero
 * Plumbing, Heating & Cooling" and "Hero Plumbing, Heating and Cooling".
 */
export function spendKey(
  vendor: string | null | undefined,
  occurredOn: string | null | undefined,
  total: number | null | undefined,
): string | null {
  if (!vendor?.trim() || !occurredOn || total == null) return null
  return `spend:${contractorKey(vendor)}:${occurredOn}:${total.toFixed(2)}`
}

/**
 * One key per physical thing: what it is, not how this document spelled it.
 *
 * Keyed on the item's NAME, deliberately. The old key preferred `model`, and a
 * model field is only a stable identifier when it holds a real MPN — on a
 * contractor's invoice it holds prose. One water heater came back as "40 gallon
 * natural gas power vent water heater", "40 gallon natural gas power-vent water
 * heater", "40 gallon natural gas powervent" and "40 gallon gas power vent
 * water heater" across four documents. Every one of them is named "Water
 * heater", and that is the part that does not drift.
 *
 * Manufacturer is out of the key for the same reason: it is often absent (an
 * invoice line names the appliance but not its brand), and a null must not
 * fork a second card for the thing the home already has. The trade is that two
 * genuinely different water heaters in one home propose a single card. That is
 * the better failure: a card the user edits, rather than five they must sift.
 * Manufacturer and model still ride along in the payload and get filled in.
 */
export function itemKey(
  category: string | null | undefined,
  name: string | null | undefined,
): string {
  const cat = normalize(category ?? 'appliance', false) || 'appliance'
  const id = name ? normalize(name, true) : '?'
  return `item:${cat}:${id}`
}
