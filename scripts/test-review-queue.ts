/**
 * Review-queue quality: one real thing should produce one card.
 *
 * Every string below is copied out of a real queue that had 37 pending cards,
 * of which roughly 30 were noise:
 *   - one Rheem water heater as five cards, because the model transcribed the
 *     model string five ways and the dedupe key was built from raw prose
 *   - one contractor as two cards, because the document and email pipelines
 *     built contractor keys in different formats
 *   - 18 to-dos and 2 projects off a plumbing quote sheet, because findings
 *     were turned into proposals without checking the document was an
 *     inspection report
 *
 * No Claude calls.
 *
 * Run: pnpm test:review-queue
 */
import { contractorKey, itemKey } from '../lib/ingest/keys'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) {
    failures += 1
    if (detail !== undefined) console.log('       got:', JSON.stringify(detail))
  }
}
function same(label: string, values: string[]) {
  const unique = [...new Set(values)]
  check(label, unique.length === 1, unique)
}
function distinct(label: string, values: string[]) {
  check(label, new Set(values).size === values.length, values)
}

// The five cards one water heater produced. Every one of them was NAMED
// "Water heater"; only the model prose drifted, which is why the key no longer
// looks at the model at all.
same('one water heater, one key', [
  itemKey('appliance', 'Water heater'),
  itemKey('appliance', 'water heater'),
  itemKey('appliance', 'Water  Heater'),
  itemKey('appliance', 'Water-heater'),
])

// Real differences must survive normalization.
distinct('different things stay distinct', [
  itemKey('appliance', 'Water heater'),
  itemKey('appliance', 'Water heater expansion tank'),
  itemKey('appliance', 'Furnace'),
  itemKey('system', 'Water heater'),
])

// The two cards one contractor produced, across two pipelines.
same('one contractor, one key', [
  contractorKey('B&D Plumbing, Heating & Air Conditioning Inc.'),
  contractorKey('B&D Plumbing, Heating & Air Conditioning'),
  contractorKey('B and D Plumbing, Heating and Air Conditioning'),
  contractorKey('  B&D  Plumbing,  Heating & Air Conditioning, LLC  '),
])
same('legal suffixes are noise', [
  contractorKey('Lebrun Electric LLC'),
  contractorKey('Lebrun Electric'),
  contractorKey('Lebrun Electric, L.L.C.'),
])
distinct('different contractors stay distinct', [
  contractorKey('Hero Plumbing, Heating & Cooling'),
  contractorKey('Hero Electric'),
  contractorKey('Elander Mechanical Inc'),
])
// A name that is nothing but a suffix must not collapse onto every other one.
check('an all-suffix name keeps an identity',
  contractorKey('LLC') !== contractorKey('Inc') && contractorKey('LLC') !== 'contractor:',
  [contractorKey('LLC'), contractorKey('Inc')])

console.log(failures === 0 ? '\nREVIEW QUEUE RULES PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
