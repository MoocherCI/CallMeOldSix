// Shared constants
export const GITHUB_REPO = 'MoocherCI/CallMeOldSix';
export const ENVIRONMENT_OPTIONS = ['dev', 'test', 'prod'];
export const SERVICE_OPTIONS = ['all', 'app', 'agent', 'admin', 'app+agent', 'app+admin', 'agent+admin'];

export function buildDeployCard() {
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


export function buildNotifyCard(data) {
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


export function buildResultCard(success, message, params) {
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
