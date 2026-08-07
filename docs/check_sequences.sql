DO $$
DECLARE r record; m bigint; lv bigint;
BEGIN
  FOR r IN
    SELECT n.nspname AS ns, c.relname AS tbl, s.relname AS seq
    FROM pg_class c
    JOIN pg_depend d ON d.refobjid = c.oid AND d.deptype = 'a'
    JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE c.relkind = 'r'
  LOOP
    BEGIN
      EXECUTE format('SELECT max(%I) FROM %I.%I', 'id', r.ns, r.tbl) INTO m;
      EXECUTE format('SELECT last_value FROM %I.%I', r.ns, r.seq) INTO lv;
      IF m IS NOT NULL AND lv < m THEN
        RAISE NOTICE 'MISMATCH: %.%.% seq=% max=%', r.ns, r.tbl, r.seq, lv, m;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'SKIP %.%.%: %', r.ns, r.tbl, r.seq, SQLERRM;
    END;
  END LOOP;
END $$;
