DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, s.relname AS seq, n.nspname AS ns
    FROM pg_class c
    JOIN pg_depend d ON d.refobjid = c.oid AND d.deptype = 'a'
    JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE c.relkind = 'r'
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT max(%I) FROM %I.%I), 1), %L)',
                   r.ns || '.' || r.seq, 'id', r.ns, r.tbl,
                   CASE WHEN EXISTS (SELECT 1 FROM pg_class x JOIN pg_namespace y ON y.oid=x.relnamespace
                                     WHERE x.relname = r.tbl AND y.nspname = r.ns
                                     AND (SELECT count(*) FROM ONLY x) > 0) THEN true ELSE false END);
  END LOOP;
END $$;
