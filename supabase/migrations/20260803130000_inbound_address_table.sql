-- Move the forward-in secret off `homes` and behind its own policy.
--
-- On `homes` the token was readable by every member, because RLS is row-level:
-- any policy that lets a guest see the home lets them see all of its columns.
-- Guests are deliberately read-only, and this token is a WRITE credential —
-- anything that can post to the address adds records to the home. A guest able
-- to read it could do by mail what the role gate stops them doing in the app.
--
-- Column-level GRANTs would fix the read but break every `select('*')` on
-- homes, so the token gets its own table with its own policy instead.
--
-- Safe to drop the columns: they were added minutes ago and no token was ever
-- minted into them.

alter table public.homes
  drop column if exists inbound_token,
  drop column if exists inbound_token_created_at;

create table public.home_inbound_addresses (
  home_id uuid primary key references public.homes(id) on delete cascade,
  -- Secret local-part of the address. Unique so a token can never resolve to
  -- two homes; random so the space cannot be walked.
  token text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create index home_inbound_addresses_token_idx on public.home_inbound_addresses (token);

alter table public.home_inbound_addresses enable row level security;

-- Only the roles that may write to the home may see the address that writes to
-- it. Guests get nothing. Every mutation goes through the service-role action,
-- which re-checks the role, so there is deliberately no insert/update policy.
create policy "home_inbound_addresses: editor read" on public.home_inbound_addresses
  for select using (
    exists (
      select 1 from public.home_members m
      where m.home_id = home_inbound_addresses.home_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'family')
    )
  );
