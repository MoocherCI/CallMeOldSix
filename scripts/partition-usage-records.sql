-- Partition usage.usage_records by created_at (monthly RANGE), matching the app partition-manager.
-- Strategy: build new partitioned table + migrate data in batches, then short-lock switch.
-- Run this against a target database (restore_test for drill, cuneim for production).

-- 1) Create partitioned parent (structure identical to current heap table)
CREATE TABLE usage.usage_records_new (
    id bigint NOT NULL DEFAULT nextval('usage.usage_records_id_seq'::regclass),
    user_id bigint NOT NULL,
    session_id text,
    request_type text NOT NULL,
    model text,
    input_tokens bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    total_tokens bigint NOT NULL DEFAULT 0,
    cost_usd numeric NOT NULL DEFAULT 0,
    latency_ms integer,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usage_records_new_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 2) Monthly partitions: existing data months (2026-03..2026-08) + one future month
CREATE TABLE usage.usage_records_2026_03 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_04 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_05 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_06 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_07 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_08 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE usage.usage_records_2026_09 PARTITION OF usage.usage_records_new FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

-- 3) Migrate data per month (batched; source = usage.usage_records heap table)
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-03-01 00:00:00+00' AND created_at <  '2026-04-01 00:00:00+00';
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-04-01 00:00:00+00' AND created_at <  '2026-05-01 00:00:00+00';
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-05-01 00:00:00+00' AND created_at <  '2026-06-01 00:00:00+00';
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-06-01 00:00:00+00' AND created_at <  '2026-07-01 00:00:00+00';
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-07-01 00:00:00+00' AND created_at <  '2026-08-01 00:00:00+00';
INSERT INTO usage.usage_records_new SELECT * FROM usage.usage_records WHERE created_at >= '2026-08-01 00:00:00+00' AND created_at <  '2026-09-01 00:00:00+00';

-- 4) Indexes on parent (PG 12+ cascades to partitions)
CREATE INDEX usage_records_created_at_idx_new ON usage.usage_records_new (created_at);
CREATE INDEX usage_records_request_type_idx_new ON usage.usage_records_new (request_type);
CREATE INDEX usage_records_session_id_idx_new ON usage.usage_records_new (session_id);
CREATE INDEX usage_records_user_id_created_at_idx_new ON usage.usage_records_new (user_id, created_at);
CREATE INDEX usage_records_user_id_id_idx_new ON usage.usage_records_new (user_id, id);
CREATE INDEX usage_records_user_id_idx_new ON usage.usage_records_new (user_id);

-- 5) Verification (run separately):
--    SELECT count(*) FROM usage.usage_records_new;        -- must equal old count
--    SELECT count(*) FROM usage.usage_records;            -- old table count (before switch)

-- 6) Switch (production: wrap in BEGIN; LOCK TABLE usage.usage_records IN ACCESS EXCLUSIVE MODE;
--    then insert incremental rows with id > max migrated id, then rename, then COMMIT).
-- ALTER TABLE usage.usage_records RENAME TO usage_records_old;
-- ALTER TABLE usage.usage_records_new RENAME TO usage_records;
