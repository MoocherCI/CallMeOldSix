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

**结论**：252 的 postgres/redis 可被公网直连 —— **已收敛（2026-08-07）**：

- 251 `DOCKER-USER`：公网到 3000-3007/3100 全部 DROP，仅保留 80/443（Cloudflare 回源）
- 252 `DOCKER-USER`：放行 251 来源（跨主机 app→postgres/redis、nginx→app/admin），其余来源到 3000/3001/3006/3100/5432/6379 全部 DROP
- 持久化：`docker-user-lockdown-251/252.service`（systemd oneshot，docker 重启后自动重应用）
- 验证：真实公网视角（旧环境机器）探测全部 closed，仅 251:80/443 OPEN；公网域名 10/10 仍 200，跨主机链路与 postgres 连接（22 个）无损

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
| 🔴 高 | 端口收敛（5432/6379/3000-3007/3100 公网→私有网络，DOCKER-USER 链） | **✅ 已完成（2026-08-07）** |
| 🟡 中 | 252 定期备份计划 + 恢复演练 | **✅ 已完成（2026-08-07）**：恢复演练完整通过（行数 100% 一致、FK 通过）；定期备份由 systemd timer `cuneim-backup.timer`（每天 03:30 UTC，保留 7 份，错过补跑）承担，脚本 `scripts/backup-252.sh` |
| 🟡 中 | 第二 Origin 高可用（Cloudflare Origin Pool） | 配置清单已出（`docs/cloudflare-origin-pool.md`），需用户在 Cloudflare 面板执行 |
| 4 | usage_records 分区改造 | **✅ 已完成 4/6 表（2026-08-07）**：usage_records/usage_logs/audit_log/request_logs 已按月分区，分区裁剪生效（Subplans Removed 8/9）、写入路由正常；usage_daily/usage_monthly 因唯一约束冲突暂缓（见 remaining-tasks.md §1） |
| 🟡 中 | Prisma 迁移历史单一归属重构 | 待确认 |
| 🟢 低 | `INTERNAL_BASE_URL=http://app:3000` 在新环境不可解析（当前无影响） | 待开发确认用途 |
| 🟢 低 | /sitemap.xml 404（爬虫抓取失败，SEO 优化） | 可选 |
| ⚪ 观察 | 观察期后停用旧环境 postgres | 1–3 天后 |

## 8. 交付物

- `docs/data-migration-plan.md` —— 迁移方案与执行记录（已更新）
- `docs/sync_sequences.sql` / `docs/check_sequences.sql` —— 序列工具脚本
- `docs/migration-delivery-report.md` —— 本报告
- `scripts/lockdown-251.sh` / `lockdown-252.sh` + systemd unit —— 端口收敛（已启用）
- git commits：`ce83f06`（配置+方案）、`f8b8235`（安全审计）、`ad35c52`（交付报告）、`2aed7fe`（收敛标记）、`6e14a9f`（收敛脚本）

## 9. 部署事件记录（2026-08-07 14:00）

推送 origin/main 后，一次 `workflow_dispatch`/tag 触发的 CI 部署（镜像 `next-v20260807134839`）使用了
**旧 checkout**（早于 healthcheck 修复的 main），导致：

- 远程 compose 被旧版覆盖，app 健康检查回退为 `localhost:3000`（旧镜像绑定容器 IP → unhealthy）；
- 252/251 的 app 容器被 CI 用旧配置重建，先后出现 unhealthy；
- 同期进行的备份恢复演练撞上部署窗口，postgres 容器被 CI 重建导致恢复中断（非备份问题）。

**处理**：将修复版 compose（`$HOSTNAME` healthcheck）重新同步到远程并重建 app，全部恢复 healthy；
恢复演练在部署完成后重做并完整通过。

**教训/建议**：
1. 手动修改远程 compose 会被 CI 部署覆盖 —— 配置修复必须先进 `origin/main`（healthcheck 修复已在 main，下次部署自动正确）；
2. 触发部署后应等待其完成再做数据库级操作（恢复演练等），避免撞部署窗口。
