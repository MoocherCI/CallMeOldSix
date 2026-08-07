# 双环境迁移交付报告

> 日期：2026-08-07
> 范围：alex-ai-dev（旧环境，3.112.192.155）→ 新环境 251（91.110.182.251）/ 252（91.110.182.252）
> 结果：**迁移完成、DNS 已切换、线上服务正常**

---

## 1. 时间线

| 时间 (UTC) | 事项 |
| --- | --- |
| 12:44–13:16 | 前置诊断与修复：app 健康检查（10 容器 unhealthy→healthy）、failed migration 清理、recovery_codes 补表、admin schema 补齐、dev.cuneim.com nginx 配置 |
| 13:08 | 旧环境全量备份 `cuneim_full_20260807_130843.dump`（256MB） |
| 13:20 | 旧环境数据导出 `cuneim_data_20260807_132007.dump`（--data-only） |
| 13:21–13:33 | 导入 252、修复 3 处结构差异、序列同步、FK/行数验证、252 app 重启 |
| 13:34–13:36 | api.cuneim.com 已切验证通过；Redis FLUSHALL；旧环境 app/admin/agent 保持停止 |
| 13:42 | 252 迁移后备份 `cuneim_post_migration_20260807_134133.dump`（256MB） |
| 13:43–21:46 | 全部 10 条域名切换完成并验证 200；安全审计、稳定性检查、文档归档 |

## 2. 迁移数据结果

| 项 | 旧环境 | 252（迁移后） | 验证 |
| --- | --- | --- | --- |
| 数据库大小 | 4,882 MB | 6,094 MB | — |
| main.users | 135 | 135 | ✅ 精确一致 |
| log.request_logs | 8,496,511 | 8,496,511 | ✅ |
| usage.usage_records | 7,825,602 | 7,825,602 | ✅ |
| main.balance_transactions | 7,575,270 | 7,575,270 | ✅ |
| admin 表 | 5 表（2/1/11 行） | 5 表（2/1/11 行） | ✅ |
| FK 完整性 | — | `SET CONSTRAINTS ALL IMMEDIATE` 通过 | ✅ |
| 序列同步 | — | 全部对齐（0 mismatches） | ✅ |

> 行数均以 `COUNT(*)` 为准（`pg_stat_user_tables.n_live_tup` 会严重低估）。

## 3. 迁移中修复的结构差异

1. `main.users`：252 补 `totp_enabled`(boolean NOT NULL DEFAULT false)、`totp_secret`(text) 列
2. `main.sync_state`：Stripe 对账游标覆盖为旧环境值，迁移后对账从旧游标续跑（`previousCursorAt:1786107815` → `1786109496`）
3. `session.active_sessions`：**275 条未迁移**（schema 不兼容：旧 `token_hash`+`client_type` vs 新 `session_token`）；`refresh_tokens` 115 条已迁移保登录态，会话列表由用户下次登录重建

## 4. 切换与验证矩阵

### 4.1 域名（10 条 → 91.110.182.251，全部 HTTP 200）
cuneim.com / www.cuneim.com / api.cuneim.com / admin.cuneim.com / dev.cuneim.com /
stream.cuneim.com / next.cuneim.com / next-api.cuneim.com / next-admin.cuneim.com / next-stream.cuneim.com

- cuneim.com → 新主站页面；admin.cuneim.com → Cuneim Admin 后台
- stream/next-stream：DNS only 直连（有意配置，避免 Cloudflare 长连接超时）
- 证书：通配符 `*.cuneim.com`，certbot.timer 自动续期正常（至 2026-09-28）

### 4.2 服务层（全部 healthy）
- 251：nginx + agent + 8×app（3000-3007）
- 252：postgres + redis + admin(3006) + agent + 2×app（3000/3001）
- 跨主机链路：251 nginx → 252:3000/3001/3006 全部 200（~10ms）
- nginx 近 1h 状态码：**0 个 5xx**；日志 volume 26MB，磁盘 2–5%

### 4.3 业务层
- Stripe 对账从旧游标无缝续跑（6h 间隔调度正常）
- 251/252 app 日志无新错误（仅已知 usage_records 分区告警，非阻塞）
- 252 Redis 已 FLUSHALL（DBSIZE=0，缓存冷启动重建）
- postgres 21 个应用连接正常

## 5. 安全审计（实证）

| 项 | 结果 |
| --- | --- |
| 252 公网 OPEN 端口 | 22 / 3000 / 3006 / **5432(postgres)** / **6379(redis)** |
| 251 公网 OPEN 端口 | 22 / 3000-3007 / 3100 |
| 防火墙 | 两台 ufw **inactive**、无自定义 iptables 规则，全凭云安全组 |

**结论**：252 的 postgres/redis 可被公网直连，为当前最高优先级安全敞口，待收敛。

## 6. 备份与回滚

| 备份 | 位置 | 用途 |
| --- | --- | --- |
| cuneim_full_20260807_130843.dump（256MB） | 旧环境 ~/backups | 旧库全量 |
| cuneim_data_20260807_132007.dump（256MB） | 旧环境 ~/backups | 迁移数据包 |
| cuneim_pre_fix_20260807_125727.dump | 252 ~/backups | 252 修复前快照 |
| cuneim_post_migration_20260807_134133.dump（256MB） | 252 ~/backups | 迁移后新库快照 |

**回滚**：重启旧环境 app/admin/agent + DNS 切回 3.112.192.155（旧库为切换时刻快照，切换后新数据会丢失）。
旧环境 postgres/redis 保留运行，观察 1–3 天后可停用。

## 7. 遗留待办

| 优先级 | 事项 | 状态 |
| --- | --- | --- |
| 🔴 高 | 端口收敛（5432/6379/3000-3007/3100 公网→私有网络，DOCKER-USER 链） | 待执行（方案已备） |
| 🟡 中 | 252 定期备份计划 + 恢复演练 | 待执行 |
| 🟡 中 | 第二 Origin 高可用（Cloudflare Origin Pool） | 待执行 |
| 🟡 中 | usage_records 分区改造（与开发确认分区键） | 待确认 |
| 🟡 中 | Prisma 迁移历史单一归属重构 | 待确认 |
| 🟢 低 | `INTERNAL_BASE_URL=http://app:3000` 在新环境不可解析（当前无影响） | 待开发确认用途 |
| 🟢 低 | /sitemap.xml 404（爬虫抓取失败，SEO 优化） | 可选 |
| ⚪ 观察 | 观察期后停用旧环境 postgres | 1–3 天后 |

## 8. 交付物

- `docs/data-migration-plan.md` —— 迁移方案与执行记录（已更新）
- `docs/sync_sequences.sql` / `docs/check_sequences.sql` —— 序列工具脚本
- `docs/migration-delivery-report.md` —— 本报告
- git commits：`ce83f06`（配置+方案）、`f8b8235`（安全审计）
