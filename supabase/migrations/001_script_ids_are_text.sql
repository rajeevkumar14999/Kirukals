-- ---------------------------------------------------------------------------
-- Script ids are the app's own, not uuids.
--
-- The editor has always minted its own document ids — "smsabko0dhog4" and the
-- like — and they are written into every saved file, every backup and every
-- export. The database should accept the ids the app already has rather than
-- demand a shape it has never used, so the column becomes text.
--
-- Run this once in the SQL editor if the scripts table was created before
-- this change. It is safe to run again.
-- ---------------------------------------------------------------------------

alter table public.scripts alter column id drop default;
alter table public.scripts alter column id type text using id::text;
