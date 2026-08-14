window.__ModuleLoader__.load({
  id: "@xmanrui/dsh-dingtalk",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin-src/client/index.js
var index_exports = {};
__export(index_exports, {
  DingtalkSettingsTab: () => DingtalkSettingsTab,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);

// plugin-src/client/api.js
var DINGTALK_RPC_CHANNEL = "/dingtalk";
var DINGTALK_ENDPOINTS = Object.freeze({
  status: "connection.status",
  beginProvisioning: "provision.begin",
  pollProvisioning: "provision.poll",
  cancelProvisioning: "provision.cancel",
  reconnectBot: "bot.reconnect",
  deleteBot: "bot.delete",
  approveSender: "bot.sender.approve",
  revokeSender: "bot.sender.revoke"
});
var ACCOUNT_STATES = /* @__PURE__ */ new Set(["connected", "connecting", "offline", "error"]);
var SNAPSHOT_STATES = /* @__PURE__ */ new Set(["disconnected", "offline", "provisioning", "connected", "degraded"]);
var PROVISION_STATES = /* @__PURE__ */ new Set([
  "starting",
  "pending",
  "scanned",
  "authorizing",
  "creating",
  "connecting",
  "connected",
  "expired",
  "failed",
  "cancelled"
]);
var HEALTH_STATES = /* @__PURE__ */ new Set(["healthy", "checking", "degraded", "offline"]);
var FORBIDDEN_ERROR_FIELDS = /(client[_-]?secret|secret[_-]?ref|device[_-]?code|app[_-]?secret|access[_-]?token|token)/i;
var QR_DATA_URL = /^data:image\/(?:png|webp);base64,[a-z\d+/]+={0,2}$/i;
var MAX_QR_SOURCE_LENGTH = 2 * 1024 * 1024;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function optionalString(value, maxLength = 240) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : void 0;
}
function opaqueId(value) {
  const id = optionalString(value, 128);
  return id && /^[a-z\d_-]+$/i.test(id) ? id : void 0;
}
function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? void 0 : parsed;
  }
  return void 0;
}
function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function safeErrorCode(value, fallback) {
  const code = optionalString(value, 80);
  return code && /^[a-z][a-z\d_.:-]*$/i.test(code) && !FORBIDDEN_ERROR_FIELDS.test(code) ? code : fallback;
}
function sanitizeMessage(value, fallback) {
  const message = optionalString(value, 480) ?? fallback;
  if (FORBIDDEN_ERROR_FIELDS.test(message)) return fallback;
  return message.replace(/([=:]\s*)[^\s,;，。]+/g, "$1\u2022\u2022\u2022\u2022\u2022\u2022").slice(0, 240);
}
function normalizeError(value, fallbackCode, fallbackMessage) {
  if (!isRecord(value)) return void 0;
  return {
    code: safeErrorCode(value.code, fallbackCode),
    message: sanitizeMessage(value.message, fallbackMessage)
  };
}
function unwrapRpcResult(result) {
  if (!isRecord(result) || typeof result.ok !== "boolean") {
    throw new Error("\u9489\u9489\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94");
  }
  if (!result.ok) {
    const error = new Error(sanitizeMessage(result.error?.message, "\u9489\u9489\u64CD\u4F5C\u5931\u8D25"));
    error.code = safeErrorCode(result.error?.code, "DINGTALK_RPC_ERROR");
    throw error;
  }
  return result.value;
}
function safeQrSource(value) {
  if (typeof value !== "string" || value.length > MAX_QR_SOURCE_LENGTH) return void 0;
  return QR_DATA_URL.test(value) ? value : void 0;
}
function normalizeProvisioning(value, now = Date.now()) {
  const source = isRecord(value?.provisioning) ? value.provisioning : value;
  if (!isRecord(source)) throw new Error("\u9489\u9489\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u626B\u7801\u7ED1\u5B9A\u8FDB\u5EA6");
  const attemptId = opaqueId(source.attemptId);
  if (!attemptId) throw new Error("\u9489\u9489\u626B\u7801\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u7684\u7ED1\u5B9A\u4EFB\u52A1");
  const reportedStatus = optionalString(source.status, 32) ?? optionalString(source.state, 32);
  const status = PROVISION_STATES.has(reportedStatus) ? reportedStatus : "failed";
  const expiresAt = timestamp(source.expiresAt) ?? now + clamp(source.expiresIn, 1, 2 * 60 * 60, 10 * 60) * 1e3;
  const result = {
    attemptId,
    status,
    expiresAt,
    pollIntervalMs: clamp(source.pollIntervalMs, 1e3, 1e4, 3e3)
  };
  const qrCodeDataUrl = safeQrSource(source.qrCodeDataUrl);
  if (qrCodeDataUrl) result.qrCodeDataUrl = qrCodeDataUrl;
  if (opaqueId(source.botId)) result.botId = opaqueId(source.botId);
  if (source.alreadyConnected === true) result.alreadyConnected = true;
  const error = normalizeError(
    source.error,
    "DINGTALK_PROVISION_FAILED",
    "\u9489\u9489\u673A\u5668\u4EBA\u6CA1\u6709\u63A5\u5165\u5B8C\u6210"
  );
  if (error) result.error = error;
  return result;
}
function normalizeConversationType(value) {
  if (value === "group" || value === "2") return "group";
  return "direct";
}
function normalizePendingSender(value) {
  if (!isRecord(value)) return void 0;
  const requestId = opaqueId(value.requestId);
  if (!requestId) return void 0;
  return {
    requestId,
    displayName: optionalString(value.displayName, 80) ?? "\u5F85\u6279\u51C6\u4F7F\u7528\u8005",
    senderIdMasked: optionalString(value.senderIdMasked, 120) ?? "\u8EAB\u4EFD\u5DF2\u9690\u85CF",
    conversationType: normalizeConversationType(value.conversationType),
    requestedAt: timestamp(value.requestedAt)
  };
}
function normalizeApprovedSender(value) {
  if (!isRecord(value)) return void 0;
  const senderKey = opaqueId(value.senderKey);
  if (!senderKey) return void 0;
  return {
    senderKey,
    displayName: optionalString(value.displayName, 80) ?? "\u5DF2\u6279\u51C6\u4F7F\u7528\u8005",
    senderIdMasked: optionalString(value.senderIdMasked, 120) ?? "\u8EAB\u4EFD\u5DF2\u9690\u85CF",
    approvedAt: timestamp(value.approvedAt)
  };
}
function uniqueBy(items, key) {
  const seen = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    if (!item || seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}
function normalizeSenders(value) {
  const source = isRecord(value) ? value : {};
  return {
    pending: uniqueBy(
      (Array.isArray(source.pending) ? source.pending : []).map(normalizePendingSender),
      "requestId"
    ),
    approved: uniqueBy(
      (Array.isArray(source.approved) ? source.approved : []).map(normalizeApprovedSender),
      "senderKey"
    )
  };
}
function normalizeBot(value) {
  if (!isRecord(value)) return void 0;
  const botId = opaqueId(value.botId);
  if (!botId) return void 0;
  const bot = isRecord(value.bot) ? value.bot : {};
  const connected = value.connected === true;
  const reportedState = ACCOUNT_STATES.has(value.state) ? value.state : "offline";
  const state = connected ? "connected" : reportedState === "connected" ? "connecting" : reportedState;
  const health = isRecord(value.health) ? value.health : {};
  const stats = isRecord(value.stats) ? value.stats : {};
  const senderSource = value.senders ?? value.senderPolicy ?? value.access;
  return {
    botId,
    state,
    connected,
    configured: value.configured !== false,
    bot: {
      name: optionalString(bot.name, 100) ?? "\u9489\u9489\u673A\u5668\u4EBA",
      clientIdMasked: optionalString(bot.clientIdMasked, 140) ?? "\u5DF2\u5B89\u5168\u4FDD\u5B58"
    },
    health: {
      status: HEALTH_STATES.has(health.status) ? health.status : connected ? "healthy" : "offline",
      summary: optionalString(health.summary, 200) ?? (connected ? "\u9489\u9489 Stream \u957F\u8FDE\u63A5\u8FD0\u884C\u6B63\u5E38" : "\u9489\u9489\u8FDE\u63A5\u5C1A\u672A\u5C31\u7EEA"),
      lastCheckedAt: timestamp(health.lastCheckedAt),
      lastConnectedAt: timestamp(health.lastConnectedAt)
    },
    stats: {
      messagesReceived: nonNegativeInteger(stats.messagesReceived),
      messagesReplied: nonNegativeInteger(stats.messagesReplied)
    },
    senders: normalizeSenders(senderSource),
    error: normalizeError(value.error, "DINGTALK_ACCOUNT_ERROR", "\u9489\u9489\u8FDE\u63A5\u5C1A\u672A\u5C31\u7EEA") ?? null
  };
}
function normalizeSnapshot(value) {
  const source = isRecord(value?.snapshot) ? value.snapshot : value;
  if (!isRecord(source) || !Array.isArray(source.bots)) {
    throw new Error("\u9489\u9489\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u7684\u673A\u5668\u4EBA\u5217\u8868");
  }
  const seen = /* @__PURE__ */ new Set();
  const bots = source.bots.map(normalizeBot).filter((bot) => {
    if (!bot || seen.has(bot.botId)) return false;
    seen.add(bot.botId);
    return true;
  });
  return {
    schemaVersion: Number.isSafeInteger(source.schemaVersion) ? source.schemaVersion : 1,
    revision: nonNegativeInteger(source.revision),
    state: SNAPSHOT_STATES.has(source.state) ? source.state : "offline",
    bots,
    totals: {
      configured: bots.length,
      connected: bots.filter((bot) => bot.connected).length,
      pendingApproval: bots.reduce((total, bot) => total + bot.senders.pending.length, 0)
    },
    provisioning: source.provisioning ? normalizeProvisioning(source.provisioning) : null
  };
}
function presentError(error) {
  return {
    code: safeErrorCode(error?.code, "DINGTALK_ERROR"),
    message: sanitizeMessage(error?.message, "\u9489\u9489\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5")
  };
}
function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(Number(milliseconds) / 1e3) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// plugin-src/client/styles.js
var DINGTALK_STYLE_ID = "xmanrui-dsh-dingtalk-settings";
var CSS = String.raw`
.ddt-page {
  --ddt-accent: #1677ff;
  --ddt-accent-deep: #0958d9;
  --ddt-accent-wash: #eaf3ff;
  --ddt-success: var(--dsw-alias-state-success-primary, #20a162);
  --ddt-warning: var(--dsw-alias-state-warning-primary, #d97706);
  --ddt-error: var(--dsw-alias-state-error-primary, #d54941);
  width: 100%;
  max-width: 880px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 2px 0 28px;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-sizing: border-box;
}
.ddt-page *, .ddt-page *::before, .ddt-page *::after { box-sizing: border-box; }
.ddt-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.ddt-headingCopy { min-width: 0; }
.ddt-heading h2, .ddt-heading p, .ddt-card h3, .ddt-card h4, .ddt-card p { margin: 0; }
.ddt-eyebrow { margin-bottom: 3px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.ddt-heading h2 { font-size: 20px; line-height: 28px; font-weight: 680; }
.ddt-heading p { margin-top: 5px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 20px; white-space: nowrap; }
.ddt-tools, .ddt-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.ddt-tools { justify-content: flex-end; }
.ddt-badge { min-height: 30px; display: inline-flex; align-items: center; gap: 7px; padding: 0 11px; border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-fill-secondary, #f2f3f5); font-size: 12px; white-space: nowrap; }
.ddt-badge[data-tone="attention"] { color: #ad6800; background: #fff7e6; }
.ddt-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #aeb3bb; }
.ddt-dot[data-tone="success"] { background: var(--ddt-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ddt-success) 14%, transparent); }
.ddt-dot[data-tone="warning"] { background: var(--ddt-warning); }
.ddt-dot[data-tone="error"] { background: var(--ddt-error); }
.ddt-button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 1px solid var(--dsw-alias-line-border, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-body, #fff); font: inherit; font-size: 13px; font-weight: 560; text-decoration: none; cursor: pointer; transition: border-color .15s ease, background .15s ease, transform .15s ease; }
.ddt-button:hover:not(:disabled) { border-color: #aeb3bb; background: var(--dsw-alias-fill-tertiary, #f7f8fa); }
.ddt-button:active:not(:disabled) { transform: translateY(1px); }
.ddt-button:focus-visible { outline: 2px solid color-mix(in srgb, var(--ddt-accent) 70%, white); outline-offset: 2px; }
.ddt-button:disabled { cursor: not-allowed; opacity: .55; }
.ddt-button[data-kind="primary"] { color: #fff; border-color: var(--ddt-accent); background: var(--ddt-accent); }
.ddt-button[data-kind="primary"]:hover:not(:disabled) { border-color: var(--ddt-accent-deep); background: var(--ddt-accent-deep); }
.ddt-button[data-kind="danger"] { color: var(--ddt-error); }
.ddt-button[data-kind="quiet"] { min-height: 30px; padding: 0 10px; border-color: transparent; background: transparent; }
.ddt-card { overflow: hidden; border: 1px solid var(--dsw-alias-line-border, #e5e6eb); border-radius: 14px; background: var(--dsw-alias-bg-body, #fff); box-shadow: 0 1px 2px rgb(31 35 41 / 3%); }
.ddt-cardBody { padding: 24px; }
.ddt-empty { min-height: 230px; display: grid; grid-template-columns: minmax(0, 1fr) 180px; align-items: center; gap: 30px; }
.ddt-empty h3 { margin: 8px 0; font-size: 18px; }
.ddt-empty p { max-width: 560px; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.ddt-empty .ddt-actions { margin-top: 20px; }
.ddt-brandMark { width: 110px; height: 110px; display: grid; place-items: center; justify-self: center; border-radius: 28px; color: #fff; background: linear-gradient(145deg, #2997ff, var(--ddt-accent)); box-shadow: 0 18px 45px rgb(22 119 255 / 23%); }
.ddt-brandMark svg { filter: drop-shadow(0 3px 8px rgb(0 35 96 / 16%)); }
.ddt-qrLayout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 34px; align-items: center; }
.ddt-qrColumn { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.ddt-qrFrame { position: relative; width: 270px; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; padding: 10px; border: 1px solid var(--dsw-alias-line-border, #e5e6eb); border-radius: 16px; background: #fff; }
.ddt-qrFrame::before { content: ''; position: absolute; inset: 6px; border: 1px solid rgb(22 119 255 / 10%); border-radius: 11px; pointer-events: none; }
.ddt-qrFrame img { display: block; width: 100%; height: 100%; object-fit: contain; }
.ddt-qrFallback { padding: 24px; color: #646a73; text-align: center; }
.ddt-expired { position: absolute; inset: 0; display: grid; place-items: center; padding: 30px; color: #fff; text-align: center; font-weight: 650; white-space: pre-line; background: rgb(31 35 41 / 76%); backdrop-filter: blur(3px); }
.ddt-countdown { width: 270px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
.ddt-countdownTop { display: flex; justify-content: space-between; margin-bottom: 6px; }
.ddt-countdown strong { color: var(--dsw-alias-label-primary, #1f2329); font-variant-numeric: tabular-nums; }
.ddt-progress { height: 4px; overflow: hidden; border-radius: 99px; background: #eef0f3; }
.ddt-progress span { display: block; width: var(--ddt-progress); height: 100%; background: var(--ddt-accent); transition: width .2s linear; }
.ddt-stateLabel { display: inline-flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; font-weight: 600; }
.ddt-qrCopy h3 { margin: 9px 0 8px; font-size: 18px; }
.ddt-qrCopy > p { color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.ddt-steps { margin: 18px 0 16px; padding: 0; list-style: none; counter-reset: ddt-step; }
.ddt-steps li { position: relative; min-height: 28px; padding: 3px 0 3px 36px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 22px; counter-increment: ddt-step; }
.ddt-steps li::before { content: counter(ddt-step); position: absolute; left: 0; top: 1px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: var(--ddt-accent-deep); background: var(--ddt-accent-wash); font-size: 12px; font-weight: 700; }
.ddt-brandNotice { margin: 0 0 18px; padding: 10px 12px; border-left: 3px solid #91caff; border-radius: 0 8px 8px 0; color: var(--dsw-alias-label-secondary, #646a73); background: #f5f9ff; font-size: 12px; line-height: 1.55; }
.ddt-loading { padding: 38px; color: var(--dsw-alias-label-secondary, #646a73); text-align: center; }
.ddt-loading h3 { margin: 0 0 7px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 17px; }
.ddt-loading p { line-height: 1.6; }
.ddt-spinner { width: 24px; height: 24px; margin: 0 auto 13px; border: 3px solid #e6e8eb; border-top-color: var(--ddt-accent); border-radius: 50%; animation: ddt-spin .8s linear infinite; }
.ddt-statusNotice, .ddt-inlineError { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--ddt-error) 28%, transparent); border-radius: 10px; color: var(--ddt-error); background: color-mix(in srgb, var(--ddt-error) 7%, transparent); font-size: 13px; }
.ddt-inlineError { flex-direction: column; padding: 22px; }
.ddt-inlineError h3 { font-size: 17px; }
.ddt-inlineError p { line-height: 1.55; }
.ddt-errorCode { font: 11px ui-monospace, SFMono-Regular, monospace; opacity: .8; }
.ddt-listHeading { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 9px; }
.ddt-listHeading h3 { margin: 0; font-size: 14px; }
.ddt-listHeading span { color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; }
.ddt-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.ddt-accountTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ddt-accountIdentity { min-width: 0; display: flex; align-items: center; gap: 12px; }
.ddt-avatar { width: 42px; height: 42px; display: grid; place-items: center; flex: none; border-radius: 12px; color: #fff; background: linear-gradient(145deg, #2997ff, var(--ddt-accent)); }
.ddt-accountIdentity h3 { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.ddt-accountIdentity p { margin-top: 4px; color: var(--dsw-alias-label-secondary, #646a73); font: 12px ui-monospace, SFMono-Regular, monospace; }
.ddt-health { display: inline-flex; align-items: center; gap: 7px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; white-space: nowrap; }
.ddt-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
.ddt-metric { padding: 12px 14px; border-radius: 9px; background: var(--dsw-alias-fill-tertiary, #f7f8fa); }
.ddt-metric dt { color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; }
.ddt-metric dd { overflow: hidden; margin: 5px 0 0; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.ddt-access { margin-top: 18px; padding: 15px 16px; border: 1px solid var(--dsw-alias-line-divider, #eef0f3); border-radius: 11px; background: color-mix(in srgb, var(--ddt-accent-wash) 35%, var(--dsw-alias-bg-body, #fff)); }
.ddt-accessHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ddt-accessHeader h4 { font-size: 13px; }
.ddt-accessHeader p { margin-top: 4px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 1.5; }
.ddt-accessCount { flex: none; padding: 3px 8px; border-radius: 99px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-fill-secondary, #f2f3f5); font-size: 11px; }
.ddt-accessCount[data-pending="true"] { color: #ad6800; background: #fff1d6; }
.ddt-senderList { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.ddt-sender { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-body, #fff); }
.ddt-senderIdentity { min-width: 0; }
.ddt-senderIdentity strong { display: block; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.ddt-senderIdentity span { display: block; overflow: hidden; margin-top: 3px; color: var(--dsw-alias-label-tertiary, #8f959e); font: 10px ui-monospace, SFMono-Regular, monospace; text-overflow: ellipsis; white-space: nowrap; }
.ddt-approvedLabel { margin-top: 13px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; font-weight: 600; }
.ddt-noSenders { margin-top: 11px !important; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; }
.ddt-accountFooter { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-line-divider, #eef0f3); }
.ddt-summary { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
.ddt-confirm { padding: 18px 24px; border-top: 1px solid color-mix(in srgb, var(--ddt-error) 25%, transparent); background: color-mix(in srgb, var(--ddt-error) 5%, transparent); }
.ddt-confirm strong { display: block; margin-bottom: 6px; font-size: 14px; }
.ddt-confirm p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 1.55; }
.ddt-confirm .ddt-actions { margin-top: 13px; }
.ddt-visuallyHidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes ddt-spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) {
  .ddt-heading, .ddt-accountTop, .ddt-accountFooter { flex-direction: column; align-items: stretch; }
  .ddt-heading p { white-space: normal; }
  .ddt-tools { justify-content: flex-start; }
  .ddt-empty { grid-template-columns: minmax(0, 1fr); }
  .ddt-brandMark { display: none; }
  .ddt-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .ddt-qrCopy { width: 100%; }
  .ddt-metrics { grid-template-columns: minmax(0, 1fr); }
  .ddt-cardBody { padding: 20px; }
  .ddt-sender { align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .ddt-page *, .ddt-page *::before, .ddt-page *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
function installDingtalkStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.querySelector(`style[data-plugin-css="${DINGTALK_STYLE_ID}"]`);
  if (existing) return () => {
  };
  const style = document.createElement("style");
  style.dataset.plugin = "@xmanrui/dsh-dingtalk";
  style.dataset.pluginCss = DINGTALK_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}

// plugin-src/client/index.js
var h = React.createElement;
var ACTIVE_PROVISION_STATES = /* @__PURE__ */ new Set(["pending", "scanned", "authorizing", "creating", "connecting"]);
var name = "dingtalk-settings";
var inject = ["slots", "connection"];
function DingtalkIcon({ size = 28 }) {
  return h("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true",
    focusable: "false"
  }, h("path", {
    fill: "currentColor",
    d: "M37.05 22.783c-6.758-5.216-14.378-12.128-22.73-19.538-.655-.585-1.242-.354-1.536.42-1.88 4.973-.058 9.386 2.889 11.932s7.368 4.912 10.058 6.155c.105.049.013.203-.093.163-4.953-2.182-8.397-3.765-13.07-7.368-.497-.388-1.01-.242-1.07.521-.384 4.748 2.657 8.483 6.058 9.745 2.1.781 4.398 1.212 6.53 1.474.109.015.084.178-.027.178-2.747.01-6.058-.654-8.935-1.751-.606-.233-.818.25-.722.633.491 2.008 2.974 5.076 6.926 5.73a12 12 0 0 0 2.228.115c.164 0 .208.089.154.217q-2.685 4.6-2.803 4.797c-.091.152-.036.275.156.275h3.543c.164 0 .264.106.18.246l-4.958 8.196c-.191.328.035.565.395.301s15.212-11.133 15.636-11.448c.195-.142.148-.327-.124-.327h-3.18c-.206 0-.252-.14-.111-.28.14-.141 3.602-3.594 4.837-4.888 1.283-1.35 1.938-3.825-.231-5.498"
  }));
}
var Button = React.forwardRef(function Button2({ children, kind = "secondary", className = "", ...props }, ref) {
  return h("button", {
    ...props,
    ref,
    type: "button",
    className: `ddt-button ${className}`.trim(),
    "data-kind": kind
  }, children);
});
function Heading({ totals, adding, busy, onAdd, addButtonRef }) {
  return h(
    "div",
    { className: "ddt-heading" },
    h(
      "div",
      { className: "ddt-headingCopy" },
      h("div", { className: "ddt-eyebrow" }, "Channel"),
      h("h2", null, "\u9489\u9489\u673A\u5668\u4EBA"),
      h("p", null, "\u901A\u8FC7\u626B\u7801\u628A\u9489\u9489\u673A\u5668\u4EBA\u63A5\u5165 DeepSeek Harness")
    ),
    h(
      "div",
      { className: "ddt-tools" },
      totals.configured > 0 ? h(
        "div",
        { className: "ddt-badge" },
        h("span", {
          className: "ddt-dot",
          "data-tone": totals.connected > 0 ? "success" : "warning"
        }),
        h("span", null, `${totals.connected} / ${totals.configured} \u5728\u7EBF`)
      ) : null,
      totals.pendingApproval > 0 ? h(
        "div",
        { className: "ddt-badge", "data-tone": "attention" },
        `${totals.pendingApproval} \u4E2A\u5F85\u6279\u51C6`
      ) : null,
      h("div", {
        className: "ddt-badge",
        title: "\u5E94\u7528\u5BC6\u94A5\u53EA\u5199\u5165 Harness Host \u51ED\u636E\u670D\u52A1\uFF0C\u4E0D\u4F1A\u53D1\u9001\u5230\u6D4F\u89C8\u5668"
      }, "\u51ED\u636E\u4EC5\u4FDD\u5B58\u5728\u672C\u673A"),
      h(Button, {
        kind: "primary",
        onClick: onAdd,
        disabled: adding || busy,
        ref: addButtonRef
      }, adding ? "\u6B63\u5728\u63A5\u5165" : "\u626B\u7801\u63A5\u5165\u9489\u9489")
    )
  );
}
function LoadingView() {
  return h(
    "div",
    { className: "ddt-card ddt-loading", "aria-busy": "true" },
    h("div", { className: "ddt-spinner" }),
    h("span", null, "\u6B63\u5728\u8BFB\u53D6\u9489\u9489\u8FDE\u63A5\u72B6\u6001\u2026")
  );
}
function EmptyView({ busy, onStart }) {
  return h(
    "div",
    { className: "ddt-card" },
    h(
      "div",
      { className: "ddt-cardBody ddt-empty" },
      h(
        "div",
        null,
        h(
          "div",
          { className: "ddt-stateLabel" },
          h("span", { className: "ddt-dot" }),
          h("span", null, "\u5C1A\u672A\u63A5\u5165\u9489\u9489\u673A\u5668\u4EBA")
        ),
        h("h3", null, "\u626B\u4E00\u6B21\u7801\uFF0C\u81EA\u52A8\u521B\u5EFA\u5E76\u8FDE\u63A5\u673A\u5668\u4EBA"),
        h("p", null, "\u6388\u6743\u7531\u9489\u9489\u5B98\u65B9\u9875\u9762\u5B8C\u6210\u3002\u521B\u5EFA\u6210\u529F\u540E\uFF0C\u5E94\u7528\u51ED\u636E\u4F1A\u76F4\u63A5\u5199\u5165 Harness Host\uFF0C\u672C\u9875\u9762\u53EA\u63A5\u6536\u8131\u654F\u7684\u8FDE\u63A5\u72B6\u6001\u3002"),
        h(
          "div",
          { className: "ddt-actions" },
          h(
            Button,
            { kind: "primary", onClick: onStart, disabled: busy },
            busy ? "\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026" : "\u751F\u6210\u9489\u9489\u4E8C\u7EF4\u7801"
          )
        )
      ),
      h(
        "div",
        { className: "ddt-brandMark", "aria-hidden": "true" },
        h(DingtalkIcon, { size: 68 })
      )
    )
  );
}
function QrPanel({ provision, now, busy, onRefresh, onCancel }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const source = safeQrSource(provision.qrCodeDataUrl);
  const remaining = Math.max(0, provision.expiresAt - now);
  const expired = remaining === 0 || provision.status === "expired";
  const duration = Math.max(1, provision.durationMs ?? 10 * 6e4);
  const progress = Math.round(Math.min(1, remaining / duration) * 100);
  React.useEffect(() => setImageFailed(false), [source]);
  return h(
    "div",
    { className: "ddt-card" },
    h(
      "div",
      { className: "ddt-cardBody ddt-qrLayout" },
      h(
        "div",
        { className: "ddt-qrColumn" },
        h(
          "div",
          { className: "ddt-qrFrame" },
          source && !imageFailed ? h("img", {
            src: source,
            alt: "\u7528\u4E8E\u628A\u9489\u9489\u673A\u5668\u4EBA\u63A5\u5165 DeepSeek Harness \u7684\u4E00\u6B21\u6027\u4E8C\u7EF4\u7801",
            onError: () => setImageFailed(true)
          }) : h("div", { className: "ddt-qrFallback" }, "\u4E8C\u7EF4\u7801\u56FE\u7247\u672A\u5C31\u7EEA\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002"),
          expired ? h("div", { className: "ddt-expired" }, "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\n\u8BF7\u91CD\u65B0\u751F\u6210") : null
        ),
        h(
          "div",
          { className: "ddt-countdown" },
          h(
            "div",
            { className: "ddt-countdownTop" },
            h("span", null, "\u4E8C\u7EF4\u7801\u6709\u6548\u65F6\u95F4"),
            h("strong", null, formatRemaining(remaining))
          ),
          h(
            "div",
            { className: "ddt-progress", "aria-hidden": "true" },
            h("span", { style: { "--ddt-progress": `${progress}%` } })
          )
        )
      ),
      h(
        "div",
        { className: "ddt-qrCopy" },
        h(
          "div",
          { className: "ddt-stateLabel" },
          h("span", { className: "ddt-dot", "data-tone": expired ? "error" : "warning" }),
          h("span", null, expired ? "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548" : "\u7B49\u5F85\u9489\u9489\u626B\u7801\u6388\u6743")
        ),
        h("h3", null, expired ? "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801\u540E\u7EE7\u7EED" : "\u4F7F\u7528\u9489\u9489 App \u5B8C\u6210\u673A\u5668\u4EBA\u6388\u6743"),
        h("p", null, "\u626B\u7801\u540E\u4E0D\u9700\u8981\u624B\u5DE5\u590D\u5236\u5E94\u7528\u6807\u8BC6\u6216\u5BC6\u94A5\uFF0C\u6388\u6743\u7ED3\u679C\u4F1A\u5B89\u5168\u8FD4\u56DE\u5230\u672C\u673A Host\u3002"),
        h(
          "ol",
          { className: "ddt-steps" },
          h("li", null, "\u6253\u5F00\u9489\u9489 App\uFF0C\u626B\u63CF\u5DE6\u4FA7\u4E8C\u7EF4\u7801"),
          h("li", null, "\u5728\u6388\u6743\u9875\u70B9\u51FB\u201C\u4E00\u952E\u521B\u5EFA\u65B0\u673A\u5668\u4EBA\u201D"),
          h("li", null, "\u4FDD\u6301\u672C\u9875\u6253\u5F00\uFF0C\u7B49\u5F85\u673A\u5668\u4EBA\u81EA\u52A8\u8FDE\u63A5")
        ),
        h(
          "div",
          { className: "ddt-brandNotice" },
          "\u9489\u9489\u5B98\u65B9\u6388\u6743\u9875\u76EE\u524D\u53EF\u80FD\u663E\u793A OpenClaw \u54C1\u724C\uFF0C\u8FD9\u662F\u5B98\u65B9\u8FDE\u63A5\u5668\u6388\u6743\u9875\u9762\uFF0C\u4E0D\u5F71\u54CD\u673A\u5668\u4EBA\u63A5\u5165 DeepSeek Harness\u3002"
        ),
        h(
          "div",
          { className: "ddt-actions" },
          expired ? h(Button, { kind: "primary", onClick: onRefresh, disabled: busy }, "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801") : null,
          !expired ? h(Button, { onClick: onRefresh, disabled: busy }, "\u6362\u4E00\u4E2A\u4E8C\u7EF4\u7801") : null,
          h(Button, { onClick: onCancel, disabled: busy }, "\u53D6\u6D88")
        )
      )
    )
  );
}
function ProgressPanel({ status, busy, onCancel }) {
  const connecting = status === "connecting";
  const creating = status === "creating";
  return h(
    "div",
    { className: "ddt-card ddt-loading", "aria-busy": "true" },
    h("div", { className: "ddt-spinner" }),
    h("h3", null, connecting ? "\u673A\u5668\u4EBA\u5DF2\u521B\u5EFA\uFF0C\u6B63\u5728\u5EFA\u7ACB\u6D88\u606F\u8FDE\u63A5" : creating ? "\u6388\u6743\u5DF2\u786E\u8BA4\uFF0C\u6B63\u5728\u521B\u5EFA\u9489\u9489\u673A\u5668\u4EBA" : "\u6B63\u5728\u786E\u8BA4\u9489\u9489\u6388\u6743"),
    h("p", null, connecting ? "\u6B63\u5728\u68C0\u67E5\u9489\u9489 Stream \u957F\u8FDE\u63A5\uFF0C\u6210\u529F\u540E\u4F1A\u81EA\u52A8\u663E\u793A\u4E3A\u5728\u7EBF\u3002" : "\u8BF7\u52FF\u5173\u95ED\u672C\u9875\uFF0C\u9489\u9489\u5B8C\u6210\u6388\u6743\u540E\u5C06\u81EA\u52A8\u7EE7\u7EED\u3002"),
    h(
      "div",
      { className: "ddt-actions", style: { justifyContent: "center", marginTop: 14 } },
      h(Button, { onClick: onCancel, disabled: busy }, "\u53D6\u6D88\u63A5\u5165")
    )
  );
}
function ProvisionError({ provision, busy, onRetry, onClose }) {
  const error = provision.error ?? {
    code: "DINGTALK_PROVISION_FAILED",
    message: "\u9489\u9489\u673A\u5668\u4EBA\u6CA1\u6709\u63A5\u5165\u5B8C\u6210"
  };
  return h(
    "div",
    { className: "ddt-card" },
    h(
      "div",
      { className: "ddt-inlineError", role: "alert" },
      h("h3", null, provision.status === "expired" ? "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F" : "\u9489\u9489\u673A\u5668\u4EBA\u6CA1\u6709\u63A5\u5165\u5B8C\u6210"),
      h("p", null, error.message),
      h("span", { className: "ddt-errorCode" }, error.code),
      h(
        "div",
        { className: "ddt-actions" },
        h(Button, { kind: "primary", onClick: onRetry, disabled: busy }, "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801"),
        h(Button, { onClick: onClose, disabled: busy }, "\u5173\u95ED")
      )
    )
  );
}
function checkedTime(value) {
  if (!value) return "\u5C1A\u672A\u68C0\u67E5";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  } catch {
    return "\u521A\u521A";
  }
}
function SenderAccess({ account, busy, onApprove, onRevoke }) {
  const pending = account.senders.pending;
  const approved = account.senders.approved;
  return h(
    "section",
    { className: "ddt-access", "aria-label": `${account.bot.name}\u4F7F\u7528\u8005\u6743\u9650` },
    h(
      "div",
      { className: "ddt-accessHeader" },
      h(
        "div",
        null,
        h("h4", null, "\u5141\u8BB8\u4F7F\u7528\u673A\u5668\u4EBA\u7684\u9489\u9489\u8D26\u53F7"),
        h("p", null, "\u65B0\u4F7F\u7528\u8005\u9996\u6B21\u53D1\u6D88\u606F\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u987B\u5728\u672C\u673A\u660E\u786E\u6279\u51C6\u3002")
      ),
      h("span", {
        className: "ddt-accessCount",
        "data-pending": pending.length > 0 ? "true" : void 0
      }, pending.length > 0 ? `${pending.length} \u4E2A\u5F85\u6279\u51C6` : `${approved.length} \u4E2A\u5DF2\u6279\u51C6`)
    ),
    pending.length > 0 ? h("ul", { className: "ddt-senderList" }, pending.map((sender) => h(
      "li",
      {
        className: "ddt-sender",
        key: sender.requestId
      },
      h(
        "div",
        { className: "ddt-senderIdentity" },
        h("strong", null, sender.displayName),
        h("span", null, `${sender.senderIdMasked} \xB7 ${sender.conversationType === "group" ? "\u7FA4\u804A" : "\u5355\u804A"}`)
      ),
      h(Button, {
        kind: "primary",
        onClick: () => onApprove(sender),
        disabled: Boolean(busy)
      }, busy === `approve:${sender.requestId}` ? "\u6279\u51C6\u4E2D\u2026" : "\u6279\u51C6\u4F7F\u7528")
    ))) : null,
    approved.length > 0 ? h(
      React.Fragment,
      null,
      h("div", { className: "ddt-approvedLabel" }, "\u5DF2\u6279\u51C6"),
      h("ul", { className: "ddt-senderList" }, approved.map((sender) => h(
        "li",
        {
          className: "ddt-sender",
          key: sender.senderKey
        },
        h(
          "div",
          { className: "ddt-senderIdentity" },
          h("strong", null, sender.displayName),
          h("span", null, sender.senderIdMasked)
        ),
        h(Button, {
          kind: "quiet",
          onClick: () => onRevoke(sender),
          disabled: Boolean(busy)
        }, busy === `revoke:${sender.senderKey}` ? "\u64A4\u9500\u4E2D\u2026" : "\u64A4\u9500")
      )))
    ) : null,
    pending.length === 0 && approved.length === 0 ? h("p", { className: "ddt-noSenders" }, "\u5C1A\u65E0\u4F7F\u7528\u8BF7\u6C42\u3002\u673A\u5668\u4EBA\u6536\u5230\u7B2C\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u53EF\u5728\u6B64\u6279\u51C6\u53D1\u9001\u8005\u3002") : null
  );
}
function RemoveConfirmation({ account, busy, onConfirm, onCancel }) {
  const cancelRef = React.useRef(null);
  React.useEffect(() => cancelRef.current?.focus(), []);
  return h(
    "div",
    {
      className: "ddt-confirm",
      role: "alertdialog",
      "aria-label": `\u79FB\u9664${account.bot.name}`,
      onKeyDown: (event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }
    },
    h("strong", null, `\u4ECE DeepSeek Harness \u79FB\u9664\u201C${account.bot.name}\u201D\uFF1F`),
    h("p", null, "\u8FD9\u4F1A\u505C\u6B62\u6D88\u606F\u8FDE\u63A5\uFF0C\u5E76\u5220\u9664\u672C\u673A\u4FDD\u5B58\u7684\u5E94\u7528\u51ED\u636E\u3001\u673A\u5668\u4EBA\u914D\u7F6E\u3001\u4F1A\u8BDD\u6620\u5C04\u53CA\u4F7F\u7528\u8005\u6279\u51C6\u8BB0\u5F55\u3002\u9489\u9489\u5F00\u653E\u5E73\u53F0\u4E2D\u7684\u673A\u5668\u4EBA\u4E0D\u4F1A\u88AB\u81EA\u52A8\u5220\u9664\u3002"),
    h(
      "div",
      { className: "ddt-actions" },
      h(Button, { ref: cancelRef, onClick: onCancel, disabled: busy }, "\u4FDD\u7559\u673A\u5668\u4EBA"),
      h(
        Button,
        { kind: "danger", onClick: onConfirm, disabled: busy },
        busy ? "\u6B63\u5728\u79FB\u9664\u2026" : "\u786E\u8BA4\u79FB\u9664\u63A5\u5165"
      )
    )
  );
}
function AccountCard({
  account,
  busy,
  removing,
  onReconnect,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
  onApprove,
  onRevoke
}) {
  const state = busy === "reconnect" ? "connecting" : account.state;
  const tone = account.connected ? "success" : state === "error" ? "error" : "warning";
  const stateLabel = account.connected ? "\u8FD0\u884C\u6B63\u5E38" : state === "connecting" ? "\u6B63\u5728\u8FDE\u63A5" : "\u8FDE\u63A5\u672A\u5C31\u7EEA";
  return h(
    "article",
    { className: "ddt-card", tabIndex: -1, "data-bot-id": account.botId },
    h(
      "div",
      { className: "ddt-cardBody" },
      h(
        "div",
        { className: "ddt-accountTop" },
        h(
          "div",
          { className: "ddt-accountIdentity" },
          h("div", { className: "ddt-avatar", "aria-hidden": "true" }, h(DingtalkIcon, { size: 29 })),
          h(
            "div",
            null,
            h("h3", { title: account.bot.name }, account.bot.name),
            h("p", { title: account.bot.clientIdMasked }, account.bot.clientIdMasked)
          )
        ),
        h(
          "div",
          { className: "ddt-health" },
          h("span", { className: "ddt-dot", "data-tone": tone }),
          h("span", null, stateLabel)
        )
      ),
      h(
        "dl",
        { className: "ddt-metrics" },
        h(
          "div",
          { className: "ddt-metric" },
          h("dt", null, "\u6D88\u606F\u901A\u9053"),
          h("dd", null, account.connected ? "Stream \u957F\u8FDE\u63A5" : "\u79BB\u7EBF")
        ),
        h(
          "div",
          { className: "ddt-metric" },
          h("dt", null, "\u6536\u5230 / \u56DE\u590D"),
          h("dd", null, `${account.stats.messagesReceived} / ${account.stats.messagesReplied}`)
        ),
        h(
          "div",
          { className: "ddt-metric" },
          h("dt", null, "\u6700\u8FD1\u68C0\u67E5"),
          h("dd", null, checkedTime(account.health.lastCheckedAt))
        )
      ),
      h(SenderAccess, { account, busy, onApprove, onRevoke }),
      h(
        "div",
        { className: "ddt-accountFooter" },
        h("div", { className: "ddt-summary" }, account.error?.message ?? account.health.summary),
        h(
          "div",
          { className: "ddt-actions" },
          h(
            Button,
            { onClick: onReconnect, disabled: Boolean(busy) },
            busy === "reconnect" ? "\u68C0\u67E5\u4E2D\u2026" : account.connected ? "\u68C0\u67E5\u8FDE\u63A5" : "\u91CD\u8BD5\u8FDE\u63A5"
          ),
          h(
            Button,
            { kind: "danger", onClick: onRequestRemove, disabled: Boolean(busy) },
            "\u79FB\u9664\u63A5\u5165"
          )
        )
      )
    ),
    removing ? h(RemoveConfirmation, {
      account,
      busy: busy === "delete",
      onConfirm: onConfirmRemove,
      onCancel: onCancelRemove
    }) : null
  );
}
function AccountList(props) {
  return h(
    "section",
    null,
    h(
      "div",
      { className: "ddt-listHeading" },
      h("h3", null, "\u5DF2\u63A5\u5165\u7684\u9489\u9489\u673A\u5668\u4EBA"),
      h("span", null, `${props.bots.length} \u4E2A`)
    ),
    h("ul", { className: "ddt-list" }, props.bots.map((account) => h(
      "li",
      { key: account.botId },
      h(AccountCard, {
        account,
        busy: props.busyByBot[account.botId],
        removing: props.removeTarget === account.botId,
        onReconnect: () => props.onReconnect(account),
        onRequestRemove: () => props.onRequestRemove(account),
        onConfirmRemove: () => props.onConfirmRemove(account),
        onCancelRemove: props.onCancelRemove,
        onApprove: (sender) => props.onApprove(account, sender),
        onRevoke: (sender) => props.onRevoke(account, sender)
      })
    )))
  );
}
var EMPTY_TOTALS = Object.freeze({ configured: 0, connected: 0, pendingApproval: 0 });
function DingtalkSettingsTab({ rpcCall }) {
  const [model, setModel] = React.useState({
    phase: "loading",
    bots: [],
    totals: EMPTY_TOTALS,
    revision: 0,
    error: null
  });
  const [provision, setProvision] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [busyByBot, setBusyByBot] = React.useState({});
  const [removeTarget, setRemoveTarget] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [now, setNow] = React.useState(() => Date.now());
  const addButtonRef = React.useRef(null);
  React.useEffect(() => installDingtalkStyles(), []);
  const announce = React.useCallback((message) => {
    setNotice("");
    if (message) window.requestAnimationFrame(() => setNotice(message));
  }, []);
  const invoke = React.useCallback(async (endpoint, payload = {}, signal) => {
    if (typeof rpcCall !== "function") throw new TypeError("\u9489\u9489\u8BBE\u7F6E\u9875\u7F3A\u5C11 RPC \u8FDE\u63A5");
    return unwrapRpcResult(await rpcCall(endpoint, payload, signal));
  }, [rpcCall]);
  const loadStatus = React.useCallback(async ({ signal, silent = false } = {}) => {
    if (!silent) setModel((current) => ({ ...current, phase: "loading", error: null }));
    try {
      const snapshot = normalizeSnapshot(await invoke(DINGTALK_ENDPOINTS.status, {}, signal));
      setModel({
        phase: "ready",
        bots: snapshot.bots,
        totals: snapshot.totals,
        revision: snapshot.revision,
        error: null
      });
      if (snapshot.provisioning) {
        setProvision((current) => !current || current.attemptId === snapshot.provisioning.attemptId ? {
          ...current,
          ...snapshot.provisioning,
          durationMs: current?.durationMs ?? Math.max(1, snapshot.provisioning.expiresAt - Date.now())
        } : current);
      }
      return snapshot;
    } catch (error) {
      if (error?.name === "AbortError") return void 0;
      setModel((current) => ({
        ...current,
        phase: silent && current.phase === "ready" ? "ready" : "error",
        error: presentError(error)
      }));
      return void 0;
    }
  }, [invoke]);
  React.useEffect(() => {
    const controller = new AbortController();
    void loadStatus({ signal: controller.signal });
    return () => controller.abort();
  }, [loadStatus]);
  React.useEffect(() => {
    if (model.phase !== "ready") return void 0;
    const controller = new AbortController();
    let running = false;
    const timer = window.setInterval(async () => {
      if (running) return;
      running = true;
      await loadStatus({ signal: controller.signal, silent: true });
      running = false;
    }, 15e3);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadStatus, model.phase]);
  React.useEffect(() => {
    if (!provision || !ACTIVE_PROVISION_STATES.has(provision.status)) return void 0;
    const timer = window.setInterval(() => setNow(Date.now()), 1e3);
    return () => window.clearInterval(timer);
  }, [provision?.attemptId, provision?.status]);
  const startProvisioning = React.useCallback(async ({ replace = false } = {}) => {
    setBusy(true);
    try {
      if (replace && provision?.attemptId) {
        await invoke(DINGTALK_ENDPOINTS.cancelProvisioning, {
          attemptId: provision.attemptId
        });
      }
      setProvision({ status: "starting" });
      const started = normalizeProvisioning(await invoke(
        DINGTALK_ENDPOINTS.beginProvisioning,
        { locale: "zh-CN" }
      ));
      if (!started.qrCodeDataUrl) {
        throw new Error("\u9489\u9489\u626B\u7801\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u5B89\u5168\u7684\u4E8C\u7EF4\u7801");
      }
      setNow(Date.now());
      setProvision({
        ...started,
        durationMs: Math.max(1, started.expiresAt - Date.now())
      });
      announce("\u9489\u9489\u4E8C\u7EF4\u7801\u5DF2\u751F\u6210\uFF0C\u8BF7\u4F7F\u7528\u9489\u9489 App \u626B\u63CF\u3002");
    } catch (error) {
      setProvision({
        attemptId: provision?.attemptId,
        status: "failed",
        error: presentError(error)
      });
    } finally {
      setBusy(false);
    }
  }, [announce, invoke, provision?.attemptId]);
  const cancelProvisioning = React.useCallback(async () => {
    setBusy(true);
    try {
      if (provision?.attemptId && !["failed", "expired", "cancelled"].includes(provision.status)) {
        await invoke(DINGTALK_ENDPOINTS.cancelProvisioning, { attemptId: provision.attemptId });
      }
      setProvision(null);
      announce("\u5DF2\u53D6\u6D88\u9489\u9489\u673A\u5668\u4EBA\u63A5\u5165\u3002");
      window.requestAnimationFrame(() => addButtonRef.current?.focus());
    } catch (error) {
      setProvision((current) => ({ ...current, status: "failed", error: presentError(error) }));
    } finally {
      setBusy(false);
    }
  }, [announce, invoke, provision?.attemptId, provision?.status]);
  React.useEffect(() => {
    const attemptId = provision?.attemptId;
    if (!attemptId || !ACTIVE_PROVISION_STATES.has(provision.status)) return void 0;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const result = normalizeProvisioning(await invoke(
          DINGTALK_ENDPOINTS.pollProvisioning,
          { attemptId },
          controller.signal
        ));
        if (result.status === "connected") {
          const snapshot = await loadStatus({ signal: controller.signal, silent: true });
          const account = result.botId ? snapshot?.bots.find((bot) => bot.botId === result.botId) : snapshot?.bots.find((bot) => bot.connected);
          if (!account?.connected) {
            setProvision((current) => current?.attemptId === attemptId ? { ...current, ...result, status: "connecting" } : current);
            timer = window.setTimeout(poll, result.pollIntervalMs);
            return;
          }
          setProvision(null);
          announce(result.alreadyConnected ? "\u8FD9\u4E2A\u9489\u9489\u673A\u5668\u4EBA\u5DF2\u7ECF\u63A5\u5165\u5E76\u4FDD\u6301\u5728\u7EBF\u3002" : "\u9489\u9489\u673A\u5668\u4EBA\u5DF2\u63A5\u5165\uFF0C\u53EF\u4EE5\u5F00\u59CB\u53D1\u9001\u6D88\u606F\u3002");
          return;
        }
        setProvision((current) => current?.attemptId === attemptId ? { ...current, ...result, durationMs: current.durationMs } : current);
        if (ACTIVE_PROVISION_STATES.has(result.status)) {
          timer = window.setTimeout(poll, result.pollIntervalMs);
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
        setProvision((current) => current?.attemptId === attemptId ? { ...current, status: "failed", error: presentError(error) } : current);
      }
    };
    timer = window.setTimeout(poll, provision.pollIntervalMs ?? 3e3);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [announce, invoke, loadStatus, provision?.attemptId, provision?.pollIntervalMs, provision?.status]);
  const setBotBusy = React.useCallback((botId, operation) => {
    setBusyByBot((current) => {
      const next = { ...current };
      if (operation) next[botId] = operation;
      else delete next[botId];
      return next;
    });
  }, []);
  const runBotAction = React.useCallback(async ({ account, operation, endpoint, payload, success }) => {
    setBotBusy(account.botId, operation);
    try {
      await invoke(endpoint, payload);
      const snapshot = await loadStatus({ silent: true });
      announce(typeof success === "function" ? success(snapshot) : success);
      return snapshot;
    } catch (error) {
      announce(`\u64CD\u4F5C\u5931\u8D25\uFF1A${presentError(error).message}`);
      return void 0;
    } finally {
      setBotBusy(account.botId, null);
    }
  }, [announce, invoke, loadStatus, setBotBusy]);
  const reconnect = React.useCallback((account) => runBotAction({
    account,
    operation: "reconnect",
    endpoint: DINGTALK_ENDPOINTS.reconnectBot,
    payload: { botId: account.botId },
    success: (snapshot) => snapshot?.bots.find((bot) => bot.botId === account.botId)?.connected ? "\u9489\u9489\u8FDE\u63A5\u68C0\u67E5\u5B8C\u6210\u3002" : "\u9489\u9489\u4ECD\u672A\u8FDE\u63A5\uFF0C\u63D2\u4EF6\u4F1A\u7EE7\u7EED\u81EA\u52A8\u91CD\u8BD5\u3002"
  }), [runBotAction]);
  const remove = React.useCallback(async (account) => {
    const snapshot = await runBotAction({
      account,
      operation: "delete",
      endpoint: DINGTALK_ENDPOINTS.deleteBot,
      payload: { botId: account.botId, confirm: true },
      success: "\u9489\u9489\u673A\u5668\u4EBA\u53CA\u672C\u673A\u51ED\u636E\u5DF2\u79FB\u9664\u3002"
    });
    if (snapshot) setRemoveTarget(null);
  }, [runBotAction]);
  const approve = React.useCallback((account, sender) => runBotAction({
    account,
    operation: `approve:${sender.requestId}`,
    endpoint: DINGTALK_ENDPOINTS.approveSender,
    payload: { botId: account.botId, requestId: sender.requestId, confirm: true },
    success: `\u5DF2\u6279\u51C6 ${sender.displayName} \u4F7F\u7528\u8FD9\u4E2A\u673A\u5668\u4EBA\u3002`
  }), [runBotAction]);
  const revoke = React.useCallback((account, sender) => runBotAction({
    account,
    operation: `revoke:${sender.senderKey}`,
    endpoint: DINGTALK_ENDPOINTS.revokeSender,
    payload: { botId: account.botId, senderKey: sender.senderKey, confirm: true },
    success: `\u5DF2\u64A4\u9500 ${sender.displayName} \u7684\u4F7F\u7528\u6743\u9650\u3002`
  }), [runBotAction]);
  let provisionView = null;
  if (provision?.status === "starting") {
    provisionView = h(
      "div",
      { className: "ddt-card ddt-loading", "aria-busy": "true" },
      h("div", { className: "ddt-spinner" }),
      h("span", null, "\u6B63\u5728\u7533\u8BF7\u9489\u9489\u6388\u6743\u4E8C\u7EF4\u7801\u2026")
    );
  } else if (provision?.status === "pending") {
    provisionView = h(QrPanel, {
      provision,
      now,
      busy,
      onRefresh: () => void startProvisioning({ replace: true }),
      onCancel: () => void cancelProvisioning()
    });
  } else if (["scanned", "authorizing", "creating", "connecting"].includes(provision?.status)) {
    provisionView = h(ProgressPanel, {
      status: provision.status,
      busy,
      onCancel: () => void cancelProvisioning()
    });
  } else if (provision && ["failed", "expired", "cancelled"].includes(provision.status)) {
    provisionView = h(ProvisionError, {
      provision,
      busy,
      onRetry: () => void startProvisioning({ replace: Boolean(provision.attemptId) }),
      onClose: () => void cancelProvisioning()
    });
  }
  return h(
    "section",
    { className: "ddt-page", "aria-label": "\u9489\u9489\u8BBE\u7F6E" },
    h(Heading, {
      totals: model.totals,
      adding: Boolean(provision),
      busy,
      onAdd: () => void startProvisioning(),
      addButtonRef
    }),
    h("div", { className: "ddt-visuallyHidden", role: "status", "aria-live": "polite" }, notice),
    model.error && model.phase === "ready" ? h("div", { className: "ddt-statusNotice", role: "alert" }, `\u72B6\u6001\u5237\u65B0\u5931\u8D25\uFF1A${model.error.message}`) : null,
    model.phase === "loading" ? h(LoadingView) : model.phase === "error" ? h(
      "div",
      { className: "ddt-card" },
      h(
        "div",
        { className: "ddt-inlineError", role: "alert" },
        h("h3", null, "\u65E0\u6CD5\u8BFB\u53D6\u9489\u9489\u673A\u5668\u4EBA\u72B6\u6001"),
        h("p", null, model.error?.message ?? "\u8BF7\u7A0D\u540E\u91CD\u8BD5"),
        h(Button, { onClick: () => void loadStatus() }, "\u91CD\u65B0\u8BFB\u53D6")
      )
    ) : h(
      React.Fragment,
      null,
      provisionView,
      model.bots.length === 0 && !provision ? h(EmptyView, { busy, onStart: () => void startProvisioning() }) : null,
      model.bots.length > 0 ? h(AccountList, {
        bots: model.bots,
        busyByBot,
        removeTarget,
        onReconnect: (account) => void reconnect(account),
        onRequestRemove: (account) => setRemoveTarget(account.botId),
        onConfirmRemove: (account) => void remove(account),
        onCancelRemove: () => setRemoveTarget(null),
        onApprove: (account, sender) => void approve(account, sender),
        onRevoke: (account, sender) => void revoke(account, sender)
      }) : null
    )
  );
}
function apply(ctx) {
  ctx.effect(() => installDingtalkStyles(), "dingtalk-settings: install client styles");
  const rpcCall = (endpoint, payload, signal) => ctx.connection.rpc.call(DINGTALK_RPC_CHANNEL, endpoint, payload, signal);
  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
    name: "settings.plugins.tab",
    id: "dingtalk",
    order: 40,
    label: "\u9489\u9489",
    inject: () => ({ rpcCall })
  }, DingtalkSettingsTab));
}

    return module.exports;
  }
});
