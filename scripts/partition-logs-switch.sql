-- Switch three log tables to their partitioned replacements (short ACCESS EXCLUSIVE locks).
-- Run AFTER build; each table: lock -> incremental copy -> rename -> commit.
\set ON_ERROR_STOP on

BEGIN;
LOCK TABLE usage.usage_logs IN ACCESS EXCLUSIVE MODE;
INSERT INTO usage.usage_logs_new SELECT * FROM usage.usage_logs WHERE id > (SELECT max(id) FROM usage.usage_logs_new);
ALTER TABLE usage.usage_logs RENAME TO usage_logs_old;
ALTER TABLE usage.usage_logs_new RENAME TO usage_logs;
COMMIT;

BEGIN;
LOCK TABLE log.audit_log IN ACCESS EXCLUSIVE MODE;
INSERT INTO log.audit_log_new SELECT * FROM log.audit_log WHERE id > (SELECT max(id) FROM log.audit_log_new);
ALTER TABLE log.audit_log RENAME TO audit_log_old;
ALTER TABLE log.audit_log_new RENAME TO audit_log;
COMMIT;

BEGIN;
LOCK TABLE log.request_logs IN ACCESS EXCLUSIVE MODE;
INSERT INTO log.request_logs_new SELECT * FROM log.request_logs WHERE id > (SELECT max(id) FROM log.request_logs_new);
ALTER TABLE log.request_logs RENAME TO request_logs_old;
ALTER TABLE log.request_logs_new RENAME TO request_logs;
COMMIT;
