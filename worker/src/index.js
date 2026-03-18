const GITHUB_REPO = 'MoocherCI/CallMeOldSix';
const GITHUB_WORKFLOW = 'deploy.yml';
const ENVIRONMENT_OPTIONS = ['dev', 'test', 'prod'];
const SERVICE_OPTIONS = ['all', 'app', 'agent', 'admin', 'app+agent', 'app+admin', 'agent+admin'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/event') {
      return handleEvent(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      return Response.json({ status: 'ok' });
    }

    if (request.method === 'POST' && url.pathname === '/callback') {
      return handleCallback(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/notify') {
      return handleNotify(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/test-deploy') {
      return handleTestDeploy(env);
    }

    if (request.method === 'GET' && url.pathname === '/test-callback') {
      return handleTestCallback(env);
    }

    if (request.method === 'GET' && url.pathname === '/debug-callback-response') {
      return handleDebugCallbackResponse(env);
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return Response.json({ status: 'ok', service: 'deploy-bot' });
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ─── Lark Event Subscription ───────────────────────────────────────────────────

async function handleEvent(request, env) {
  try {
    const body = await request.json();
    console.log('[event] Received event:', JSON.stringify(body).substring(0, 500));

    // Lark challenge verification
    if (body.type === 'url_verification') {
      return Response.json({ challenge: body.challenge });
    }

    // Verify token
    if (!body.header || body.header.token !== env.LARK_VERIFICATION_TOKEN) {
      return Response.json({ error: 'invalid token' }, { status: 401 });
    }

    // Handle message events
    if (body.header.event_type === 'im.message.receive_v1') {
      const message = body.event?.message;
      console.log('[event] Message event received, message:', JSON.stringify(message).substring(0, 300));
      if (message) {
        try {
          const content = JSON.parse(message.content);
          const text = (content.text || '').trim().toLowerCase();
          console.log('[event] Parsed text:', text);
          if (text.includes('/deploy')) {
            const chatId = message.chat_id;
            console.log('[event] /deploy command detected, chatId:', chatId);
            const token = await getLarkToken(env);
            console.log('[event] Got Lark token successfully');
            await sendLarkMessage(token, chatId, buildDeployCard());
            console.log('[event] Deploy card sent successfully');
          }
        } catch (e) {
          console.error('[event] Error processing message:', e.message, e.stack);
        }
      }
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── Test Deploy Endpoint ──────────────────────────────────────────────────────

async function handleTestDeploy(env) {
  try {
    console.log('[test-deploy] Starting test...');
    const token = await getLarkToken(env);
    console.log('[test-deploy] Got Lark token successfully');
    const card = buildDeployCard();
    console.log('[test-deploy] Built deploy card:', JSON.stringify(card).substring(0, 200));
    const result = await sendLarkMessage(token, env.LARK_CHAT_ID, card);
    console.log('[test-deploy] sendLarkMessage result:', JSON.stringify(result));
    return Response.json({ success: true, result });
  } catch (err) {
    console.error('[test-deploy] Error:', err.message, err.stack);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── Test Callback Endpoint ───────────────────────────────────────────────────

async function handleTestCallback(env) {
  const steps = {};
  try {
    // Step 1: Check GITHUB_TOKEN
    const hasGithubToken = !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim());
    steps.github_token = hasGithubToken ? 'present' : 'EMPTY — deploy will fail, run: cd worker && npx wrangler secret put GITHUB_TOKEN';

    // Step 2: Simulate form values (same as a real button click)
    const formValue = { environment: 'dev', services: 'all', version: '', branch: '' };
    steps.form_value = formValue;

    // Step 3: Validate environment
    if (!ENVIRONMENT_OPTIONS.includes(formValue.environment)) {
      steps.validation = 'environment validation failed';
      return Response.json({ success: false, steps });
    }
    steps.validation = 'passed';

    // Step 4: Get Lark token (to verify we can send responses)
    const token = await getLarkToken(env);
    steps.lark_token = 'obtained successfully';

    // Step 5: Try GitHub API call (only if token is present)
    if (!hasGithubToken) {
      steps.github_api = 'SKIPPED — GITHUB_TOKEN is empty';
      return Response.json({ success: false, steps, fix: 'Run: cd worker && npx wrangler secret put GITHUB_TOKEN and paste your GitHub PAT' });
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
          inputs: { environment: 'dev', version: '', services: 'all', branch: '' },
        }),
      }
    );

    if (githubResponse.status === 204) {
      steps.github_api = 'SUCCESS — workflow dispatched (status 204)';
      return Response.json({ success: true, steps });
    }

    const errorText = await githubResponse.text();
    steps.github_api = `FAILED — status ${githubResponse.status}: ${errorText}`;
    return Response.json({ success: false, steps });
  } catch (err) {
    steps.error = err.message;
    return Response.json({ success: false, steps, error: err.message });
  }
}

// ─── Debug Callback Response ──────────────────────────────────────────────────

async function handleDebugCallbackResponse(env) {
  const successCard = buildResultCard(true, '已触发部署', { environment: 'dev', services: 'all', version: '', branch: '' });
  const errorCard = buildResultCard(false, 'GitHub API 返回 403: ...', null);
  const redeployCard = buildDeployCard();
  return Response.json({
    note: 'These are the exact response bodies handleCallback returns to Lark',
    success_response: successCard,
    error_response: errorCard,
    redeploy_response: redeployCard,
  });
}

// ─── Lark Card Action Callback ──────────────────────────────────────────────────

async function handleCallback(request, env) {
  try {
    const body = await request.json();
    console.log('[callback] Received callback:', JSON.stringify(body).substring(0, 500));

    // Handle Lark URL verification challenge
    if (body.type === 'url_verification') {
      return Response.json({ challenge: body.challenge });
    }

    // Verify token
    console.log('[callback] Token check:', body.token ? 'present' : 'missing', 'expected:', env.LARK_VERIFICATION_TOKEN ? 'configured' : 'NOT configured');
    if (body.token !== env.LARK_VERIFICATION_TOKEN) {
      return Response.json({ error: 'invalid token' }, { status: 401 });
    }

    const action = body.action;
    console.log('[callback] Action:', JSON.stringify(action).substring(0, 300));
    if (!action) {
      return new Response('ok', { status: 200 });
    }

    // Handle deploy button click
    if (action.value && action.value.key === 'deploy') {
      console.log('[callback] Deploy action triggered, form_value:', JSON.stringify(action.form_value));
      const formValue = action.form_value || {};
      const environment = formValue.environment;
      const services = formValue.services || 'all';
      const version = formValue.version || '';
      const branch = formValue.branch || '';

      // Validate environment
      if (!environment || !ENVIRONMENT_OPTIONS.includes(environment)) {
        return Response.json(buildResultCard(false, `无效的部署环境，可选值: ${ENVIRONMENT_OPTIONS.join(', ')}`, null));
      }

      // Validate services
      if (!SERVICE_OPTIONS.includes(services)) {
        return Response.json(buildResultCard(false, `无效的服务选项，可选值: ${SERVICE_OPTIONS.join(', ')}`, null));
      }

      // Trigger GitHub workflow
      try {
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
              ref: branch || 'main',
              inputs: { environment, version, services, branch },
            }),
          }
        );

        console.log('[callback] GitHub API response status:', githubResponse.status);

        if (githubResponse.status === 204) {
          const params = { environment, services, version, branch };
          return Response.json(buildResultCard(true, '已触发部署', params));
        }

        const errorText = await githubResponse.text();
        return Response.json(buildResultCard(false, `GitHub API 返回 ${githubResponse.status}: ${errorText}`, null));
      } catch (err) {
        return Response.json(buildResultCard(false, `请求处理失败: ${err.message}`, null));
      }
    }

    // Handle redeploy button click
    if (action.value && action.value.key === 'redeploy') {
      return Response.json(buildDeployCard());
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[callback] Unhandled error:', err.message, err.stack);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── Deployment Notification (called by GitHub Actions) ─────────────────────────

async function handleNotify(request, env) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.NOTIFY_SECRET}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const token = await getLarkToken(env);
    const card = buildNotifyCard(data);

    await sendLarkMessage(token, env.LARK_CHAT_ID, card);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─── Lark API Helpers ───────────────────────────────────────────────────────────

async function getLarkToken(env) {
  const response = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.LARK_APP_ID,
      app_secret: env.LARK_APP_SECRET,
    }),
  });
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`Failed to get Lark token: ${result.msg}`);
  }
  return result.tenant_access_token;
}

