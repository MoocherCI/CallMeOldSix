# 数据迁移方案：alex-ai-dev（旧环境）→ 252/251（新环境）

> 状态：**✅ 已执行完成（2026-08-07）**。前置修复、DB 迁移、DNS 切换均已完成并验证。
> 目标：把旧环境 `alex-ai-dev`（3.112.192.155）的 PostgreSQL 数据完整迁移到新环境
> 252（91.110.182.252)，随后通过 Cloudflare 把流量切换到 251（91.110.182.251）入口。

---

## 1. 环境快照

| 项 | 旧环境 alex-ai-dev | 新环境 251 / 252 |
| --- | --- | --- |
| 入口 | 单机 nginx（3.112.192.155） | 251 nginx + Cloudflare（next.* 域名已生效） |
| PostgreSQL | `cuneim` 用户 / `cuneim_db` 库，**4.88 GB** | `postgres` 用户 / `cuneim` 库，**9.7 MB（空结构）** |
| 关键数据 | 135 用户、request_logs 151,002、usage_records 124,721、usage_daily 1,837、active_sessions 275、stripe_invoices 12 | 全空 |
| 结构 | main 12 / session 3 / usage 4 / log 2 / **admin 5** / public 1 | main 12 / session 3 / usage 4 / log 2 / **admin 0（缺失）** / public 1 |
| 密钥 | JWT / JWT_REFRESH / STREAM / ADMIN_JWT / ADMIN_JWT_REFRESH / STRIPE / STRIPE_WEBHOOK / TOTP | **与旧环境哈希完全一致** ✅ |

> 密钥一致意味着迁移后用户会话、Stripe 支付、TOTP 2FA 均不受影响。
> 域名配置（BASE_URL 等）两边相同，切换仅涉及 DNS/Origin 指向。

## 2. 迁移方式选型

采用 **结构不变、仅迁移数据**（`pg_dump --data-only`）方式：

- 新环境结构已与旧环境对齐（除 admin schema，见 §4），避免 drop/重建风险；
- 应用运行中，导入前需停机窗口（见 §6）；
- 不做全库 `--clean` 重建，降低误删风险。

## 3. 已完成的前置修复（2026-08-07）

1. **app 容器健康检查修复**：next-server 监听容器 IP（`$HOSTNAME`）而非 localhost，
   10 个 app 容器已从 unhealthy 全部恢复 healthy（`docker-compose.251/252.yml` 已同步远程）。
2. **252 数据库备份**：`~/backups/cuneim_pre_fix_20260807_125727.dump`（修复前快照，已验证可恢复）。
3. **清理 failed migration**：删除冗余的 `20260101000000_init`（失败原因 `users already exists`，
   与其他 init 重叠，未创建任何对象）；当前 failed 记录 = 0。
4. **补齐 `main.recovery_codes` 表**：结构/索引/FK 与旧环境一致（12 张 main 表对齐）。

## 4. 结构差异（迁移前必须补齐：admin schema）

新环境 **admin schema 为空**，旧环境有 5 张表 + 3 序列 + 11 个索引：

- `admin.admins`、`admin.admin_roles`、`admin.admin_menus`、`admin.admin_role_menus`、
  `admin._prisma_migrations`
- 序列：`admin.admins_id_seq`、`admin.admin_roles_id_seq`、`admin.admin_menus_id_seq`

其余 schema（main/session/usage/log）表结构完全一致；新环境索引更多（main +4、usage +2，
为新 migration 新增，正常）。

**处理**：从旧环境 `pg_dump --schema-only` 提取 admin 部分 DDL，在 252 执行创建；
`admin._prisma_migrations` 记录一并导入以保持 admin 迁移历史一致。

## 5. 迁移前准备

### 5.1 备份旧环境（必做）

```bash
ssh alex-ai-dev
mkdir -p ~/backups
cd ~/cuneim
PW=$(grep -E "^POSTGRES_PASSWORD=" .env | head -1 | cut -d= -f2-)
TS=$(date +%Y%m%d_%H%M%S)
docker exec -e PGPASSWORD="$PW" cuneim-postgres \
  pg_dump -U cuneim -d cuneim_db -Fc > ~/backups/cuneim_full_${TS}.dump
# 验证可读
docker run --rm -v ~/backups:/b:ro postgres:16-alpine pg_restore --list /b/cuneim_full_${TS}.dump | head
```

### 5.2 补齐 252 admin schema

