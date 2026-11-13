-- Keep the security definer helper out of the exposed API schema.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_at_table(uuid) set schema private;
