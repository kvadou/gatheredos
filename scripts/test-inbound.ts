/**
 * Forward-in checks. No Claude calls, no network — pure transformation.
 *
 * The two things that carry real risk:
 *
 *   1. Unwrapping. Forwarded mail arrives FROM the homeowner, and the
 *      contractor-identity rule keys on the sender. Ingesting a forward without
 *      recovering the original sender reintroduces the first bug real mail ever
 *      found: unreadable invoice + wrong sender = contractor discarded.
 *   2. Address parsing. The token in the recipient address is the only thing
 *      authorizing a write to a home, so a parser that is loose about domains
 *      or shapes is a way into someone else's records.
 *
 * Run: pnpm test:inbound
 */
import { unwrapForwarded } from '../lib/inbound/forwarded'
import { adaptInbound, type InboundEmail } from '../lib/inbound/message'
import { generateInboundToken, localPartOf } from '../lib/inbound/address'
import { header } from '../lib/gmail/message'

process.env.INBOUND_EMAIL_DOMAIN = 'in.gatheredos.com'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) {
    failures += 1
    if (detail !== undefined) console.log('       got:', JSON.stringify(detail))
  }
}

// ---- unwrapping, one real format per client ----

const GMAIL = `FYI

---------- Forwarded message ---------
From: Lebrun Electric LLC <noreply+725535@servicetitan.com>
Date: Mon, Dec 19, 2022 at 3:04 PM
Subject: Appointment Confirmation with Lebrun Electric LLC
To: Doug Kvamme <dougkvamme@gmail.com>

Your appointment is confirmed for Jan 3, 2023 between 8am and 10am.`

const APPLE = `Begin forwarded message:

From: Hero Plumbing <no-reply@herohomeservices.com>
Subject: Your invoice from Hero Plumbing
Date: February 4, 2021 at 9:12:00 AM CST
To: doug@example.com

Invoice 458842. Amount due $118.87.`

const OUTLOOK = `-----Original Message-----
From: B&D Plumbing <service@bdplumbing.com>
Sent: Friday, August 7, 2020 11:02 AM
To: Doug Kvamme
Subject: Invoice provided by B&D

Trip charge $50.00`

const gmail = unwrapForwarded(GMAIL)
check('gmail: original sender recovered', gmail?.from.includes('servicetitan.com') === true, gmail?.from)
check('gmail: original subject recovered', gmail?.subject === 'Appointment Confirmation with Lebrun Electric LLC', gmail?.subject)
check('gmail: original date recovered', gmail?.date?.startsWith('2022-12-19') === true, gmail?.date)
check('gmail: header block stripped from body', gmail?.body.startsWith('Your appointment') === true, gmail?.body?.slice(0, 40))
check('gmail: forwarding note dropped', gmail?.body.includes('FYI') === false)

const apple = unwrapForwarded(APPLE)
check('apple mail: sender recovered', apple?.from.includes('herohomeservices.com') === true, apple?.from)
check('apple mail: date recovered', apple?.date?.startsWith('2021-02-04') === true, apple?.date)

const outlook = unwrapForwarded(OUTLOOK)
check('outlook: sender recovered', outlook?.from.includes('bdplumbing.com') === true, outlook?.from)
check('outlook: Sent: read as the date', outlook?.date?.startsWith('2020-08-07') === true, outlook?.date)

check('a normal message is not treated as a forward', unwrapForwarded('Hi, here is your invoice.') === null)
check('a banner with no From: is not a forward',
  unwrapForwarded('---------- Forwarded message ---------\n\nlook at this') === null)
check('a future date is rejected rather than dating a visit wrongly',
  unwrapForwarded('---------- Forwarded message ---------\nFrom: a@b.com\nDate: Mon, Dec 19, 2099 at 3:04 PM\n\nhi')?.date === null)

// ---- adapting: what the pipeline actually reads ----

const inbound = (over: Partial<InboundEmail> = {}): InboundEmail => ({
  messageId: 'msg-1',
  from: 'Doug Kvamme <dougkvamme@gmail.com>',
  to: ['h-abcdefgh23456789@in.gatheredos.com'],
  subject: 'Fwd: Appointment Confirmation',
  text: GMAIL,
  html: null,
  receivedAt: '2026-08-03T12:00:00.000Z',
  attachments: [],
  ...over,
})

const adapted = adaptInbound(inbound())
check('adapter: From: is the contractor, not the forwarder',
  header(adapted.message, 'from').includes('servicetitan.com'), header(adapted.message, 'from'))
check('adapter: reports that it unwrapped', adapted.unwrapped === true)
check('adapter: message is dated when the original was sent, not when forwarded',
  new Date(Number(adapted.message.internalDate)).toISOString().startsWith('2022-12-19'),
  adapted.message.internalDate)

const direct = adaptInbound(inbound({
  text: 'Your appointment is confirmed.',
  from: 'Lebrun Electric LLC <noreply+725535@servicetitan.com>',
}))
check('adapter: a message sent straight to the address keeps its sender',
  header(direct.message, 'from').includes('servicetitan.com'))