```bash
# 在旧环境导出 admin 部分 DDL
ssh alex-ai-dev
PW=$(grep -E "^POSTGRES_PASSWORD=" .env | head -1 | cut -d= -f2-)
docker exec -e PGPASSWORD="$PW" cuneim-postgres \
  pg_dump -U cuneim -d cuneim_db --schema-only --no-owner --no-privileges -n admin > /tmp/admin_schema.sql
# 传输到 252 并执行（用 postgres 超级用户）
scp /tmp/admin_schema.sql alex-ai-dev-252:/tmp/
ssh alex-ai-dev-252 'docker cp /tmp/admin_schema.sql cuneim-postgres-1:/tmp/ && \
  docker exec cuneim-postgres-1 psql -U postgres -d cuneim -v ON_ERROR_STOP=1 -f /tmp/admin_schema.sql'
# 验证 5 表 3 序列就位
```

### 5.3 停机前检查

- 确认 252 磁盘充足（当前 727G 可用，4.88GB 数据 + 索引 ≈ 15–20GB，OK）；
- 保持 `.env` 中 `RUN_APP_MIGRATIONS=false`、`RUN_ADMIN_MIGRATIONS=false`（迁移期间禁止跑 migration）；
- 通知用户停机窗口（建议 30–60 分钟）。

## 6. 停机窗口迁移流程

> 窗口开始：停旧环境应用写入口 → 导出 → 导入 → 验证 → 切换。

```bash
# ① 停止旧环境写入（保留 postgres 继续跑，避免 dump 与写入竞争）
ssh alex-ai-dev
cd ~/cuneim
docker compose stop app admin agent   # nginx/postgres/redis 保持运行
# 或：docker stop cuneim-app cuneim-admin cuneim-agent

# ② 旧环境导出（纯数据）
PW=$(grep -E "^POSTGRES_PASSWORD=" .env | head -1 | cut -d= -f2-)
docker exec -e PGPASSWORD="$PW" cuneim-postgres \
  pg_dump -U cuneim -d cuneim_db --data-only --disable-triggers -Fc > ~/backups/cuneim_data_${TS}.dump

# ③ 传输到 252 并导入
scp ~/backups/cuneim_data_${TS}.dump alex-ai-dev-252:/tmp/
ssh alex-ai-dev-252 "docker cp /tmp/cuneim_data_${TS}.dump cuneim-postgres-1:/tmp/ && \
  docker exec cuneim-postgres-1 pg_restore -U postgres -d cuneim \
    --data-only --disable-triggers --no-owner --no-privileges /tmp/cuneim_data_${TS}.dump"
```

> 说明：`--disable-triggers` 在 restore 端跳过 FK/触发器，导入顺序无关；导入后触发器自动恢复。
> 导入失败可在事务外重试（pg_restore 支持 `--single-transaction` 保证原子性，失败可整体回滚重来）。

### 6.1 序列同步（防止未来 id 冲突）

```bash
ssh alex-ai-dev-252
docker exec cuneim-postgres-1 psql -U postgres -d cuneim <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, s.relname AS seq, n.nspname AS ns
    FROM pg_class c
    JOIN pg_depend d ON d.refobjid = c.oid
    JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE c.relkind = 'r' AND d.deptype = 'a'
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT max(%I) FROM %I.%I), 1), %s)',
                   r.ns || '.' || r.seq, 'id', r.ns, r.tbl, 'true');
  END LOOP;
END $$;
SQL
```

### 6.2 数据验证（行数对比）

> ⚠️ 下表期望行数为 **`COUNT(*)` 精确值**（2026-08-07 实测）。此前用
> `pg_stat_user_tables.n_live_tup` 估算会严重低估（如 request_logs 曾显示 15 万，实际 849 万）。

| 表 | 期望行数（旧环境实测） | 迁移后 252 实测 | 结果 |
| --- | --- | --- | --- |
| main.users | 135 | 135 | ✅ |
| log.request_logs | 8,496,511 | 8,496,511 | ✅ |
| usage.usage_records | 7,825,602 | 7,825,602 | ✅ |
| main.balance_transactions | 7,575,270 | 7,575,270 | ✅ |
| usage.usage_daily | 1,837 | 1,837 | ✅ |
| session.active_sessions | 275 | 0（未迁移，见 §9.10） | ⚠️ 有意跳过 |
| session.refresh_tokens | 115 | 115 | ✅ |
| session.auth_codes | 149 | 149 | ✅ |
| main.client_versions | 108 | 108 | ✅ |
| main.subscription_periods | 32 | 32 | ✅ |
| main.stripe_invoices | 12 | 12 | ✅ |
| admin.admins / admin_roles / admin_menus | 2 / 1 / 11 | 2 / 1 / 11 | ✅ |

