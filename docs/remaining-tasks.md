# 剩余任务方案与交接说明

> 日期：2026-08-07
> 状态：迁移/切换/备份/安全收敛已完成；以下为剩余可选项的**方案、指引与交接说明**。
> 需要执行时：2 项需用户确认（分区改造、停旧 postgres），2 项需用户/开发在对应平台操作（Origin、Prisma）。

---

## 1. usage_records 分区改造（对齐分区管理器预期）

### 背景（已从 app 编译代码调研确认）

分区管理器（`/app/.next/server/chunks/6635.js`）期望以下表为**按 created_at 的 RANGE 分区表**：

| 表 | 分区粒度 | 分区命名示例 |
| --- | --- | --- |
| usage.usage_records | 月 | `usage_records_2026_08` |
| usage.usage_logs | 月 | `usage_logs_2026_08` |
| log.audit_log | 月 | `audit_log_2026_08` |
| log.request_logs | 月 | `request_logs_2026_08` |
| usage.usage_daily | 季度 | `usage_daily_2026_q3` |
| usage.usage_monthly | 年 | `usage_monthly_2026` |

当前主表为普通堆表 → 分区管理器报 `"xxx" is not partitioned`（已知告警，功能不受影响）。
改造后分区管理器将正常创建未来分区；同时便于按时间清理历史数据。

### 改造方案（以 usage_records 782 万行为例，可不停机）

```sql
-- ① 重命名现有表（业务写入窗口内停写，或接受短暂阻塞）
ALTER TABLE usage.usage_records RENAME TO usage_records_old;

-- ② 创建分区主表（结构同旧表，含约束；外键/索引见实施时 \d+ 确认）
CREATE TABLE usage.usage_records (
    ... 同旧表列定义 ...,
    CONSTRAINT usage_records_pkey PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ③ 为每个已存在的月份创建分区并灌入数据（按 created_at 月份分组循环）
CREATE TABLE usage.usage_records_2026_08
    PARTITION OF usage.usage_records
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
INSERT INTO usage.usage_records_2026_08
    SELECT ... FROM usage.usage_records_old WHERE created_at >= '2026-08-01' AND created_at < '2026-09-01';

-- ④ 主表建索引（PG 12+ 自动级联到分区）
CREATE INDEX ... ON usage.usage_records (...);  -- 同旧表全部索引

-- ⑤ 校验行数（= 旧表 count）后
DROP TABLE usage.usage_records_old;
```

要点：
- 分区键列在实施时用 `\d+ usage.usage_records` 确认（应为 `created_at`）；
- `usage_records_pkey` 需改为 `(id, created_at)` 复合主键（分区表主键必须含分区键）——**这是对主键的破坏性变更**，需确认 app 按 id 单列查询/外键引用不受影响；
- usage_records 若存在指向 `main.users` 的外键，改造后需重建 FK（分区表 FK 支持，PG 12+）；
- **风险高**：生产表结构变更 + 主键变更，建议低峰 + 先备份（已有 `cuneim_post_migration` dump + 每日定时备份）；
- 实施前建议先在 restore_test 临时库演练一遍（用恢复演练的方式）。

## 2. 第二 Origin / 高可用（Cloudflare 面板，需用户操作）

目标：`cuneim.com` 等域名在 Cloudflare 配置 **Origin Pool / Load Balancing**，健康检查 251（主）与旧环境 3.112.192.155（备）或 252（备），实现故障自动切换。

步骤（Cloudflare 面板）：
1. 开通 Load Balancing（需在套餐内或试用）；
2. 创建 Origin Pool：origin-1 = 91.110.182.251（主，HTTPS 443，健康检查 `/api/health`），origin-2 = 旧环境或 252 备用；
3. 把 `cuneim.com / api / admin / dev / stream` 的 DNS 记录改为 Load Balancer 的 CNAME（或直接用 LB 的 IP）；
4. 健康检查间隔建议 30s，失败阈值 2，标记 origin down 后自动切备。

前置条件：251 是唯一公网入口（nginx）；若要 252 作为备入口，需在 252 也部署 nginx 并保持同一套证书（`*.cuneim.com`）。

## 3. Prisma 迁移历史单一归属合并（交接开发）

现状（docs/dual-architecture.md 待办 #1）：
- User 与 Admin 的 Prisma migration 历史重叠（都管理 `main/session/admin/usage/log` schema）；
- 252 库曾有 failed `20260101000000_init`（已清理）；admin 历史保留 1 条 failed
  `20260803000000_add_balance_transaction_idempotency`（原样保留以保持一致）；
- `RUN_APP_MIGRATIONS=false` / `RUN_ADMIN_MIGRATIONS=false`（部署不自动跑 migration）。

交接建议：
1. 由开发确定单一迁移归属（建议 User 侧 `public` 为唯一历史，admin 侧 `admin._prisma_migrations` 归档）；
2. 清理 failed 记录前先 `pg_dump` 备份（每日备份已有）；
3. 合并后重新启用 `RUN_APP_MIGRATIONS` / `RUN_ADMIN_MIGRATIONS`（当前保持 false 是安全基线）。

## 4. 停用旧环境 postgres（观察期后）

回滚窗口结束（建议迁移稳定 1–3 天后）执行：

```bash
ssh alex-ai-dev
# ① 最终全量备份（冗余保险）
cd ~/cuneim && PW=$(grep -E "^POSTGRES_PASSWORD=" .env | head -1 | cut -d= -f2-)
docker exec -e PGPASSWORD="$PW" cuneim-postgres pg_dump -U cuneim -d cuneim_db -Fc > ~/backups/cuneim_final_$(date +%Y%m%d).dump
# ② 停旧环境（app/admin/agent 已停；postgres/redis 也停）
docker stop cuneim-postgres cuneim-redis
# ③ 回滚能力：如需回滚，重启 postgres + 恢复 dump 到 252 或旧库
```

> 停用后回滚只能靠 dump 恢复（旧库不再实时），需接受。
