var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-cRkf2V/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-cRkf2V/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.js
var GITHUB_REPO = "MoocherCI/CallMeOldSix";
var GITHUB_WORKFLOW = "deploy.yml";
var ENVIRONMENT_OPTIONS = ["dev", "test", "prod"];
var SERVICE_OPTIONS = ["all", "app", "agent", "admin", "app+agent", "app+admin", "agent+admin"];
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/event") {
      return handleEvent(request, env);
    }
    if (request.method === "GET" && url.pathname === "/callback") {
      return Response.json({ status: "ok" });
    }
    if (request.method === "POST" && url.pathname === "/callback") {
      return handleCallback(request, env);
    }
    if (request.method === "POST" && url.pathname === "/notify") {
      return handleNotify(request, env);
    }
    if (request.method === "GET" && url.pathname === "/test-deploy") {
      return handleTestDeploy(env);
    }
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({ status: "ok", service: "deploy-bot" });
    }
    return new Response("Not Found", { status: 404 });
  }
};
async function handleEvent(request, env) {
  try {
    const body = await request.json();
    console.log("[event] Received event:", JSON.stringify(body).substring(0, 500));
    if (body.type === "url_verification") {
      return Response.json({ challenge: body.challenge });
    }
    if (!body.header || body.header.token !== env.LARK_VERIFICATION_TOKEN) {
      return Response.json({ error: "invalid token" }, { status: 401 });
    }
    if (body.header.event_type === "im.message.receive_v1") {
      const message = body.event?.message;
      console.log("[event] Message event received, message:", JSON.stringify(message).substring(0, 300));
      if (message) {
        try {
          const content = JSON.parse(message.content);
          const text = (content.text || "").trim().toLowerCase();
          console.log("[event] Parsed text:", text);
          if (text.includes("/deploy")) {
            const chatId = message.chat_id;
            console.log("[event] /deploy command detected, chatId:", chatId);
            const token = await getLarkToken(env);
            console.log("[event] Got Lark token successfully");
            await sendLarkMessage(token, chatId, buildDeployCard());
            console.log("[event] Deploy card sent successfully");
          }
        } catch (e) {
          console.error("[event] Error processing message:", e.message, e.stack);
        }
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
__name(handleEvent, "handleEvent");
async function handleTestDeploy(env) {
  try {
    console.log("[test-deploy] Starting test...");
    const token = await getLarkToken(env);
    console.log("[test-deploy] Got Lark token successfully");
    const card = buildDeployCard();
    console.log("[test-deploy] Built deploy card:", JSON.stringify(card).substring(0, 200));
    const result = await sendLarkMessage(token, env.LARK_CHAT_ID, card);
    console.log("[test-deploy] sendLarkMessage result:", JSON.stringify(result));
    return Response.json({ success: true, result });
  } catch (err) {
    console.error("[test-deploy] Error:", err.message, err.stack);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
__name(handleTestDeploy, "handleTestDeploy");
async function handleCallback(request, env) {
  try {
    const body = await request.json();
    if (body.type === "url_verification") {
      return Response.json({ challenge: body.challenge });
    }
    if (body.token !== env.LARK_VERIFICATION_TOKEN) {
      return Response.json({ error: "invalid token" }, { status: 401 });
    }
    const action = body.action;
    if (!action) {
      return new Response("ok", { status: 200 });
    }
    if (action.value && action.value.key === "deploy") {
      const formValue = action.form_value || {};
      const environment = formValue.environment;
      const services = formValue.services || "all";
      const version = formValue.version || "";
      const branch = formValue.branch || "";
      if (!environment || !ENVIRONMENT_OPTIONS.includes(environment)) {
        return Response.json({
          toast: { type: "error", content: `\u65E0\u6548\u7684\u90E8\u7F72\u73AF\u5883\uFF0C\u53EF\u9009\u503C: ${ENVIRONMENT_OPTIONS.join(", ")}` },
          card: buildResultCard(false, `\u65E0\u6548\u7684\u90E8\u7F72\u73AF\u5883\uFF0C\u53EF\u9009\u503C: ${ENVIRONMENT_OPTIONS.join(", ")}`, null)
        });
      }
      if (!SERVICE_OPTIONS.includes(services)) {
        return Response.json({
          toast: { type: "error", content: `\u65E0\u6548\u7684\u670D\u52A1\u9009\u9879\uFF0C\u53EF\u9009\u503C: ${SERVICE_OPTIONS.join(", ")}` },
          card: buildResultCard(false, `\u65E0\u6548\u7684\u670D\u52A1\u9009\u9879\uFF0C\u53EF\u9009\u503C: ${SERVICE_OPTIONS.join(", ")}`, null)
        });
      }
      try {
        const githubResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
          {
            method: "POST",
            headers: {
              Authorization: `token ${env.GITHUB_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "deploy-bot",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ref: branch || "main",
              inputs: { environment, version, services, branch }
            })
          }
        );
        if (githubResponse.status === 204) {
          const params = { environment, services, version, branch };
          return Response.json({
            toast: { type: "success", content: "\u5DF2\u89E6\u53D1\u90E8\u7F72" },
            card: buildResultCard(true, "\u5DF2\u89E6\u53D1\u90E8\u7F72", params)
          });
        }
        const errorText = await githubResponse.text();
        return Response.json({
          toast: { type: "error", content: "\u89E6\u53D1\u5931\u8D25" },
          card: buildResultCard(false, `GitHub API \u8FD4\u56DE ${githubResponse.status}: ${errorText}`, null)
        });
      } catch (err) {
        return Response.json({
          toast: { type: "error", content: "\u89E6\u53D1\u5931\u8D25" },
          card: buildResultCard(false, `\u8BF7\u6C42\u5904\u7406\u5931\u8D25: ${err.message}`, null)
        });
      }
    }
    if (action.value && action.value.key === "redeploy") {
      return Response.json({
        toast: { type: "info", content: "\u8BF7\u586B\u5199\u90E8\u7F72\u53C2\u6570" },
        card: buildDeployCard()
      });
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
__name(handleCallback, "handleCallback");
async function handleNotify(request, env) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${env.NOTIFY_SECRET}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
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
__name(handleNotify, "handleNotify");
async function getLarkToken(env) {
  const response = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: env.LARK_APP_ID,
      app_secret: env.LARK_APP_SECRET
    })
  });
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`Failed to get Lark token: ${result.msg}`);
  }
  return result.tenant_access_token;
}
__name(getLarkToken, "getLarkToken");
async function sendLarkMessage(token, chatId, card) {
  const response = await fetch("https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card)
    })
  });
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`Failed to send Lark message: ${result.msg}`);
  }
  return result;
}
__name(sendLarkMessage, "sendLarkMessage");
function buildDeployCard() {
  return {
    config: { update_multi: true },
    header: {
      title: { tag: "plain_text", content: "\u{1F680} \u89E6\u53D1\u90E8\u7F72" },
      template: "blue"
    },
    elements: [
      {
        tag: "form",
        name: "deploy_form",
        elements: [
          {
            tag: "select_static",
            name: "environment",
            placeholder: { tag: "plain_text", content: "\u9009\u62E9\u90E8\u7F72\u73AF\u5883" },
            options: ENVIRONMENT_OPTIONS.map((v) => ({
              text: { tag: "plain_text", content: v },
              value: v
            }))
          },
          {
            tag: "select_static",
            name: "services",
            placeholder: { tag: "plain_text", content: "\u9009\u62E9\u90E8\u7F72\u670D\u52A1" },
            initial_option: "all",
            options: SERVICE_OPTIONS.map((v) => ({
              text: { tag: "plain_text", content: v },
              value: v
            }))
          },
          {
            tag: "input",
            name: "version",
            placeholder: { tag: "plain_text", content: "\u7559\u7A7A=\u81EA\u52A8\u751F\u6210\u65F6\u95F4\u6233" }
          },
          {
            tag: "input",
            name: "branch",
            placeholder: { tag: "plain_text", content: "\u7559\u7A7A=\u9ED8\u8BA4\u5206\u652F" }
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "\u{1F680} \u5F00\u59CB\u90E8\u7F72" },
            type: "primary",
            form_action_type: "submit",
            name: "deploy",
            value: { key: "deploy" }
          }
        ]
      }
    ]
  };
}
__name(buildDeployCard, "buildDeployCard");
function buildNotifyCard(data) {
  const {
    status = "unknown",
    actor = "",
    tag = "",
    services = "",
    commit_message = "",
    commit_time = "",
    commit_sha = "",
    repository = GITHUB_REPO,
    workflow_url = ""
  } = data;
  const isSuccess = status === "success";
  const statusText = isSuccess ? "\u2705 Success" : "\u274C Failed";
  const commitUrl = commit_sha ? `https://github.com/${repository}/commit/${commit_sha}` : "";
  const mdLines = [
    `**\u53D1\u8D77\u4EBA:** ${actor}`,
    `**Tag:** ${tag}`,
    `**\u6784\u5EFA\u670D\u52A1:** ${services}`,
    `**\u72B6\u6001:** ${statusText}`,
    `**\u63D0\u4EA4\u4FE1\u606F:** ${commit_message}`,
    `**\u63D0\u4EA4\u65F6\u95F4:** ${commit_time}`
  ];
  if (commitUrl) {
    mdLines.push(`**\u63D0\u4EA4:** [${commit_sha.substring(0, 7)}](${commitUrl})`);
  }
  const buttons = [];
  if (workflow_url) {
    buttons.push({
      tag: "button",
      text: { tag: "plain_text", content: "\u67E5\u770B Workflow" },
      type: "default",
      url: workflow_url
    });
  }
  if (commitUrl) {
    buttons.push({
      tag: "button",
      text: { tag: "plain_text", content: "\u67E5\u770B\u63D0\u4EA4" },
      type: "default",
      url: commitUrl
    });
  }
  buttons.push({
    tag: "button",
    text: { tag: "plain_text", content: "\u{1F680} \u91CD\u65B0\u90E8\u7F72" },
    type: "primary",
    value: { key: "redeploy" }
  });
  return {
    config: { update_multi: true },
    header: {
      title: { tag: "plain_text", content: "GitHub Action \u6267\u884C\u901A\u77E5" },
      template: isSuccess ? "green" : "red"
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: mdLines.join("\n")
        }
      },
      {
        tag: "action",
        actions: buttons
      }
    ]
  };
}
__name(buildNotifyCard, "buildNotifyCard");
function buildResultCard(success, message, params) {
  const elements = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: success ? `\u2705 ${message}` : `\u274C ${message}`
      }
    }
  ];
  if (params) {
    const paramLines = [`**\u73AF\u5883:** ${params.environment}`, `**\u670D\u52A1:** ${params.services}`];
    if (params.version)
      paramLines.push(`**\u7248\u672C:** ${params.version}`);
    if (params.branch)
      paramLines.push(`**\u5206\u652F:** ${params.branch}`);
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: paramLines.join("\n")
      }
    });
  }
  return {
    config: { update_multi: true },
    header: {
      title: { tag: "plain_text", content: success ? "\u2705 \u90E8\u7F72\u89E6\u53D1\u6210\u529F" : "\u274C \u90E8\u7F72\u89E6\u53D1\u5931\u8D25" },
      template: success ? "green" : "red"
    },
    elements
  };
}
__name(buildResultCard, "buildResultCard");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-cRkf2V/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-cRkf2V/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
