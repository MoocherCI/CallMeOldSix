const GITHUB_REPO = 'MoocherCI/CallMeOldSix';
const GITHUB_WORKFLOW = 'deploy.yml';
const ENVIRONMENT_OPTIONS = ['dev', 'test', 'prod'];
const SERVICE_OPTIONS = ['all', 'app', 'agent', 'admin', 'app+agent', 'app+admin', 'agent+admin'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/deploy') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(getDeployPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
      });
    }

    if (request.method === 'POST' && url.pathname === '/deploy') {
      return handleDeploy(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleDeploy(request, env) {
  try {
    const body = await request.json();
    const { environment, services = 'all', version = '', branch = '' } = body;

    if (!environment || !ENVIRONMENT_OPTIONS.includes(environment)) {
      return Response.json(
        { success: false, message: `无效的部署环境，可选值: ${ENVIRONMENT_OPTIONS.join(', ')}` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!SERVICE_OPTIONS.includes(services)) {
      return Response.json(
        { success: false, message: `无效的服务选项，可选值: ${SERVICE_OPTIONS.join(', ')}` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'deploy-bot',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { environment, version, services, branch },
        }),
      }
    );

    if (githubResponse.status === 204) {
      return Response.json(
        { success: true, message: '已触发部署', params: { environment, services, version, branch } },
        { headers: CORS_HEADERS }
      );
    }

    const errorText = await githubResponse.text();
    return Response.json(
      { success: false, message: `GitHub API 返回 ${githubResponse.status}: ${errorText}` },
      { status: 502, headers: CORS_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { success: false, message: `请求处理失败: ${err.message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

function getDeployPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>部署面板</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f1117;
    color: #e1e4e8;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .container {
    width: 100%;
    max-width: 420px;
    background: #161b22;
    border-radius: 12px;
    padding: 32px 28px;
    border: 1px solid #30363d;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 28px;
    color: #f0f6fc;
  }
  .field {
    margin-bottom: 20px;
  }
  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #8b949e;
    margin-bottom: 6px;
  }
  select, input[type="text"] {
    width: 100%;
    padding: 10px 12px;
    font-size: 15px;
    background: #0d1117;
    color: #e1e4e8;
    border: 1px solid #30363d;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.2s;
  }
  select:focus, input[type="text"]:focus {
    border-color: #58a6ff;
  }
  input::placeholder {
    color: #484f58;
  }
  .btn {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    background: #238636;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 8px;
    transition: background 0.2s;
  }
  .btn:hover { background: #2ea043; }
  .btn:active { background: #1a7f37; }
  .btn:disabled {
    background: #21262d;
    color: #484f58;
    cursor: not-allowed;
  }
  .result {
    margin-top: 20px;
    padding: 14px 16px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.6;
    display: none;
  }
  .result.success {
    background: rgba(35, 134, 54, 0.15);
    border: 1px solid #238636;
    color: #3fb950;
  }
  .result.error {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid #f85149;
    color: #f85149;
  }
  .params {
    margin-top: 10px;
    font-size: 13px;
    color: #8b949e;
  }
  .params span {
    display: inline-block;
    background: #21262d;
    padding: 2px 8px;
    border-radius: 4px;
    margin: 2px 4px 2px 0;
    color: #c9d1d9;
  }
</style>
</head>
<body>
<div class="container">
  <h1>🚀 部署面板</h1>
  <div class="field">
    <label for="environment">部署环境</label>
    <select id="environment">
      <option value="dev">dev</option>
      <option value="test">test</option>
      <option value="prod">prod</option>
    </select>
  </div>
  <div class="field">
    <label for="services">部署服务</label>
    <select id="services">
      <option value="all">all</option>
      <option value="app">app</option>
      <option value="agent">agent</option>
      <option value="admin">admin</option>
      <option value="app+agent">app+agent</option>
      <option value="app+admin">app+admin</option>
      <option value="agent+admin">agent+admin</option>
    </select>
  </div>
  <div class="field">
    <label for="version">版本号</label>
    <input type="text" id="version" placeholder="留空=自动生成时间戳">
  </div>
  <div class="field">
    <label for="branch">分支</label>
    <input type="text" id="branch" placeholder="留空=默认分支">
  </div>
  <button class="btn" id="deployBtn" onclick="deploy()">🚀 开始部署</button>
  <div class="result" id="result"></div>
</div>
<script>
async function deploy() {
  const btn = document.getElementById('deployBtn');
  const result = document.getElementById('result');
  const payload = {
    environment: document.getElementById('environment').value,
    services: document.getElementById('services').value,
    version: document.getElementById('version').value,
    branch: document.getElementById('branch').value,
  };

  btn.disabled = true;
  btn.textContent = '⏳ 正在触发…';
  result.style.display = 'none';
  result.className = 'result';

  try {
    const res = await fetch('/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      result.className = 'result success';
      let html = '✅ 已触发部署';
      if (data.params) {
        html += '<div class="params">';
        html += '<span>环境: ' + data.params.environment + '</span>';
        html += '<span>服务: ' + data.params.services + '</span>';
        if (data.params.version) html += '<span>版本: ' + data.params.version + '</span>';
        if (data.params.branch) html += '<span>分支: ' + data.params.branch + '</span>';
        html += '</div>';
      }
      result.innerHTML = html;
    } else {
      result.className = 'result error';
      result.textContent = '❌ 触发失败: ' + data.message;
    }
  } catch (err) {
    result.className = 'result error';
    result.textContent = '❌ 触发失败: ' + err.message;
  }

  result.style.display = 'block';
  btn.disabled = false;
  btn.textContent = '🚀 开始部署';
}
</script>
</body>
</html>`;
}
