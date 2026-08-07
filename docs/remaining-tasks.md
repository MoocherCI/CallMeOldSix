# 剩余任务方案与交接说明

> 日期：2026-08-07
> 状态：迁移/切换/备份/安全收敛已完成；**分区改造已完成 4/6 张表**。
> 剩余：2 项需用户/开发在对应平台操作（Origin、Prisma），2 项有明确结论（usage_daily/monthly 暂缓、旧 postgres 观察期后停用）。

---

## 1. usage_records 分区改造（✅ 已完成 2026-08-07）

**已改造为按月 RANGE 分区**（对齐分区管理器）：

| 表 | 状态 | 结果 |
| --- | --- | --- |
| usage.usage_records（782 万行） | ✅ 已分区 | 分区管理器自动创建未来分区（2026_10/11…），报错消除 |
| usage.usage_logs（0 行） | ✅ 已分区 | 同上 |
| log.audit_log（22 行） | ✅ 已分区 | 同上 |
| log.request_logs（849 万行） | ✅ 已分区 | 同上（注意 user_id 为 **text** 类型） |
| usage.usage_daily（1,837 行） | ⚠️ **暂缓** | 有 `UNIQUE(user_id, date, model)` 非分区键唯一约束；分区表要求唯一约束含分区键，改造会破坏 app 的 UPSERT（`ON CONFLICT`），**需要 app 代码配合**（改约束或改写入逻辑）后才可分区 |
| usage.usage_monthly（373 行） | ⚠️ **暂缓** | 同上（`UNIQUE(user_id, year_month, model)`） |

改造方式（可复用）：`scripts/partition-*-build.sql`（建 `_new` 分区表+迁移+索引）+ `switch`（短锁切换，锁窗口 <1s）。
usage_daily/usage_monthly 数据量极小，普通表 + 已知告警（每 24h 一条，不阻塞功能）可长期接受。

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

主键均由 `(id)` 改为 `(id, created_at)`（分区表主键必须含分区键）；已确认无入向外键引用受影响。

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
