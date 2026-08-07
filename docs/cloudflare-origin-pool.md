# Cloudflare 第二 Origin 高可用配置清单

> 目的：`cuneim.com` 等域名在 Cloudflare 配置 Origin Pool / Load Balancing，
> 251 为主入口、旧环境或 252 为备用，健康检查失败时自动切换。
> 前置：需要 Cloudflare 账号开通 **Load Balancing**（部分套餐含试用额度）。
> 本文档为**用户操作指引**（Agent 无 Zone 权限，无法代为执行）。

---

## 1. 前置确认

- [ ] Cloudflare 账号有 cuneim.com Zone 的管理权限；
- [ ] 套餐支持 Load Balancing（免费套餐可用 1 个 Load Balancer + 2 个 Origin Pool；
      超出需升级或按量计费）；
- [ ] 备用 Origin 就绪：旧环境 3.112.192.155（nginx 入口，app 已停但可回滚启动）
      **或** 在 252 补一套 nginx（需证书 `*.cuneim.com`）。

## 2. 创建 Origin Pool

Cloudflare 面板 → Load Balancing → Origin Pools → Create Pool：

| 字段 | 主池（primary） | 备池（failover，可选） |
| --- | --- | --- |
| Pool name | `cuneim-primary` | `cuneim-fallback` |
| Origin 1 | `91.110.182.251`（Hostname: cuneim.com） | `3.112.192.155`（旧环境） |
| 健康检查 | HTTPS / `GET /api/health`，间隔 30s，超时 5s，重试 2，阈值 2 | 同左 |
| 区域 | 按实际部署位置 | 同左 |
| 降级行为 | 标记 down 后切换到下一可用池 | — |

> 说明：主池健康检查用 `/api/health`（251 的 app 返回 200 JSON）。
> 若备用选旧环境，其 app 当前已停，需回滚启动后才可作为备池；备池健康检查失败会被 LB 标记 down，不影响主池。

## 3. 创建 Load Balancer

Load Balancing → Load Balancers → Create Load Balancer：

| 字段 | 值 |
| --- | --- |
| Hostname | `cuneim.com`（先在 DNS 记录上把 A 记录删掉，LB 会创建 CNAME） |
| Pool 顺序 | primary → fallback |
| 会话粘滞 | 建议关闭（app 无状态；JWT 在 header） |
| 流量导向 | Random（或按需） |
| 地区/steering | 按默认 |

对 `api.cuneim.com`、`admin.cuneim.com`、`dev.cuneim.com`、`stream.cuneim.com`
重复创建对应 LB（健康检查路径相同：`/api/health`；admin 可用 `/api`）。

## 4. DNS 切换

- 原 A 记录（91.110.182.251）删除，由 LB 自动创建 CNAME 指向
  `cuneim.com.cdn.cloudflare.net`（或面板显示的 LB 主机名）；
- 保持 **Proxied（橙云）**；
- `stream.cuneim.com` 当前为 **DNS only**（直连）：若也要走 LB，需改为 Proxied 或
  用独立 LB（注意 WebSocket/长连接代理行为变化，建议先小流量验证）。

## 5. 验证

- [ ] `curl https://cuneim.com/api/health` 返回 200；
- [ ] Cloudflare 面板 LB 状态：primary 池 healthy；
- [ ] 模拟故障（可选）：临时停 251 nginx 或加防火墙 DROP 443，观察 30–60s 内 LB 切到备池、域名仍可访问；
- [ ] 恢复后 LB 自动回切主池。

## 6. 回滚

删除 LB、恢复 A 记录指向 91.110.182.251（Proxied）即可回到当前单入口模式。

---

## 备选：不启用 LB 的简化高可用

当前架构（251 单入口 + Cloudflare Proxied）下，Cloudflare 侧无自动切换。
若要最低成本提升可用性，可在面板把 A 记录 TTL 调低（如 60s）并定期人工切换，
但这不提供自动故障转移——**推荐按上文配置 LB**。