```bash
# 新旧对比脚本（分别在两边执行后人工比对）
docker exec ... psql -U postgres -d cuneim -tAc \
  "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1,2"
```

另需抽查：抽样数据字段、外键完整性（`SET CONSTRAINTS ALL IMMEDIATE` 无报错）、序列 `nextval` 正常。

### 6.3 应用验证（252 直接测试）

1. 重启 252 的 app/admin 容器（`docker compose up -d app-0 app-1 admin`）；
2. 关键链路：`/api/health`、登录、用户查询、Stripe webhook 回调、TOTP 2FA；
3. 检查 app 日志无新的 prisma 错误；
4. 251 侧 nginx 转发验证（跨主机 252 app 返回 200）。

## 7. 流量切换

新环境域名 `next.cuneim.com / next-api.cuneim.com / next-stream.cuneim.com / next-admin.cuneim.com`
已通过 Cloudflare 指向 251 且回源正常（本次已验证 443 返回 200，真实流量在服务）。

- **切换** = 把生产主机名（`cuneim.com` 等原入口）在 Cloudflare 的 DNS/Origin 指向改为
  251（91.110.182.251），或启用第二 Origin（251 为主、旧环境为备，见
  `docs/dual-architecture.md` 高可用说明）；
- 切换后旧环境保持运行但不接新流量（回滚备用）。

## 8. 回滚方案

- **未切换前发现问题**：放弃本次导入，252 数据清空重导（`pg_restore --clean` 或恢复 §3.2 备份）；
  旧环境无影响。
- **切换后发现问题**：把 Cloudflare 指回旧环境。
  ⚠️ 切换后旧环境不再写入，回滚会丢失切换期间产生的新数据（需接受或做增量补导）。
- 保留迁移包（dump 文件）至少 7 天。

## 9. 风险与待确认项

| # | 风险/事项 | 影响 | 处理 |
| --- | --- | --- | --- |
| 1 | 停机窗口期间服务不可用 | 中 | 选低峰时段，窗口 30–60 分钟 |
| 2 | 切换后回滚丢新数据 | 中 | 提前告知业务方；备选：切换后启用双写/同步 |
| 3 | Stripe webhook 停机期事件丢失 | 低 | Stripe 有重试机制，恢复后自动补 |
| 4 | Redis 缓存（session/token 缓存）冷启动 | 低 | 切换后清 252 Redis 一次，自动重建（✅ 已执行 FLUSHALL） |
| 5 | `usage_records is not partitioned` 分区管理器报错 | 低（不阻塞） | 已知告警（启动与定时任务），782 万行普通表可正常服务；后续与开发确认分区改造 |
| 6 | `INTERNAL_BASE_URL=http://app:3000` 在新环境无 `app` 服务名 | 待确认 | 迁移后 app 运行正常暂未发现影响；仍建议确认该变量用途 |
| 7 | admin migration 历史（重叠） | 中 | 已用"仅导数据 + 手动建 admin 表"规避；后续建议合并 Prisma 迁移历史为单一归属 |
| 8 | 端口 3000-3007/3100/5432/6379 公网暴露 | 高（安全） | 切换后尽快用防火墙 / DOCKER-USER 链收紧到私有网络（**待办**） |
| 9 | 新环境无第二入口/高可用 | 中 | 按 dual-architecture 待办配置第二 Origin（**待办**） |
| 10 | `session.active_sessions` 未迁移（275 条） | 低 | 新旧 schema 不兼容（旧 `token_hash`+`client_type` vs 新 `session_token`）；`refresh_tokens` 115 条已迁移保登录态，会话列表由用户下次登录重建 |

## 10. 迁移后收尾清单

- [x] DB 迁移执行（2026-08-07 完成，行数/FK/序列全部验证）
- [x] DNS 切换（10 条记录全部指向 251，2026-08-07 验证 200）
- [x] 252 Redis 缓存清理（FLUSHALL）
- [ ] 252 PostgreSQL 定期备份 + 恢复演练（`docs/dual-architecture.md` 待办 #6）
- [ ] 端口收敛到私有网络（待办 #3，**安全优先级最高**）
- [ ] 第二 ingress / Origin 高可用（待办 #4）
- [ ] 日志与指标 off-host（待办 #5）
- [ ] usage_records 分区改造（与开发确认分区键与建分区策略）
- [ ] Prisma 迁移历史单一归属重构（待办 #1）
- [ ] 观察期 1–3 天后停用旧环境 postgres（回滚保留期结束）
