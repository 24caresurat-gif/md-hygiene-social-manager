-- Optimize RLS policies that call auth.uid() directly in row expressions.
-- Wrapping the call in a scalar SELECT lets PostgreSQL treat it as an init plan,
-- rather than re-evaluating it for each candidate row. Policies already using
-- "(SELECT auth.uid())" are deliberately left untouched.
do $migration$
declare
  p record;
  stmt text;
  rewritten_count integer := 0;
  v_using text;
  v_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%auth.uid()%'
        or coalesce(with_check, '') ilike '%auth.uid()%'
      )
      and coalesce(qual, '') not ilike '%SELECT auth.uid()%'
      and coalesce(with_check, '') not ilike '%SELECT auth.uid()%'
  loop
    v_using := case when p.qual is null then null
      else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    v_check := case when p.with_check is null then null
      else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;

    stmt := format('alter policy %I on %I.%I',
      p.policyname, p.schemaname, p.tablename);
    if v_using is not null then
      stmt := stmt || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      stmt := stmt || format(' with check (%s)', v_check);
    end if;
    execute stmt;
    rewritten_count := rewritten_count + 1;
  end loop;

  if rewritten_count <> 38 then
    raise exception 'Expected 38 direct-auth.uid policies in the audited schema; rewrote %; review current policies before applying this migration.', rewritten_count;
  end if;
end
$migration$;
