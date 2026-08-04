-- Forward-in address: a second way for contractor mail to reach a home.
--
-- Gmail OAuth needs `gmail.readonly`, a restricted scope, which means Google
-- verification plus a CASA assessment before anyone outside the test-user list
-- can connect, and 7-day refresh tokens until then. A forwarding address has
-- none of that, and it works for mailboxes we will never have an OAuth app for
-- (Outlook, iCloud, a work address).
--
-- The token IS the credential. Anything that can post to the address can write
-- to the home's memory, so it must be unguessable, revocable, and never
-- enumerable — hence a random secret rather than a derivation of home_id.

alter table public.homes
  add column inbound_token text unique,
  add column inbound_token_created_at timestamptz;

comment on column public.homes.inbound_token is
  'Secret local-part of the home''s forward-in address. Null until the owner asks for one. Rotating it invalidates the old address immediately.';

-- Partial: most homes have no token, and the lookup is always by exact token.
create index homes_inbound_token_idx on public.homes (inbound_token)
  where inbound_token is not null;

-- imported_messages now logs both sources. 'forward' rows carry the inbound
-- provider's message id in external_id, so the same (home, provider, external)
-- uniqueness keeps a re-delivered webhook from double-writing a visit.
alter table public.imported_messages
  drop constraint imported_messages_provider_check;
alter table public.imported_messages
  add constraint imported_messages_provider_check
  check (provider in ('gmail', 'forward'));
