# Data Migration: Old PG ([REDACTED]) → 252 PG ([REDACTED])

**Completed**: 2026-07-03

## Summary

Complete cuneim_db migration from old PostgreSQL on AWS ([REDACTED]) to new PostgreSQL on 252 ([REDACTED]).

## Method

- Dumped cuneim_db from old machine cuneim-postgres container with `pg_dump --clean --if-exists --no-owner --no-acl` (~2.9GB, 23.8M lines)
- Compressed to 240MB gzip, transferred directly from old machine to 252 via SCP
- Restored into 252 postgres container via `gunzip | docker compose exec -T postgres psql`

## Verification

- All 25 tables across 6 schemas (main, session, usage, log, admin, public) restored successfully
- Row counts match between old and new for all tables (minor live-traffic drift in append-only request_logs and usage_records expected)
- https://next.cuneim.com/ returns HTTP 200 with full page content
- Old machine all 5 containers remain Up throughout
- 252 PG accepting connections and ready

## Row Count Comparison

| Table | Old ([REDACTED]) | New ([REDACTED]) |
|-------|---------------------|----------------------|
| admin._prisma_migrations | 1 | 1 |
| admin.admin_menus | 11 | 11 |
| admin.admin_role_menus | 11 | 11 |
| admin.admin_roles | 1 | 1 |
| admin.admins | 2 | 2 |
| log.audit_log | 17 | 17 |
| log.request_logs | 8,439,240 | 8,439,079 |
| main.account_deletion_tasks | 2 | 2 |
| main.api_keys | 0 | 0 |
| main.balance_transactions | 7,575,269 | 7,575,269 |
| main.client_versions | 92 | 92 |
| main.invite_codes | 58 | 58 |
| main.quota_plans | 0 | 0 |
| main.recovery_codes | 24 | 24 |
| main.stripe_invoices | 0 | 0 |
| main.user_quotas | 0 | 0 |
| main.users | 133 | 133 |
| public._prisma_migrations | 10 | 10 |
| session.active_sessions | 262 | 262 |
| session.auth_codes | 141 | 141 |
| session.refresh_tokens | 115 | 115 |
| usage.usage_daily | 1,639 | 1,639 |
| usage.usage_logs | 0 | 0 |
| usage.usage_monthly | 345 | 345 |
| usage.usage_records | 7,784,844 | 7,784,702 |
