-- Contractor-email ingestion: field-service platforms (ServiceTitan, Jobber,
-- Housecall Pro, ...) already mail the homeowner a structured record of every
-- appointment and invoice. This turns that mail into home memory.
--
-- Design note: historical visits land in the MEMORY tables (contractors,
-- care_events, care_tasks, timeline_events) through the existing ingest
-- cascade. They deliberately do NOT land in service_cases/service_appointments
-- — that layer models a live operator-coordinated case with authorization
-- gates, and a 2023 electrician visit has no case, offer, or authorization.

-- ============ extractions: accept a non-file source ============
-- Reusing extractions (rather than a parallel table) keeps the extraction_id
-- provenance FKs on insights / home_facts / warranties intact and gives email
-- bodies the same generated FTS tsvector that documents already have.

alter table public.extractions
  alter column file_id drop not null,
  add column source_kind text not null default 'file'
    check (source_kind in ('file','email')),
  add column source_ref text;

comment on column public.extractions.source_ref is
  'Provider message id for source_kind=email. Null for files (file_id carries it).';

-- A file extraction must name its file; an email extraction must name its message.
alter table public.extractions
  add constraint extractions_source_shape check (
    (source_kind = 'file' and file_id is not null)
    or (source_kind = 'email' and source_ref is not null)
  );

-- ============ imported_messages: dedupe + audit for mail ingestion ============

create table public.imported_messages (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  -- Provider's immutable message id. The dedupe key: re-syncing the same
  -- mailbox must never double-write a visit.
  external_id text not null,
  vendor text,
  from_email text,
  from_name text,
  subject text,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','processing','done','skipped','failed')),
  skip_reason text,
  -- Address the mail names, kept for later multi-property routing. v1 does not
  -- route on it (see lib/ingest/email.ts).
  service_address text,
  extraction_id uuid references public.extractions(id) on delete set null,
  proposal_count int not null default 0,
  attachment_file_ids uuid[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (home_id, provider, external_id)
);
create index imported_messages_home_status_idx
  on public.imported_messages (home_id, status);
create index imported_messages_sent_idx
  on public.imported_messages (home_id, sent_at desc);
create trigger imported_messages_updated_at before update on public.imported_messages
  for each row execute function public.set_updated_at();

alter table public.imported_messages enable row level security;
-- Members read their own home's import log; every write goes through the
-- service-role ingest pipeline after its own membership check.
create policy "imported_messages: member read" on public.imported_messages
  for select using (public.is_home_member(home_id));