async function sendLarkMessage(token, chatId, card) {
  const response = await fetch('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    }),
  });
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`Failed to send Lark message: ${result.msg}`);
  }
  return result;
}

// ─── Card Builders ──────────────────────────────────────────────────────────────

function buildDeployCard() {
  return {
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '🚀 触发部署' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'form',
        name: 'deploy_form',
        elements: [
          {
            tag: 'select_static',
            name: 'environment',
            placeholder: { tag: 'plain_text', content: '选择部署环境' },
            options: ENVIRONMENT_OPTIONS.map((v) => ({
              text: { tag: 'plain_text', content: v },
              value: v,
            })),
          },
          {
            tag: 'select_static',
            name: 'services',
            placeholder: { tag: 'plain_text', content: '选择部署服务' },
            initial_option: 'all',
            options: SERVICE_OPTIONS.map((v) => ({
              text: { tag: 'plain_text', content: v },
              value: v,
            })),
          },
          {
            tag: 'input',
            name: 'version',
            placeholder: { tag: 'plain_text', content: '留空=自动生成时间戳' },
          },
          {
            tag: 'input',
            name: 'branch',
            placeholder: { tag: 'plain_text', content: '留空=默认分支' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🚀 开始部署' },
            type: 'primary',
            form_action_type: 'submit',
            name: 'deploy',
            value: { key: 'deploy' },
          },
        ],
      },
    ],
  };
}