check('adapter: and is not marked unwrapped', direct.unwrapped === false)

check('adapter: signature-sized images are not filed',
  adaptInbound(inbound({
    attachments: [{ filename: 'logo.png', contentType: 'image/png', content: Buffer.alloc(4_000) }],
  })).attachments.length === 0)
check('adapter: a real invoice PDF is filed',
  adaptInbound(inbound({
    attachments: [{ filename: 'Invoice.pdf', contentType: 'application/pdf', content: Buffer.alloc(50_000) }],
  })).attachments.length === 1)
check('adapter: an executable attachment is not filed',
  adaptInbound(inbound({
    attachments: [{ filename: 'run.exe', contentType: 'application/x-msdownload', content: Buffer.alloc(50_000) }],
  })).attachments.length === 0)

// ---- address parsing: the security boundary ----

const token = generateInboundToken(new Uint8Array(16).fill(7))
check('token has the expected shape', /^h-[a-z2-9]{16}$/.test(token), token)
check('token avoids characters people misread',
  !/[ilo01]/.test(token.slice(2)), token)

check('a valid address resolves', localPartOf(`${token}@in.gatheredos.com`) === token)
check('a Name <addr> header resolves', localPartOf(`GatheredOS <${token}@in.gatheredos.com>`) === token)
check('case is ignored', localPartOf(`${token.toUpperCase()}@IN.GATHEREDOS.COM`) === token)
check('plus-addressing is stripped', localPartOf(`${token}+home@in.gatheredos.com`) === token)

check('another domain never resolves', localPartOf(`${token}@evil.com`) === null)
check('a lookalike subdomain never resolves', localPartOf(`${token}@in.gatheredos.com.evil.com`) === null)
check('the parent domain never resolves', localPartOf(`${token}@gatheredos.com`) === null)
check('a malformed token never resolves', localPartOf('h-short@in.gatheredos.com') === null)
check('a non-token local part never resolves', localPartOf('hello@in.gatheredos.com') === null)
check('garbage never resolves', localPartOf('not-an-address') === null)

/**
 * Opt-in end-to-end pass: `--live`. Mints an address on a scratch home, pushes
 * a forwarded ServiceTitan confirmation through the real ingest, and asserts
 * the contractor survived. Costs one Haiku call and always cleans up.
 *
 * Worth the cost because it is the one thing the pure checks cannot prove: that
 * unwrapping actually rescues the identity-confidence path end to end, rather
 * than just producing the right headers in isolation.
 */
async function live() {
  const { createAdminClient } = await import('../lib/supabase/admin')
  const { ingestInboundEmail } = await import('../lib/inbound/ingest')
  const { generateInboundToken } = await import('../lib/inbound/address')
  const { randomBytes } = await import('node:crypto')
  const db = createAdminClient()

  const { data: profile } = await db.from('profiles').select('id').limit(1).maybeSingle()
  if (!profile) throw new Error('no profile — run scripts/seed.ts first')
  const { data: home } = await db
    .from('homes')
    .insert({ name: 'Inbound test home', created_by: profile.id })
    .select('*')
    .single()
  if (!home) throw new Error('home insert failed')
  const token = generateInboundToken(randomBytes(16))
  await db.from('home_inbound_addresses').insert({ home_id: home.id, token })
  console.log(`\nscratch home ${home.id}\n`)

  try {
    const result = await ingestInboundEmail(inbound({
      messageId: `live-${token}`,
      to: [`${token}@in.gatheredos.com`],
    }))
    check('live: message was ingested', result.status === 'done', result)
    check('live: contractor recovered from the forwarded header',
      result.status === 'done' && (result.company ?? '').includes('Lebrun'),
      result.status === 'done' ? result.company : result)

    const { data: suggestion } = await db
      .from('suggestions')
      .select('summary,confidence,target')
      .eq('home_id', home.id)
      .eq('target', 'contractors')
      .maybeSingle()
    check('live: contractor queued for confirmation', Boolean(suggestion), suggestion)
    check('live: scored on identity, not on the unreadable body',
      (suggestion?.confidence ?? 0) >= 0.8, suggestion?.confidence)

    // A replayed webhook must not write a second visit.
    const again = await ingestInboundEmail(inbound({
      messageId: `live-${token}`,
      to: [`${token}@in.gatheredos.com`],
    }))
    check('live: a replayed delivery is a no-op', again.status === 'duplicate', again)

    // A stranger's guess resolves to no home at all.
    const stranger = await ingestInboundEmail(inbound({
      messageId: 'live-stranger',
      to: ['h-aaaaaaaaaaaaaaaa@in.gatheredos.com'],
    }))
    check('live: an unknown address writes nothing', stranger.status === 'ignored', stranger)
  } finally {
    await db.from('homes').delete().eq('id', home.id)
    console.log(`\nscratch home ${home.id} deleted`)
  }
}

async function main() {
  if (process.argv.includes('--live')) await live()
  console.log(failures === 0 ? '\nINBOUND RULES PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
