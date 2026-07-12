# Dual-machine deployment

## Service placement

| Host | Services | Default resource ceiling |
| --- | --- | --- |
| 251 | Nginx, Agent, 8 User App instances | 14.5 CPU, 20.5 GiB |
| 252 | PostgreSQL, Redis, Agent, Admin, 2 User App instances | 15.5 CPU, 51 GiB |

The defaults target at least 16 vCPU / 32 GiB on 251 and 16 vCPU / 64 GiB on
252. Limits are ceilings rather than reservations. Keep at least 20% of each
host's memory free for the kernel, Docker, filesystem cache, and deployment
overlap. If the actual hosts are smaller, lower the repository variables before
deploying.

251 is compute-oriented. Each host now runs one local Agent and publishes host
port 3100 to its actual container port 3000; apps use `http://agent:3000` on
their local Docker network, avoiding a cross-host Agent dependency. The
prebuilt binary and its Dockerfile currently disagree about this port, so
deployment follows the verified runtime behavior. 252 remains data-oriented:
PostgreSQL receives 38 GiB and 7.5 CPUs by default, while only two User App
instances and the second Agent run beside the data layer.

## Repository variables

The following GitHub Actions repository variables override the conservative
defaults without changing Compose files:

| Variable | Default |
| --- | --- |
| `DUAL_APP_MEM_LIMIT` | `2g` |
| `DUAL_APP_CPU_LIMIT` | `1.50` |
| `DUAL_AGENT_MEM_LIMIT` | `4g` |
| `DUAL_AGENT_CPU_LIMIT` | `2.00` |
| `DUAL_AGENT_252_MEM_LIMIT` | `3g` |
| `DUAL_AGENT_252_CPU_LIMIT` | `1.50` |
| `DUAL_NGINX_MEM_LIMIT` | `512m` |
| `DUAL_NGINX_CPU_LIMIT` | `0.50` |
| `DUAL_POSTGRES_MEM_LIMIT` | `38g` |
| `DUAL_POSTGRES_CPU_LIMIT` | `7.50` |
| `DUAL_POSTGRES_SHARED_BUFFERS` | `10GB` |
| `DUAL_POSTGRES_EFFECTIVE_CACHE_SIZE` | `30GB` |
| `DUAL_POSTGRES_MAINTENANCE_WORK_MEM` | `2GB` |
| `DUAL_REDIS_MEM_LIMIT` | `4g` |
| `DUAL_REDIS_CPU_LIMIT` | `2.00` |
| `DUAL_REDIS_MAXMEMORY` | `3gb` |
| `DUAL_ADMIN_MEM_LIMIT` | `2g` |
| `DUAL_ADMIN_CPU_LIMIT` | `1.50` |
| `DUAL_RUN_APP_MIGRATIONS` | `false` |
| `DUAL_RUN_ADMIN_MIGRATIONS` | `false` |

## Deployment behavior

Dual ingress serves `next.cuneim.com`, `next-api.cuneim.com`,
`next-stream.cuneim.com`, and `next-admin.cuneim.com`. The corresponding
production hostnames remain accepted as aliases so an origin switch does not
require another container release.

- `app` deploys to both 251 and 252, then refreshes the 251 ingress.
- `agent` deploys to both 252 and 251; each host's apps use its local Agent.
- `admin` deploys only to 252.
- Combined selections use the union of those host targets.
- 252 data services start and pass readiness checks first.
- User and Admin image deployment is temporarily decoupled from their shared,
  poisoned Prisma migration history. Keep `DUAL_RUN_APP_MIGRATIONS` and
  `DUAL_RUN_ADMIN_MIGRATIONS` set to `false` until the overlapping histories
  and the failed 252 migration record are repaired. When explicitly enabled,
  migrations run in one-off containers and any failure stops deployment.
- User and Admin both manage the `main`, `session`, `admin`, `usage`, and `log`
  Prisma schemas. Their migration metadata remains separated using the same
  connection defaults as single-machine deployment: `public` for User and
  `admin` for Admin.
- Only selected service images are pulled and recreated. Unselected image tags
  are preserved.
- Removed legacy replicas are cleaned with `--remove-orphans` during an app
  deployment.
- Every updated application endpoint must pass its HTTP health check.
- Nginx configuration is validated before the ingress container is recreated.

## Required infrastructure work

These items cannot be completed by the deployment repository alone:

1. Make one package the sole owner of Prisma migrations. The current User and
   Admin migration histories overlap and the 252 database contains a failed
   `20260101000000_init` record.
2. Back up the 252 PostgreSQL volume before repairing migration state.
3. Restrict ports 3000-3006, 3100, 5432, and 6379 to the private network using
   cloud firewall rules and the Docker `DOCKER-USER` chain.
4. Configure a second ingress origin before claiming high availability. A
   Cloudflare Origin Pool or equivalent load balancer should health-check both
   hosts.
5. Send logs and metrics off-host. Local Docker volumes are not shared between
   251 and 252.
6. Add PostgreSQL backups and restore testing; a single local `pgdata` volume is
   not a disaster-recovery strategy.