function buildNotifyCard(data) {
  const {
    status = 'unknown',
    actor = '',
    tag = '',
    services = '',
    commit_message = '',
    commit_time = '',
    commit_sha = '',
    repository = GITHUB_REPO,
    workflow_url = '',
  } = data;

  const isSuccess = status === 'success';
  const statusText = isSuccess ? '✅ Success' : '❌ Failed';
  const commitUrl = commit_sha ? `https://github.com/${repository}/commit/${commit_sha}` : '';

  const mdLines = [
    `**发起人:** ${actor}`,
    `**Tag:** ${tag}`,
    `**构建服务:** ${services}`,
    `**状态:** ${statusText}`,
    `**提交信息:** ${commit_message}`,
    `**提交时间:** ${commit_time}`,
  ];
  if (commitUrl) {
    mdLines.push(`**提交:** [${commit_sha.substring(0, 7)}](${commitUrl})`);
  }

  const buttons = [];
  if (workflow_url) {
    buttons.push({
      tag: 'button',
      text: { tag: 'plain_text', content: '查看 Workflow' },
      type: 'default',
      url: workflow_url,
    });
  }
  if (commitUrl) {
    buttons.push({
      tag: 'button',
      text: { tag: 'plain_text', content: '查看提交' },
      type: 'default',
      url: commitUrl,
    });
  }
  buttons.push({
    tag: 'button',
    text: { tag: 'plain_text', content: '🚀 重新部署' },
    type: 'primary',
    value: { key: 'redeploy' },
  });

  return {
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: 'GitHub Action 执行通知' },
      template: isSuccess ? 'green' : 'red',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: mdLines.join('\n'),
        },
      },
      {
        tag: 'action',
        actions: buttons,
      },
    ],
  };
}

function buildResultCard(success, message, params) {
  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: success ? `✅ ${message}` : `❌ ${message}`,
      },
    },
  ];

  if (params) {
    const paramLines = [`**环境:** ${params.environment}`, `**服务:** ${params.services}`];
    if (params.version) paramLines.push(`**版本:** ${params.version}`);
    if (params.branch) paramLines.push(`**分支:** ${params.branch}`);
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: paramLines.join('\n'),
      },
    });
  }

  return {
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: success ? '✅ 部署触发成功' : '❌ 部署触发失败' },
      template: success ? 'green' : 'red',
    },
    elements,
  };
}
