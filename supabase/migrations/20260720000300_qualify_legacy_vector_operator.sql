-- The live project predates this repository and contains a legacy match_items
-- function. Its unqualified pgvector operator stopped resolving after pgvector
-- moved into the extensions schema. Preserve the function and qualify only the
-- operator in every existing overload.
do $$
declare
  function_definition text;
begin
  for function_definition in
    select pg_get_functiondef(procedure.oid)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'match_items'
      and position('<=>' in pg_get_functiondef(procedure.oid)) > 0
  loop
    execute regexp_replace(
      function_definition,
      '\s*<=>\s*',
      ' operator(extensions.<=>) ',
      'g'
    );
  end loop;
end;
$$;
