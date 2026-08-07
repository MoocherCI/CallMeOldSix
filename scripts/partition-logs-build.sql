-- Build partitioned replacements for usage_logs / audit_log / request_logs.
-- Run BEFORE switch; old tables remain live until switch.

-- ============ usage.usage_logs (0 rows) ============
CREATE TABLE usage.usage_logs_new (
    id bigint NOT NULL DEFAULT nextval('usage.usage_logs_id_seq'::regclass),
    user_id bigint NOT NULL,
    action text NOT NULL,
    details text,
    ip_address text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usage_logs_new_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE usage.usage_logs_2026_08 PARTITION OF usage.usage_logs_new FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE usage.usage_logs_2026_09 PARTITION OF usage.usage_logs_new FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
INSERT INTO usage.usage_logs_new SELECT * FROM usage.usage_logs WHERE created_at < '2026-09-01 00:00:00+00';
CREATE INDEX usage_logs_user_id_idx_new ON usage.usage_logs_new (user_id);
CREATE INDEX usage_logs_action_idx_new ON usage.usage_logs_new (action);
CREATE INDEX usage_logs_created_at_idx_new ON usage.usage_logs_new (created_at);

-- ============ log.audit_log (22 rows) ============
CREATE TABLE log.audit_log_new (
    id bigint NOT NULL DEFAULT nextval('log.audit_log_id_seq'::regclass),
    user_id bigint,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    old_values text,
    new_values text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_log_new_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE log.audit_log_2026_03 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE log.audit_log_2026_04 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE log.audit_log_2026_05 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE log.audit_log_2026_06 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE log.audit_log_2026_07 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE log.audit_log_2026_08 PARTITION OF log.audit_log_new FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
INSERT INTO log.audit_log_new SELECT * FROM log.audit_log WHERE created_at < '2026-09-01 00:00:00+00';
CREATE INDEX audit_log_user_id_idx_new ON log.audit_log_new (user_id);
CREATE INDEX audit_log_action_idx_new ON log.audit_log_new (action);
CREATE INDEX audit_log_entity_type_entity_id_idx_new ON log.audit_log_new (entity_type, entity_id);
CREATE INDEX audit_log_created_at_idx_new ON log.audit_log_new (created_at);

-- ============ log.request_logs (8.5M rows) ============
CREATE TABLE log.request_logs_new (
    id bigint NOT NULL DEFAULT nextval('log.request_logs_id_seq'::regclass),
    user_id bigint,
    email text,
    session_id text,
    request_type text NOT NULL DEFAULT '',
    model text,
    status text NOT NULL,
    error_message text,
    error_stack text,
    agent_events text,
    input_tokens bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    total_tokens bigint NOT NULL DEFAULT 0,
    cost_usd numeric NOT NULL DEFAULT 0,
    latency_ms integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT request_logs_new_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE log.request_logs_2026_03 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_04 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_05 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_06 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_07 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_08 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE log.request_logs_2026_09 PARTITION OF log.request_logs_new FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-03-01 00:00:00+00' AND created_at < '2026-04-01 00:00:00+00';
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-04-01 00:00:00+00' AND created_at < '2026-05-01 00:00:00+00';
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-05-01 00:00:00+00' AND created_at < '2026-06-01 00:00:00+00';
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-06-01 00:00:00+00' AND created_at < '2026-07-01 00:00:00+00';
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-07-01 00:00:00+00' AND created_at < '2026-08-01 00:00:00+00';
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE created_at >= '2026-08-01 00:00:00+00' AND created_at < '2026-09-01 00:00:00+00';
CREATE INDEX request_logs_created_at_idx_new ON log.request_logs_new (created_at);
CREATE INDEX request_logs_email_idx_new ON log.request_logs_new (email);
CREATE INDEX request_logs_model_idx_new ON log.request_logs_new (model);
CREATE INDEX request_logs_request_type_idx_new ON log.request_logs_new (request_type);
CREATE INDEX request_logs_session_id_idx_new ON log.request_logs_new (session_id);
CREATE INDEX request_logs_status_idx_new ON log.request_logs_new (status);
CREATE INDEX request_logs_user_id_idx_new ON log.request_logs_new (user_id);
