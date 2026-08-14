// plugin-src/host/production.mjs
import { unlink as unlink3 } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// src/config-store.mjs
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var EMPTY_DOCUMENT = Object.freeze({ version: 1, bots: Object.freeze([]) });
var STORED_BOT_KEYS = /* @__PURE__ */ new Set(["clientId", "secretRef", "approvedSenders"]);
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function safeBotId(value) {
  const id = cleanString(value);
  return id && /^dt_[a-f0-9]{24}$/.test(id) ? id : null;
}
function safeSecretRef(value) {
  const ref = cleanString(value);
  return ref && /^DSH_DINGTALK_BOT_SECRET_[A-F0-9]{24}$/.test(ref) ? ref : null;
}
function safeSenderKey(value) {
  const key = cleanString(value);
  return key && /^dt_sender_[a-f0-9]{32}$/.test(key) ? key : null;
}
function normalizeApprovedSender(value) {
  const record = typeof value === "string" ? { staffId: value } : value;
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const senderKey = safeSenderKey(record.senderKey);
  const staffId = cleanString(record.staffId);
  if (!senderKey || !staffId) return null;
  return Object.freeze({
    senderKey,
    staffId,
    displayName: cleanString(record.displayName),
    approvedAt: cleanString(record.approvedAt)
  });
}
function normalizeApprovedSenders(value) {
  if (!Array.isArray(value)) return null;
  const senders = value.map(normalizeApprovedSender);
  if (senders.some((sender) => sender === null)) return null;
  const ids = /* @__PURE__ */ new Set();
  const keys = /* @__PURE__ */ new Set();
  for (const sender of senders) {
    if (ids.has(sender.staffId) || keys.has(sender.senderKey)) return null;
    ids.add(sender.staffId);
    keys.add(sender.senderKey);
  }
  return Object.freeze(senders);
}
function deriveDingtalkBotIdentity(clientId) {
  const value = cleanString(clientId);
  if (!value) throw new TypeError("clientId is required");
  const valueDigest = digest(value).slice(0, 24);
  return Object.freeze({
    botId: `dt_${valueDigest}`,
    secretRef: `DSH_DINGTALK_BOT_SECRET_${valueDigest.toUpperCase()}`
  });
}
function deriveDingtalkSenderKey() {
  return `dt_sender_${randomUUID().replaceAll("-", "")}`;
}
function maskDingtalkSenderId(staffId) {
  const value = cleanString(staffId);
  if (!value) return "\u9489\u9489\u7528\u6237";
  return "\u8EAB\u4EFD\u5DF2\u9690\u85CF";
}
function maskDingtalkClientId(clientId) {
  const value = cleanString(clientId);
  if (!value) return "\u9489\u9489\u673A\u5668\u4EBA";
  if (value.length <= 8) return `${value.slice(0, 2)}\u2022\u2022\u2022\u2022`;
  return `${value.slice(0, 4)}\u2022\u2022\u2022\u2022${value.slice(-4)}`;
}
function normalizeBot(value, { stored = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if ("clientSecret" in value || "client_secret" in value || "deviceCode" in value) return null;
  if (stored && Object.keys(value).some((key) => !STORED_BOT_KEYS.has(key))) return null;
  const clientId = cleanString(value.clientId);
  const secretRef = safeSecretRef(value.secretRef);
  const approvedSenders = normalizeApprovedSenders(value.approvedSenders ?? []);
  if (!clientId || !secretRef || !approvedSenders) return null;
  const identity = deriveDingtalkBotIdentity(clientId);
  if (identity.secretRef !== secretRef) return null;
  const suppliedBotId = value.botId === void 0 ? identity.botId : safeBotId(value.botId);
  if (suppliedBotId !== identity.botId) return null;
  return Object.freeze({
    botId: identity.botId,
    clientId,
    secretRef,
    approvedSenders
  });
}
function normalizeDocument(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.bots)) return null;
  const bots = value.bots.map((bot) => normalizeBot(bot, { stored: true }));
  if (bots.some((bot) => bot === null)) return null;
  const botIds = /* @__PURE__ */ new Set();
  const clientIds = /* @__PURE__ */ new Set();
  const secretRefs = /* @__PURE__ */ new Set();
  for (const bot of bots) {
    if (botIds.has(bot.botId) || clientIds.has(bot.clientId) || secretRefs.has(bot.secretRef)) {
      return null;
    }
    botIds.add(bot.botId);
    clientIds.add(bot.clientId);
    secretRefs.add(bot.secretRef);
  }
  return Object.freeze({ version: 1, bots: Object.freeze(bots) });
}
function storedDocument(document) {
  return {
    version: 1,
    bots: document.bots.map((bot) => ({
      clientId: bot.clientId,
      secretRef: bot.secretRef,
      approvedSenders: bot.approvedSenders.map((sender) => ({
        senderKey: sender.senderKey,
        staffId: sender.staffId,
        displayName: sender.displayName,
        approvedAt: sender.approvedAt
      }))
    }))
  };
}
var DingtalkConfigStore = class {
  #path;
  #value = EMPTY_DOCUMENT;
  #writeQueue = Promise.resolve();
  /** @param {string} path Absolute or process-relative configuration file path. */
  constructor(path) {
    if (!cleanString(path)) throw new TypeError("config path is required");
    this.#path = path;
  }
  /** @returns {Promise<DingtalkConfigStore>} Loaded store. */
  async load() {
    try {
      const normalized = normalizeDocument(JSON.parse(await readFile(this.#path, "utf8")));
      if (!normalized) throw new Error("dsh-dingtalk config contains invalid bot data");
      this.#value = normalized;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.#value = EMPTY_DOCUMENT;
    }
    return this;
  }
  /** @returns {Array<object>} Cloned bot configurations with derived bot IDs. */
  list() {
    return structuredClone(this.#value.bots);
  }
  /** @param {string} botId Derived bot ID. @returns {object|null} Bot configuration. */
  get(botId) {
    const found = this.#value.bots.find((bot) => bot.botId === botId);
    return found ? structuredClone(found) : null;
  }
  /** @param {string} clientId DingTalk client ID. @returns {object|null} Bot configuration. */
  getByClientId(clientId) {
    const found = this.#value.bots.find((bot) => bot.clientId === clientId);
    return found ? structuredClone(found) : null;
  }
  /** @param {object} value Bot configuration without a client secret. @returns {Promise<object>} Saved config. */
  async save(value) {
    const normalized = normalizeBot(value);
    if (!normalized) throw new Error("Refusing to persist invalid dsh-dingtalk bot data");
    return this.#mutate((bots) => {
      const collision = bots.find(
        (bot) => (bot.clientId === normalized.clientId || bot.secretRef === normalized.secretRef) && bot.botId !== normalized.botId
      );
      if (collision) throw new Error("Duplicate DingTalk bot identity");
      const index = bots.findIndex((bot) => bot.botId === normalized.botId);
      if (index === -1) bots.push(normalized);
      else bots[index] = normalized;
      return structuredClone(normalized);
    });
  }
  /** @param {string} botId Derived bot ID. @returns {Promise<object|null>} Removed config. */
  async remove(botId) {
    if (!safeBotId(botId)) throw new TypeError("Invalid DingTalk bot id");
    return this.#mutate((bots) => {
      const index = bots.findIndex((bot) => bot.botId === botId);
      if (index === -1) return null;
      const [removed] = bots.splice(index, 1);
      return structuredClone(removed);
    });
  }
  /** Removes the configuration file and resets the in-memory store. */
  async clear() {
    const operation = this.#writeQueue.then(async () => {
      try {
        await unlink(this.#path);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      this.#value = EMPTY_DOCUMENT;
    });
    this.#writeQueue = operation.then(() => void 0, () => void 0);
    await operation;
  }
  async #mutate(mutator) {
    let result;
    const operation = this.#writeQueue.then(async () => {
      const bots = [...this.#value.bots];
      result = mutator(bots);
      const document = Object.freeze({ version: 1, bots: Object.freeze(bots) });
      await this.#write(document);
      this.#value = document;
    });
    this.#writeQueue = operation.then(() => void 0, () => void 0);
    await operation;
    return result;
  }
  async #write(document) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 448 });
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(storedDocument(document), null, 2)}
`, {
        encoding: "utf8",
        flag: "wx",
        mode: 384
      });
      await rename(temporary, this.#path);
    } catch (error) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") throw new AggregateError([error, cleanupError]);
      }
      throw error;
    }
  }
};

// src/device-auth.mjs
var DEFAULT_REGISTRATION_BASE_URL = "https://oapi.dingtalk.com";
var REGISTRATION_SOURCE = "DING_DWS_CLAW";
function cleanString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(cleanString2(value) ?? DEFAULT_REGISTRATION_BASE_URL);
  } catch {
    throw new TypeError("DingTalk registration base URL must be a valid HTTPS URL");
  }
  const isDingtalkHost2 = url.hostname === "dingtalk.com" || url.hostname.endsWith(".dingtalk.com");
  if (url.protocol !== "https:" || url.port || !isDingtalkHost2 || url.username || url.password || url.search || url.hash) {
    throw new TypeError("DingTalk registration base URL must be a valid HTTPS URL");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href.replace(/\/$/, "");
}
function readNow(clock) {
  const value = typeof clock?.now === "function" ? clock.now() : clock();
  if (!Number.isFinite(value)) throw new TypeError("clock must return a finite timestamp");
  return value;
}
function assertRecord(value, action) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DingtalkDeviceAuthError(
      "invalid-response",
      `DingTalk ${action} returned an invalid response`,
      action
    );
  }
  if (Number(value.errcode) !== 0) {
    throw new DingtalkDeviceAuthError(
      "api-error",
      `DingTalk ${action} request was rejected`,
      action
    );
  }
  return value;
}
var DingtalkDeviceAuthError = class extends Error {
  /**
   * @param {string} code Stable failure code.
   * @param {string} message Safe diagnostic that does not include response credentials.
   * @param {string} action Registration stage that failed.
   * @param {{cause?: unknown}} [options] Optional underlying error.
   */
  constructor(code, message, action, options = {}) {
    super(message, options);
    this.name = "DingtalkDeviceAuthError";
    this.code = code;
    this.action = action;
  }
};
var DingtalkDeviceAuth = class {
  #fetch;
  #clock;
  #baseUrl;
  #timeoutMs;
  /**
   * @param {{fetch?: typeof globalThis.fetch, clock?: {now(): number}|(()=>number), baseUrl?: string, timeoutMs?: number}} [options]
   * Device-registration dependencies.
   */
  constructor({
    fetch: fetch2 = globalThis.fetch,
    clock = Date,
    baseUrl = DEFAULT_REGISTRATION_BASE_URL,
    timeoutMs = 15e3
  } = {}) {
    if (typeof fetch2 !== "function") throw new TypeError("fetch is required");
    if (typeof clock !== "function" && typeof clock?.now !== "function") {
      throw new TypeError("clock must be a function or expose now()");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs must be a positive number");
    }
    this.#fetch = fetch2;
    this.#clock = clock;
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#timeoutMs = timeoutMs;
  }
  /**
   * Starts a QR registration and returns the host-only device code with QR metadata.
   * @param {{signal?: AbortSignal}} [options] Optional cancellation signal.
   * @returns {Promise<object>} Device registration details.
   */
  async start({ signal } = {}) {
    const initialized = await this.#post(
      "/app/registration/init",
      { source: REGISTRATION_SOURCE },
      "initialization",
      signal
    );
    const nonce = cleanString2(initialized.nonce);
    if (!nonce) {
      throw new DingtalkDeviceAuthError(
        "missing-nonce",
        "DingTalk registration initialization did not return a nonce",
        "initialization"
      );
    }
    const begun = await this.#post(
      "/app/registration/begin",
      { nonce },
      "begin",
      signal
    );
    const deviceCode = cleanString2(begun.device_code);
    const verificationUrl = cleanString2(begun.verification_uri_complete);
    if (!deviceCode || !verificationUrl) {
      throw new DingtalkDeviceAuthError(
        "incomplete-registration",
        "DingTalk registration did not return complete QR metadata",
        "begin"
      );
    }
    const expiresInSeconds = positiveNumber(begun.expires_in, 7200);
    const pollIntervalMs = positiveNumber(begun.interval, 5) * 1e3;
    return Object.freeze({
      deviceCode,
      verificationUrl,
      verificationUri: cleanString2(begun.verification_uri),
      userCode: cleanString2(begun.user_code),
      expiresAt: readNow(this.#clock) + expiresInSeconds * 1e3,
      pollIntervalMs
    });
  }
  /**
   * Polls one registration attempt.
   * @param {{deviceCode: string, signal?: AbortSignal}|string} request Host-only device code.
   * @returns {Promise<object>} Normalized registration state and credentials on success.
   */
  async poll(request) {
    const deviceCode = cleanString2(typeof request === "string" ? request : request?.deviceCode);
    const signal = typeof request === "object" ? request?.signal : void 0;
    if (!deviceCode) throw new TypeError("deviceCode is required");
    const response = await this.#post(
      "/app/registration/poll",
      { device_code: deviceCode },
      "poll",
      signal
    );
    const rawStatus = cleanString2(response.status)?.toUpperCase();
    const status = ["WAITING", "SUCCESS", "FAIL", "EXPIRED"].includes(rawStatus) ? rawStatus : "UNKNOWN";
    return Object.freeze({
      status,
      clientId: cleanString2(response.client_id),
      clientSecret: cleanString2(response.client_secret),
      failReason: cleanString2(response.fail_reason)
    });
  }
  async #post(path, body, action, signal) {
    let response;
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: requestSignal
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (timeoutSignal.aborted) {
        throw new DingtalkDeviceAuthError(
          "timeout",
          `DingTalk ${action} request timed out`,
          action,
          { cause: error }
        );
      }
      if (error?.name === "AbortError") throw error;
      throw new DingtalkDeviceAuthError(
        "network-error",
        `DingTalk ${action} request could not be completed`,
        action,
        { cause: error }
      );
    }
    if (!response || response.ok === false || typeof response.json !== "function") {
      throw new DingtalkDeviceAuthError(
        "http-error",
        `DingTalk ${action} request failed`,
        action
      );
    }
    let value;
    try {
      value = await response.json();
    } catch (error) {
      throw new DingtalkDeviceAuthError(
        "invalid-json",
        `DingTalk ${action} returned invalid JSON`,
        action,
        { cause: error }
      );
    }
    return assertRecord(value, action);
  }
};

// src/dingtalk-controller.mjs
import { randomUUID as randomUUID2 } from "node:crypto";
var ACTIVE_ATTEMPT_STATES = /* @__PURE__ */ new Set(["starting", "pending", "connecting"]);
var TERMINAL_ATTEMPT_STATES = /* @__PURE__ */ new Set(["connected", "expired", "failed", "cancelled"]);
function cleanString3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function safeError(code, message) {
  return Object.freeze({ code, message });
}
function nowFrom(clock) {
  return typeof clock?.now === "function" ? clock.now() : clock();
}
function isoNow(clock) {
  return new Date(nowFrom(clock)).toISOString();
}
function abortError() {
  return new DOMException("DingTalk provisioning was cancelled", "AbortError");
}
function publicAttempt(record) {
  if (!record) return null;
  return {
    attemptId: record.id,
    status: record.state,
    ...record.verificationUrl ? { verificationUrl: record.verificationUrl } : {},
    ...record.expiresAt ? { expiresAt: record.expiresAt } : {},
    ...record.pollIntervalMs ? { pollIntervalMs: record.pollIntervalMs } : {},
    ...record.botId ? { botId: record.botId } : {},
    ...record.alreadyConnected ? { alreadyConnected: true } : {},
    ...record.error ? { error: structuredClone(record.error) } : {}
  };
}
function runtimeStatus(runtime) {
  if (!runtime) return {};
  const value = typeof runtime.status === "function" ? runtime.status() : runtime.status;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isRuntimeConnected(runtime, status) {
  if (!runtime) return false;
  if (status.connected === false || status.ready === false) return false;
  const state = cleanString3(
    status.dingtalkStreamState ?? status.dingtalkConnectionState ?? status.connectionState ?? status.state
  )?.toLowerCase();
  if (["failed", "error", "offline", "disconnected", "stopped"].includes(state)) return false;
  return status.connected === true || status.ready === true || state === "connected" || state === "ready";
}
function normalizePendingSender(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const staffId = cleanString3(value.staffId ?? value.senderStaffId ?? value.senderId);
  if (!staffId) return null;
  const suppliedRequestId = cleanString3(value.requestId);
  const opaqueRequestId = suppliedRequestId && /^ding_sender_[A-Za-z0-9_-]{1,100}$/.test(suppliedRequestId) && !suppliedRequestId.includes(staffId) ? suppliedRequestId : null;
  if (!opaqueRequestId) return null;
  return {
    requestId: opaqueRequestId,
    staffId,
    displayName: cleanString3(value.displayName ?? value.senderName ?? value.senderNick) ?? "\u9489\u9489\u7528\u6237",
    requestedAt: cleanString3(value.requestedAt)
  };
}
function internalPendingSenders(status) {
  if (!Array.isArray(status.pendingSenders)) return [];
  const seen = /* @__PURE__ */ new Set();
  const senders = [];
  for (const value of status.pendingSenders) {
    const sender = normalizePendingSender(value);
    if (!sender || seen.has(sender.staffId)) continue;
    seen.add(sender.staffId);
    senders.push(sender);
  }
  return senders;
}
function publicPendingSender(sender) {
  return {
    requestId: sender.requestId,
    displayName: sender.displayName,
    senderIdMasked: maskDingtalkSenderId(sender.staffId),
    requestedAt: sender.requestedAt
  };
}
function publicApprovedSender(sender) {
  return {
    senderKey: sender.senderKey,
    displayName: cleanString3(sender.displayName) ?? "\u9489\u9489\u7528\u6237",
    senderIdMasked: maskDingtalkSenderId(sender.staffId),
    approvedAt: cleanString3(sender.approvedAt)
  };
}
var DingtalkController = class {
  #deviceAuth;
  #credentials;
  #configStore;
  #createRuntime;
  #deleteState;
  #logger;
  #clock;
  #runtimes = /* @__PURE__ */ new Map();
  #errors = /* @__PURE__ */ new Map();
  #attempts = /* @__PURE__ */ new Map();
  #activeAttemptId = null;
  #transitions = /* @__PURE__ */ new Map();
  #revision = 0;
  #closed = false;
  /**
   * @param {object} options Controller dependencies.
   * @param {object} options.deviceAuth Host-only DingTalk device auth client.
   * @param {object} options.credentials DSH credential provider.
   * @param {object} options.configStore Loaded DingTalk config store.
   * @param {Function} options.createRuntime Runtime factory.
   * @param {Function} [options.deleteState] Per-bot state cleanup callback.
   * @param {Console} [options.logger] Host logger.
   * @param {{now(): number}|(()=>number)} [options.clock] Injectable clock.
   */
  constructor({
    deviceAuth,
    credentials,
    configStore,
    createRuntime,
    deleteState = async () => {
    },
    logger = console,
    clock = Date
  }) {
    if (!deviceAuth || typeof deviceAuth.start !== "function" || typeof deviceAuth.poll !== "function") {
      throw new TypeError("DingtalkController requires a DingTalk device auth client");
    }
    if (!credentials || typeof credentials.resolve !== "function" || typeof credentials.set !== "function" || typeof credentials.unset !== "function") {
      throw new TypeError("DingtalkController requires the DSH credential provider");
    }
    if (!configStore || typeof configStore.list !== "function" || typeof configStore.get !== "function" || typeof configStore.getByClientId !== "function" || typeof configStore.save !== "function" || typeof configStore.remove !== "function") {
      throw new TypeError("DingtalkController requires a loaded config store");
    }
    if (typeof createRuntime !== "function") throw new TypeError("createRuntime is required");
    if (typeof deleteState !== "function") throw new TypeError("deleteState must be a function");
    if (typeof clock !== "function" && typeof clock?.now !== "function") {
      throw new TypeError("clock must be a function or expose now()");
    }
    this.#deviceAuth = deviceAuth;
    this.#credentials = credentials;
    this.#configStore = configStore;
    this.#createRuntime = createRuntime;
    this.#deleteState = deleteState;
    this.#logger = logger;
    this.#clock = clock;
  }
  /** Starts all configured DingTalk runtimes whose secrets are available. */
  async initialize() {
    if (this.#closed) return this.status();
    for (const config of this.#configStore.list()) {
      const current = this.#runtimes.get(config.botId);
      try {
        if (isRuntimeConnected(current, runtimeStatus(current))) continue;
      } catch {
      }
      await this.#withBotTransition(config.botId, async () => {
        const latest = this.#configStore.get(config.botId);
        if (!latest || this.#closed) return;
        const clientSecret = await this.#resolveSecret(latest.secretRef);
        if (!clientSecret) {
          this.#errors.set(
            latest.botId,
            safeError("missing-secret", "\u9489\u9489\u673A\u5668\u4EBA\u51ED\u636E\u7F3A\u5931\uFF0C\u8BF7\u79FB\u9664\u540E\u91CD\u65B0\u626B\u7801\u3002")
          );
          this.#touch();
          return;
        }
        try {
          await this.#startRuntime(latest, clientSecret);
          this.#errors.delete(latest.botId);
        } catch {
          this.#errors.set(
            latest.botId,
            safeError("connection-failed", "\u9489\u9489\u8FDE\u63A5\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002")
          );
          this.#logger.warn?.(`[dsh-dingtalk] bot ${latest.botId} failed to initialize`);
        }
        this.#touch();
      });
    }
    return this.status();
  }
  /** Starts one DingTalk QR registration, cancelling any prior active attempt. */
  async startProvisioning({ signal } = {}) {
    if (this.#closed) throw new Error("dsh-dingtalk controller is closed");
    if (this.#activeAttemptId) await this.cancelProvisioning(this.#activeAttemptId);
    const record = {
      id: randomUUID2(),
      state: "starting",
      controller: new AbortController(),
      deviceCode: null,
      verificationUrl: null,
      expiresAt: null,
      pollIntervalMs: null,
      pollTask: null,
      botId: null,
      alreadyConnected: false,
      error: null
    };
    this.#attempts.set(record.id, record);
    this.#activeAttemptId = record.id;
    this.#touch();
    const abortFromRequest = () => record.controller.abort(signal?.reason);
    if (signal?.aborted) abortFromRequest();
    else signal?.addEventListener("abort", abortFromRequest, { once: true });
    try {
      const begun = await this.#deviceAuth.start({ signal: record.controller.signal });
      this.#assertAttemptActive(record);
      record.deviceCode = cleanString3(begun.deviceCode);
      record.verificationUrl = cleanString3(begun.verificationUrl);
      record.expiresAt = Number(begun.expiresAt);
      record.pollIntervalMs = Number(begun.pollIntervalMs);
      if (!record.deviceCode || !record.verificationUrl || !Number.isFinite(record.expiresAt) || !Number.isFinite(record.pollIntervalMs) || record.pollIntervalMs <= 0) {
        throw new Error("DingTalk device auth returned incomplete registration metadata");
      }
      record.state = "pending";
      this.#touch();
      return publicAttempt(record);
    } catch (error) {
      if (record.controller.signal.aborted || error?.name === "AbortError") {
        record.state = "cancelled";
        record.error = safeError("cancelled", "\u626B\u7801\u63A5\u5165\u5DF2\u53D6\u6D88\u3002");
      } else {
        record.state = "failed";
        record.error = safeError("qr-start-failed", "\u65E0\u6CD5\u751F\u6210\u9489\u9489\u4E8C\u7EF4\u7801\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
      }
      if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      this.#touch();
      if (record.state === "failed") throw error;
      return publicAttempt(record);
    } finally {
      signal?.removeEventListener("abort", abortFromRequest);
    }
  }
  /** Polls one QR registration without exposing its device code or returned secret. */
  async registrationStatus(attemptId) {
    const record = this.#attempts.get(attemptId);
    if (!record) return null;
    if (TERMINAL_ATTEMPT_STATES.has(record.state) || record.state === "starting") {
      return publicAttempt(record);
    }
    if (nowFrom(this.#clock) >= record.expiresAt) {
      record.state = "expired";
      record.error = safeError("expired", "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002");
      if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      this.#touch();
      return publicAttempt(record);
    }
    if (!record.pollTask) {
      const task = this.#pollRegistration(record).finally(() => {
        if (record.pollTask === task) record.pollTask = null;
      });
      record.pollTask = task;
    }
    await record.pollTask;
    return publicAttempt(record);
  }
  /** Cancels an active QR registration. */
  async cancelProvisioning(attemptId) {
    const record = this.#attempts.get(attemptId);
    if (!record) return null;
    if (!TERMINAL_ATTEMPT_STATES.has(record.state)) {
      record.controller.abort();
      await record.pollTask?.catch(() => void 0);
      if (!TERMINAL_ATTEMPT_STATES.has(record.state)) record.state = "cancelled";
      record.error ??= safeError("cancelled", "\u626B\u7801\u63A5\u5165\u5DF2\u53D6\u6D88\u3002");
    }
    if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
    this.#touch();
    return publicAttempt(record);
  }
  /** Replaces one bot runtime using its stored credential. */
  async reconnectBot(botId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error("Unknown DingTalk bot");
    await this.#withBotTransition(botId, async () => {
      const clientSecret = await this.#resolveSecret(config.secretRef);
      if (!clientSecret) throw new Error("The DingTalk client secret is missing");
      try {
        await this.#startRuntime(config, clientSecret);
        this.#errors.delete(botId);
      } catch (error) {
        this.#errors.set(
          botId,
          safeError("connection-failed", "\u9489\u9489\u8FDE\u63A5\u4ECD\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002")
        );
        throw error;
      } finally {
        this.#touch();
      }
    });
    return this.status();
  }
  /** Removes one bot, its secret, runtime, and local conversation state. */
  async deleteBot(botId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error("Unknown DingTalk bot");
    await this.#withBotTransition(botId, async () => {
      const previousSecret = await this.#credentials.resolve(config.secretRef).catch(() => void 0);
      await this.#stopRuntime(botId);
      try {
        await this.#credentials.unset(config.secretRef);
        await this.#configStore.remove(botId);
      } catch (error) {
        if (cleanString3(previousSecret?.value)) {
          await this.#credentials.set(config.secretRef, previousSecret.value).catch(() => void 0);
          await this.#startRuntime(config, previousSecret.value).catch(() => void 0);
        }
        throw new Error("Unable to remove the DingTalk bot safely.", { cause: error });
      }
      try {
        await this.#deleteState({ botId, config });
      } catch {
        this.#logger.warn?.(`[dsh-dingtalk] bot ${botId} state cleanup failed`);
      }
      this.#errors.delete(botId);
      this.#touch();
    });
    return this.status();
  }
  /** Approves one opaque pending-sender request for a bot. */
  async approveSender(botId, requestId) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error("Unknown DingTalk bot");
    const runtime = this.#runtimes.get(botId);
    const direct = typeof runtime?.pendingSender === "function" ? normalizePendingSender(runtime.pendingSender(requestId)) : null;
    const pending = internalPendingSenders(runtimeStatus(runtime));
    const sender = direct?.requestId === requestId ? direct : pending.find((candidate) => candidate.requestId === requestId);
    if (!sender) throw new Error("Unknown DingTalk sender approval request");
    if (config.approvedSenders.some((approved) => approved.staffId === sender.staffId)) {
      return this.status();
    }
    const updated = {
      ...config,
      approvedSenders: [
        ...config.approvedSenders,
        {
          senderKey: deriveDingtalkSenderKey(),
          staffId: sender.staffId,
          displayName: sender.displayName,
          approvedAt: isoNow(this.#clock)
        }
      ]
    };
    await this.#saveAndRestart(config, updated);
    return this.status();
  }
  /** Revokes one approved sender by its browser-safe sender key. */
  async revokeSender(botId, senderKey) {
    const config = this.#configStore.get(botId);
    if (!config) throw new Error("Unknown DingTalk bot");
    const index = config.approvedSenders.findIndex(
      (sender) => sender.senderKey === senderKey
    );
    if (index === -1) throw new Error("Unknown approved DingTalk sender");
    const approvedSenders = [...config.approvedSenders];
    approvedSenders.splice(index, 1);
    await this.#saveAndRestart(config, { ...config, approvedSenders });
    return this.status();
  }
  /** Returns browser-safe bot, health, and sender-approval state. */
  status() {
    const bots = this.#configStore.list().map((config) => {
      const runtime = this.#runtimes.get(config.botId);
      let currentStatus = {};
      try {
        currentStatus = runtimeStatus(runtime);
      } catch {
        currentStatus = { state: "error" };
      }
      const connected = isRuntimeConnected(runtime, currentStatus);
      const accountError = this.#errors.get(config.botId);
      const state = connected ? "connected" : accountError ? "error" : "offline";
      const approvedIds = new Set(config.approvedSenders.map((sender) => sender.staffId));
      const pending = internalPendingSenders(currentStatus).filter((sender) => !approvedIds.has(sender.staffId)).map(publicPendingSender);
      return {
        botId: config.botId,
        state,
        connected,
        configured: true,
        bot: {
          name: "\u9489\u9489\u673A\u5668\u4EBA",
          clientIdMasked: maskDingtalkClientId(config.clientId)
        },
        health: {
          status: connected ? "healthy" : accountError ? "error" : "offline",
          summary: connected ? "\u9489\u9489 Stream \u6D88\u606F\u8FDE\u63A5\u8FD0\u884C\u6B63\u5E38" : accountError?.message ?? "\u9489\u9489\u6D88\u606F\u8FDE\u63A5\u5F53\u524D\u79BB\u7EBF",
          lastCheckedAt: currentStatus.lastCheckedAt ?? null
        },
        stats: {
          messagesReceived: Number(currentStatus.messagesReceived) || 0,
          messagesReplied: Number(currentStatus.messagesReplied) || 0
        },
        senders: {
          pending,
          approved: config.approvedSenders.map(publicApprovedSender)
        },
        error: accountError ? structuredClone(accountError) : null
      };
    });
    const connectedCount = bots.filter((bot) => bot.connected).length;
    const active = this.#activeAttemptId ? this.#attempts.get(this.#activeAttemptId) : null;
    return {
      schemaVersion: 1,
      revision: this.#revision,
      state: active && ACTIVE_ATTEMPT_STATES.has(active.state) ? "provisioning" : bots.length === 0 ? "disconnected" : connectedCount === bots.length ? "connected" : connectedCount > 0 ? "degraded" : "offline",
      bots,
      totals: { configured: bots.length, connected: connectedCount },
      ...active && ACTIVE_ATTEMPT_STATES.has(active.state) ? { provisioning: publicAttempt(active) } : {}
    };
  }
  /** Cancels provisioning and stops every bot runtime. */
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#activeAttemptId) await this.cancelProvisioning(this.#activeAttemptId);
    await Promise.allSettled([...this.#runtimes.keys()].map((botId) => this.#stopRuntime(botId)));
    await Promise.allSettled([...this.#transitions.values()]);
    await Promise.allSettled([...this.#runtimes.keys()].map((botId) => this.#stopRuntime(botId)));
  }
  async #pollRegistration(record) {
    try {
      this.#assertAttemptActive(record);
      const response = await this.#deviceAuth.poll({
        deviceCode: record.deviceCode,
        signal: record.controller.signal
      });
      this.#assertAttemptActive(record);
      const state = cleanString3(response.status)?.toUpperCase();
      if (state === "WAITING") {
        record.state = "pending";
        record.error = null;
      } else if (state === "SUCCESS") {
        const clientId = cleanString3(response.clientId);
        const clientSecret = cleanString3(response.clientSecret);
        if (!clientId || !clientSecret) throw new Error("DingTalk returned incomplete credentials");
        record.state = "connecting";
        record.error = null;
        this.#touch();
        const activation = await this.#activateBot(record, { clientId, clientSecret });
        record.botId = activation.botId;
        record.alreadyConnected = activation.alreadyConnected;
        record.state = "connected";
        if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      } else if (state === "EXPIRED") {
        record.state = "expired";
        record.error = safeError("expired", "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002");
        if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      } else if (state === "FAIL") {
        record.state = "failed";
        record.error = safeError("authorization-failed", "\u9489\u9489\u672A\u5B8C\u6210\u673A\u5668\u4EBA\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u3002");
        if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      } else {
        record.state = "pending";
        record.error = safeError("poll-pending", "\u9489\u9489\u6388\u6743\u72B6\u6001\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u6B63\u5728\u91CD\u8BD5\u3002");
      }
    } catch (error) {
      if (record.controller.signal.aborted || error?.name === "AbortError") {
        record.state = "cancelled";
        record.error = safeError("cancelled", "\u626B\u7801\u63A5\u5165\u5DF2\u53D6\u6D88\u3002");
        if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
      } else if (record.state === "connecting") {
        record.state = "failed";
        record.error = safeError(
          "activation-failed",
          "\u9489\u9489\u5DF2\u6388\u6743\uFF0C\u4F46\u65E0\u6CD5\u5B89\u5168\u4FDD\u5B58\u51ED\u636E\u6216\u542F\u52A8\u6D88\u606F\u8FDE\u63A5\u3002"
        );
        if (this.#activeAttemptId === record.id) this.#activeAttemptId = null;
        this.#logger.error?.("[dsh-dingtalk] bot activation failed");
      } else {
        record.state = "pending";
        record.error = safeError("poll-failed", "\u9489\u9489\u6388\u6743\u67E5\u8BE2\u6682\u65F6\u5931\u8D25\uFF0C\u6B63\u5728\u91CD\u8BD5\u3002");
      }
    } finally {
      this.#touch();
      this.#pruneAttempts();
    }
  }
  async #activateBot(record, { clientId, clientSecret }) {
    const identity = deriveDingtalkBotIdentity(clientId);
    const previousConfig = this.#configStore.getByClientId(clientId);
    const previousSecret = await this.#credentials.resolve(identity.secretRef).catch(() => void 0);
    const config = {
      botId: identity.botId,
      clientId,
      secretRef: identity.secretRef,
      approvedSenders: previousConfig?.approvedSenders ?? []
    };
    return this.#withBotTransition(identity.botId, async () => {
      await this.#credentials.set(identity.secretRef, clientSecret);
      try {
        this.#assertAttemptActive(record);
        await this.#configStore.save(config);
        this.#assertAttemptActive(record);
        await this.#startRuntime(config, clientSecret);
        this.#assertAttemptActive(record);
        this.#errors.delete(identity.botId);
        return { botId: identity.botId, alreadyConnected: Boolean(previousConfig) };
      } catch (error) {
        await this.#stopRuntime(identity.botId);
        if (previousConfig) await this.#configStore.save(previousConfig).catch(() => void 0);
        else if (this.#configStore.get(identity.botId)) {
          await this.#configStore.remove(identity.botId).catch(() => void 0);
        }
        await this.#restoreCredential(identity.secretRef, previousSecret);
        if (previousConfig && cleanString3(previousSecret?.value)) {
          await this.#startRuntime(previousConfig, previousSecret.value).catch(() => void 0);
        }
        throw error;
      }
    });
  }
  async #saveAndRestart(previousConfig, nextConfig) {
    return this.#withBotTransition(previousConfig.botId, async () => {
      const clientSecret = await this.#resolveSecret(previousConfig.secretRef);
      if (!clientSecret) throw new Error("The DingTalk client secret is missing");
      await this.#configStore.save(nextConfig);
      try {
        await this.#startRuntime(nextConfig, clientSecret);
        this.#errors.delete(previousConfig.botId);
      } catch (error) {
        await this.#configStore.save(previousConfig).catch(() => void 0);
        await this.#startRuntime(previousConfig, clientSecret).catch(() => void 0);
        this.#errors.set(
          previousConfig.botId,
          safeError("connection-failed", "\u9489\u9489\u8FDE\u63A5\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002")
        );
        throw error;
      } finally {
        this.#touch();
      }
    });
  }
  async #startRuntime(config, clientSecret) {
    if (this.#closed) throw abortError();
    await this.#stopRuntime(config.botId);
    if (this.#closed) throw abortError();
    const runtime = await this.#createRuntime({
      botId: config.botId,
      config: structuredClone(config),
      clientSecret
    });
    if (!runtime || typeof runtime.start !== "function" || typeof runtime.stop !== "function") {
      throw new TypeError("createRuntime returned an invalid DingTalk runtime");
    }
    if (this.#closed) {
      await runtime.stop().catch(() => void 0);
      throw abortError();
    }
    this.#runtimes.set(config.botId, runtime);
    try {
      await runtime.start();
      if (this.#closed) {
        await runtime.stop().catch(() => void 0);
        throw abortError();
      }
    } catch (error) {
      if (this.#runtimes.get(config.botId) === runtime) this.#runtimes.delete(config.botId);
      await runtime.stop().catch(() => void 0);
      throw error;
    }
  }
  async #stopRuntime(botId) {
    const runtime = this.#runtimes.get(botId);
    this.#runtimes.delete(botId);
    await runtime?.stop().catch(() => {
      this.#logger.warn?.(`[dsh-dingtalk] bot ${botId} failed to stop cleanly`);
    });
  }
  async #resolveSecret(secretRef) {
    const result = await this.#credentials.resolve(secretRef).catch(() => void 0);
    return cleanString3(result?.value);
  }
  async #restoreCredential(secretRef, previous) {
    try {
      if (cleanString3(previous?.value)) await this.#credentials.set(secretRef, previous.value);
      else await this.#credentials.unset(secretRef);
    } catch {
      this.#logger.error?.(`[dsh-dingtalk] failed to restore credential ${secretRef}`);
    }
  }
  #assertAttemptActive(record) {
    if (record.controller.signal.aborted || this.#activeAttemptId !== record.id) throw abortError();
  }
  #withBotTransition(botId, operation) {
    if (this.#closed) return Promise.reject(new Error("dsh-dingtalk controller is closed"));
    const previous = this.#transitions.get(botId) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(operation);
    const settled = current.finally(() => {
      if (this.#transitions.get(botId) === settled) this.#transitions.delete(botId);
    });
    this.#transitions.set(botId, settled);
    return settled;
  }
  #pruneAttempts() {
    for (const [id, record] of this.#attempts) {
      if (id !== this.#activeAttemptId && TERMINAL_ATTEMPT_STATES.has(record.state) && this.#attempts.size > 16) {
        this.#attempts.delete(id);
      }
    }
  }
  #touch() {
    this.#revision += 1;
  }
};

// src/dingtalk-api.mjs
var DINGTALK_REGISTRATION_BASE_URL = "https://oapi.dingtalk.com/";
var DINGTALK_API_BASE_URL = "https://api.dingtalk.com/";
var DINGTALK_REGISTRATION_SOURCE = "DING_DWS_CLAW";
var DEFAULT_TIMEOUT_MS = 15e3;
var REGISTRATION_STATUSES = /* @__PURE__ */ new Set(["WAITING", "SUCCESS", "FAIL", "EXPIRED"]);
var DingtalkApiError = class extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "DingtalkApiError";
    this.code = code;
    this.status = options.status;
  }
};
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function isDingtalkHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "dingtalk.com" || normalized.endsWith(".dingtalk.com");
}
function normalizeTrustedUrl(value, { label, requireSubdomain = true } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DingtalkApiError("invalid-url", `${label ?? "\u9489\u9489\u670D\u52A1"}\u8FD4\u56DE\u4E86\u65E0\u6548\u5730\u5740\u3002`);
  }
  const normalizedHost = url.hostname.toLowerCase().replace(/\.$/, "");
  const trustedHost = requireSubdomain ? normalizedHost !== "dingtalk.com" && isDingtalkHost(normalizedHost) : isDingtalkHost(normalizedHost);
  if (url.protocol !== "https:" || !trustedHost || url.port && url.port !== "443") {
    throw new DingtalkApiError("untrusted-url", `${label ?? "\u9489\u9489\u670D\u52A1"}\u5730\u5740\u4E0D\u53D7\u4FE1\u4EFB\u3002`);
  }
  if (url.username || url.password) {
    throw new DingtalkApiError("untrusted-url", `${label ?? "\u9489\u9489\u670D\u52A1"}\u5730\u5740\u4E0D\u53D7\u4FE1\u4EFB\u3002`);
  }
  return url;
}
function normalizeDingtalkSessionWebhook(value) {
  const text = nonEmptyString(value);
  if (!text) throw new DingtalkApiError("invalid-session-webhook", "\u9489\u9489\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u56DE\u590D\u5730\u5740\u3002");
  const url = normalizeTrustedUrl(text, { label: "\u9489\u9489\u56DE\u590D", requireSubdomain: false });
  url.hash = "";
  return url.toString();
}
function splitDingtalkText(value, maxChars = 4e3) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return [];
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new TypeError("maxChars must be a positive integer");
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf("\n", maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
function abortError2(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted", "AbortError");
}
async function requestJson(fetchImpl, url, {
  body,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  action = "request"
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) throw abortError2(signal);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new DingtalkApiError(
        "http-error",
        `\u9489\u9489\u670D\u52A1\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`,
        { status: response.status }
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new DingtalkApiError("invalid-response", "\u9489\u9489\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\u3002", { cause: error });
    }
  } catch (error) {
    if (signal?.aborted) throw abortError2(signal);
    if (timedOut) throw new DingtalkApiError("timeout", "\u9489\u9489\u670D\u52A1\u8BF7\u6C42\u8D85\u65F6\u3002", { cause: error });
    if (error instanceof DingtalkApiError) throw error;
    throw new DingtalkApiError("network-error", `\u6682\u65F6\u65E0\u6CD5\u5B8C\u6210\u9489\u9489${action}\u8BF7\u6C42\u3002`, { cause: error });
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
function assertRegistrationOk(value, action) {
  if (!value || typeof value !== "object" || value.errcode !== 0) {
    throw new DingtalkApiError(
      "registration-rejected",
      `\u9489\u9489\u626B\u7801${action}\u5931\u8D25\u3002`
    );
  }
  return value;
}
function positiveNumber2(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function createDingtalkApi({
  fetchImpl = fetch,
  registrationBaseUrl = process.env.DINGTALK_REGISTRATION_BASE_URL || DINGTALK_REGISTRATION_BASE_URL,
  registrationSource = process.env.DINGTALK_REGISTRATION_SOURCE || DINGTALK_REGISTRATION_SOURCE,
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const registrationBase = normalizeTrustedUrl(registrationBaseUrl, {
    label: "\u9489\u9489\u6CE8\u518C\u670D\u52A1",
    requireSubdomain: false
  });
  const apiBase = new URL(DINGTALK_API_BASE_URL);
  const source = nonEmptyString(registrationSource);
  if (!source) throw new TypeError("registrationSource is required");
  const tokenCache = /* @__PURE__ */ new Map();
  const tokenRequests = /* @__PURE__ */ new Map();
  const endpoint = (base, pathname) => new URL(pathname.replace(/^\//, ""), base);
  async function accessToken({ clientId, clientSecret, signal }) {
    const appKey = nonEmptyString(clientId);
    const appSecret = nonEmptyString(clientSecret);
    if (!appKey || !appSecret) throw new TypeError("clientId and clientSecret are required");
    const cached = tokenCache.get(appKey);
    if (cached && cached.expiresAt > now()) return cached.token;
    if (tokenRequests.has(appKey)) return tokenRequests.get(appKey);
    const request = (async () => {
      const value = await requestJson(fetchImpl, endpoint(apiBase, "v1.0/oauth2/accessToken"), {
        body: { appKey, appSecret },
        signal,
        action: "\u9274\u6743"
      });
      const token = nonEmptyString(value?.accessToken);
      if (!token) throw new DingtalkApiError("invalid-access-token", "\u9489\u9489\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u8BBF\u95EE\u4EE4\u724C\u3002");
      const expiresInSeconds = positiveNumber2(value?.expireIn ?? value?.expiresIn, 7200);
      const refreshAfterMs = Math.max(1e3, (expiresInSeconds - 60) * 1e3);
      tokenCache.set(appKey, { token, expiresAt: now() + refreshAfterMs });
      return token;
    })().finally(() => tokenRequests.delete(appKey));
    tokenRequests.set(appKey, request);
    return request;
  }
  return Object.freeze({
    async beginRegistration({ signal } = {}) {
      const initialized = assertRegistrationOk(await requestJson(
        fetchImpl,
        endpoint(registrationBase, "app/registration/init"),
        { body: { source }, signal, action: "\u521D\u59CB\u5316" }
      ), "\u521D\u59CB\u5316");
      const nonce = nonEmptyString(initialized.nonce);
      if (!nonce) throw new DingtalkApiError("invalid-registration", "\u9489\u9489\u626B\u7801\u521D\u59CB\u5316\u7F3A\u5C11 nonce\u3002");
      const begun = assertRegistrationOk(await requestJson(
        fetchImpl,
        endpoint(registrationBase, "app/registration/begin"),
        { body: { nonce }, signal, action: "\u521B\u5EFA" }
      ), "\u521B\u5EFA");
      const deviceCode = nonEmptyString(begun.device_code);
      const verificationUriComplete = nonEmptyString(begun.verification_uri_complete);
      if (!deviceCode || !verificationUriComplete) {
        throw new DingtalkApiError("invalid-registration", "\u9489\u9489\u626B\u7801\u670D\u52A1\u8FD4\u56DE\u7684\u4FE1\u606F\u4E0D\u5B8C\u6574\u3002");
      }
      const verificationUrl = normalizeTrustedUrl(verificationUriComplete, {
        label: "\u9489\u9489\u626B\u7801",
        requireSubdomain: false
      }).toString();
      return {
        deviceCode,
        userCode: nonEmptyString(begun.user_code) ?? void 0,
        verificationUri: nonEmptyString(begun.verification_uri) ?? void 0,
        verificationUriComplete: verificationUrl,
        expiresInSeconds: positiveNumber2(begun.expires_in, 7200),
        intervalSeconds: positiveNumber2(begun.interval, 5)
      };
    },
    async pollRegistration({ deviceCode, signal } = {}) {
      const code = nonEmptyString(deviceCode);
      if (!code) throw new TypeError("deviceCode is required");
      const polled = assertRegistrationOk(await requestJson(
        fetchImpl,
        endpoint(registrationBase, "app/registration/poll"),
        { body: { device_code: code }, signal, action: "\u72B6\u6001\u67E5\u8BE2" }
      ), "\u72B6\u6001\u67E5\u8BE2");
      const status = nonEmptyString(polled.status)?.toUpperCase();
      if (!status || !REGISTRATION_STATUSES.has(status)) {
        throw new DingtalkApiError("invalid-registration-status", "\u9489\u9489\u626B\u7801\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u72B6\u6001\u3002");
      }
      const result = {
        status,
        failReason: nonEmptyString(polled.fail_reason) ?? void 0
      };
      if (status === "SUCCESS") {
        result.clientId = nonEmptyString(polled.client_id) ?? void 0;
        result.clientSecret = nonEmptyString(polled.client_secret) ?? void 0;
        if (!result.clientId || !result.clientSecret) {
          throw new DingtalkApiError("missing-credentials", "\u9489\u9489\u626B\u7801\u5DF2\u786E\u8BA4\uFF0C\u4F46\u6CA1\u6709\u8FD4\u56DE\u673A\u5668\u4EBA\u51ED\u636E\u3002");
        }
      }
      return result;
    },
    accessToken,
    async sendText({ clientId, clientSecret, sessionWebhook, text, signal }) {
      const content = nonEmptyString(text);
      if (!content) throw new TypeError("text is required");
      const webhook = normalizeDingtalkSessionWebhook(sessionWebhook);
      const token = await accessToken({ clientId, clientSecret, signal });
      const response = await requestJson(fetchImpl, webhook, {
        body: { msgtype: "text", text: { content } },
        headers: { "x-acs-dingtalk-access-token": token },
        signal,
        action: "\u6D88\u606F\u56DE\u590D"
      });
      if (response?.errcode !== void 0 && response.errcode !== 0 || response?.code !== void 0 && response.code !== 0) {
        throw new DingtalkApiError("send-rejected", "\u9489\u9489\u670D\u52A1\u62D2\u7EDD\u4E86\u56DE\u590D\u6D88\u606F\u3002");
      }
      return true;
    },
    clearAccessToken(clientId) {
      const appKey = nonEmptyString(clientId);
      if (appKey) tokenCache.delete(appKey);
    }
  });
}

// src/dingtalk-bridge.mjs
var PENDING_SENDER_REPLY = [
  "\u6B64\u53D1\u9001\u8005\u5C1A\u672A\u83B7\u51C6\u4F7F\u7528\u673A\u5668\u4EBA\u3002",
  "\u8BF7\u5728\u8FD0\u884C DeepSeek Harness \u7684\u8FD9\u53F0\u7535\u8111\u4E0A\u6253\u5F00\u300C\u63D2\u4EF6 \u2192 IM\u673A\u5668\u4EBA \u2192 \u9489\u9489\u300D\uFF0C\u6279\u51C6\u540E\u518D\u53D1\u9001\u6D88\u606F\u3002"
].join("\n");
var HELP_TEXT = [
  "\u9489\u9489\u673A\u5668\u4EBA\u5DF2\u8FDE\u63A5 DeepSeek Harness\u3002",
  "",
  "\u76F4\u63A5\u53D1\u9001\u6587\u5B57\u5373\u53EF\u7EE7\u7EED\u5F53\u524D\u4F1A\u8BDD\u3002",
  "/new  \u5F00\u542F\u4E00\u4E2A\u5168\u65B0\u4F1A\u8BDD",
  "/status  \u68C0\u67E5\u8FDE\u63A5\u72B6\u6001",
  "/help  \u663E\u793A\u672C\u5E2E\u52A9"
].join("\n");
function nonEmptyString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function senderStaffId(message) {
  return nonEmptyString2(message?.senderStaffId) ?? nonEmptyString2(message?.senderId);
}
function conversationKey(message, sender) {
  if (String(message?.conversationType) === "2") {
    const conversationId = nonEmptyString2(message?.conversationId);
    if (!conversationId) throw new Error("DingTalk group message has no conversation id");
    return `group:${conversationId}`;
  }
  return `p2p:${sender}`;
}
function approvedStaffIds(values) {
  const entries = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
  return new Set(entries.map((entry) => nonEmptyString2(
    typeof entry === "string" ? entry : entry?.staffId
  )).filter(Boolean));
}
function ensureStats(status) {
  status.stats ??= {};
  for (const key of ["messagesReceived", "messagesReplied", "messagesRejected", "messagesIgnored"]) {
    status[key] ??= 0;
    status.stats[key] = status[key];
  }
  status.pendingSenders ??= [];
}
function increment(status, key) {
  status[key] = (status[key] ?? 0) + 1;
  status.stats ??= {};
  status.stats[key] = status[key];
}
function createDingtalkBridgeStatus({ pendingSenders = [] } = {}) {
  return {
    messagesReceived: 0,
    messagesReplied: 0,
    messagesRejected: 0,
    messagesIgnored: 0,
    lastMessageAt: null,
    lastReplyAt: null,
    lastRejectedAt: null,
    lastError: null,
    pendingSenders: structuredClone(pendingSenders),
    stats: {
      messagesReceived: 0,
      messagesReplied: 0,
      messagesRejected: 0,
      messagesIgnored: 0
    }
  };
}
var DingtalkHarnessBridge = class {
  #api;
  #clientId;
  #clientSecret;
  #approvedStaffIds;
  #harness;
  #state;
  #status;
  #logger;
  #replyTimeoutMs;
  #maxMessageChars;
  #signal;
  #queues = /* @__PURE__ */ new Map();
  #acceptedMessageIds = /* @__PURE__ */ new Set();
  constructor({
    api,
    clientId,
    clientSecret,
    approvedSenders,
    allowedSenderStaffIds,
    harness,
    state,
    status = createDingtalkBridgeStatus(),
    logger = console,
    replyTimeoutMs = 6e5,
    maxMessageChars = 4e3,
    signal
  }) {
    if (!api || typeof api.sendText !== "function") throw new TypeError("DingTalk API is required");
    if (!nonEmptyString2(clientId) || !nonEmptyString2(clientSecret)) {
      throw new TypeError("DingTalk app credentials are required");
    }
    if (!harness || !state) throw new TypeError("Harness client and state store are required");
    this.#api = api;
    this.#clientId = clientId.trim();
    this.#clientSecret = clientSecret.trim();
    this.#approvedStaffIds = approvedStaffIds(approvedSenders ?? allowedSenderStaffIds);
    this.#harness = harness;
    this.#state = state;
    this.#status = status;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#maxMessageChars = maxMessageChars;
    this.#signal = signal;
    ensureStats(this.#status);
    this.#refreshPendingSenders();
  }
  get status() {
    this.#refreshPendingSenders();
    return structuredClone(this.#status);
  }
  accept(message) {
    if (this.#signal?.aborted) return Promise.resolve();
    const messageId = nonEmptyString2(message?.msgId);
    const sender = senderStaffId(message);
    if (!messageId || !sender || this.#state.hasSeen(messageId) || this.#acceptedMessageIds.has(messageId)) return Promise.resolve();
    this.#acceptedMessageIds.add(messageId);
    let key;
    try {
      key = conversationKey(message, sender);
    } catch {
      this.#acceptedMessageIds.delete(messageId);
      increment(this.#status, "messagesRejected");
      this.#status.lastRejectedAt = (/* @__PURE__ */ new Date()).toISOString();
      return Promise.resolve();
    }
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(() => this.#process(message, messageId, sender, key)).finally(() => {
      this.#acceptedMessageIds.delete(messageId);
      if (this.#queues.get(key) === current) this.#queues.delete(key);
    });
    this.#queues.set(key, current);
    return current;
  }
  async waitForIdle() {
    await Promise.allSettled([...this.#queues.values()]);
  }
  async #process(message, messageId, sender, key) {
    this.#signal?.throwIfAborted();
    if (this.#state.hasSeen(messageId)) return;
    await this.#state.markSeen(messageId);
    increment(this.#status, "messagesReceived");
    this.#status.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
    if (String(message.conversationType) === "2" && message.isInAtList !== true) {
      increment(this.#status, "messagesIgnored");
      return;
    }
    let sessionWebhook;
    try {
      sessionWebhook = normalizeDingtalkSessionWebhook(message.sessionWebhook);
    } catch {
      increment(this.#status, "messagesRejected");
      this.#status.lastRejectedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.#status.lastError = "\u9489\u9489\u6D88\u606F\u6CA1\u6709\u5B89\u5168\u7684\u56DE\u590D\u5730\u5740\u3002";
      return;
    }
    if (!this.#approvedStaffIds.has(sender)) {
      increment(this.#status, "messagesRejected");
      this.#status.lastRejectedAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.#state.recordPendingSender({
        staffId: sender,
        displayName: nonEmptyString2(message.senderNick) ?? "\u9489\u9489\u7528\u6237",
        lastSeenAt: this.#status.lastRejectedAt
      });
      this.#refreshPendingSenders();
      try {
        await this.#send(sessionWebhook, PENDING_SENDER_REPLY);
      } catch {
        if (this.#signal?.aborted) return;
        this.#status.lastError = "\u65E0\u6CD5\u53D1\u9001\u672C\u673A\u6279\u51C6\u63D0\u793A\u3002";
        this.#logger.warn?.("[dsh-dingtalk] unable to send the local approval prompt");
      }
      return;
    }
    if (typeof this.#state.removePendingSenderByStaffId === "function") {
      await this.#state.removePendingSenderByStaffId(sender);
      this.#refreshPendingSenders();
    }
    const text = message?.msgtype === "text" ? nonEmptyString2(message?.text?.content) : null;
    try {
      if (!text) {
        await this.#send(sessionWebhook, "\u76EE\u524D\u4EC5\u652F\u6301\u6587\u5B57\u6D88\u606F\u3002");
        return;
      }
      const command = text.toLowerCase();
      if (command === "/help") {
        await this.#send(sessionWebhook, HELP_TEXT);
        return;
      }
      if (command === "/status") {
        await this.#harness.ensureRunning({ signal: this.#signal });
        await this.#send(sessionWebhook, "\u9489\u9489\u673A\u5668\u4EBA\u4E0E DeepSeek Harness \u8FDE\u63A5\u6B63\u5E38\u3002");
        return;
      }
      if (command === "/new") {
        await this.#state.clearSession(key);
        await this.#send(sessionWebhook, "\u5DF2\u5F00\u542F\u65B0\u4F1A\u8BDD\u3002\u8BF7\u53D1\u9001\u4F60\u7684\u95EE\u9898\u3002");
        return;
      }
      let sessionId = this.#state.sessionFor(key);
      if (!sessionId || !await this.#harness.sessionExists(sessionId, { signal: this.#signal })) {
        sessionId = await this.#harness.createSession({ signal: this.#signal });
        await this.#state.setSession(key, sessionId);
      }
      const answer = await this.#harness.ask(sessionId, text, {
        timeoutMs: this.#replyTimeoutMs,
        signal: this.#signal
      });
      await this.#send(sessionWebhook, answer);
      increment(this.#status, "messagesReplied");
      this.#status.lastReplyAt = (/* @__PURE__ */ new Date()).toISOString();
      this.#status.lastError = null;
    } catch {
      if (this.#signal?.aborted) return;
      this.#status.lastError = "\u9489\u9489\u6D88\u606F\u5904\u7406\u5931\u8D25\u3002";
      this.#logger.error?.("[dsh-dingtalk] failed to process an inbound message");
      try {
        await this.#send(sessionWebhook, "\u6D88\u606F\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
      } catch {
        this.#logger.error?.("[dsh-dingtalk] failed to send the safe error reply");
      }
    }
  }
  #refreshPendingSenders() {
    if (typeof this.#state.pendingSenders === "function") {
      this.#status.pendingSenders = this.#state.pendingSenders();
    }
  }
  async #send(sessionWebhook, text) {
    for (const chunk of splitDingtalkText(text, this.#maxMessageChars)) {
      this.#signal?.throwIfAborted();
      await this.#api.sendText({
        clientId: this.#clientId,
        clientSecret: this.#clientSecret,
        sessionWebhook,
        text: chunk,
        signal: this.#signal
      });
    }
  }
};

// src/dingtalk-runtime.mjs
function nonEmptyString3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function approvedSenderIds(config) {
  const entries = Array.isArray(config?.approvedSenders) ? config.approvedSenders : config?.approvedSenders instanceof Set ? [...config.approvedSenders] : [];
  return new Set(entries.map((entry) => nonEmptyString3(
    typeof entry === "string" ? entry : entry?.staffId
  )).filter(Boolean));
}
function approvedSenderCount(config) {
  return approvedSenderIds(config).size;
}
function streamIsOpen(client) {
  const socketOpen = client?.connected === true || client?.socket?.readyState === 1;
  const registrationReady = typeof client?.registered !== "boolean" || client.registered === true;
  return socketOpen && registrationReady;
}
function abortable(promise, signal) {
  return new Promise((resolve2, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve2(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
async function waitForStreamOpen(client, pollIntervalMs, signal) {
  while (true) {
    signal?.throwIfAborted();
    if (streamIsOpen(client)) return;
    await new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve2();
      }, pollIntervalMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
async function connectStream(client, timeoutMs, pollIntervalMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const connectSignal = AbortSignal.any([signal, timeoutSignal]);
  let connectSettled = false;
  const connectTask = Promise.resolve().then(() => client.connect()).finally(() => {
    connectSettled = true;
  });
  try {
    await abortable(connectTask, connectSignal);
    await waitForStreamOpen(client, pollIntervalMs, connectSignal);
  } catch (error) {
    if (connectSignal.aborted) {
      if (!connectSettled) {
        void connectTask.then(() => client.disconnect()).catch(() => void 0);
      }
      if (signal.aborted) throw signal.reason;
      throw new Error(`DingTalk Stream handshake timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
async function defaultStreamFactory({ clientId, clientSecret }) {
  const { DWClient, TOPIC_ROBOT } = await import("dingtalk-stream");
  return {
    client: new DWClient({
      clientId,
      clientSecret,
      endpoint: "https://api.dingtalk.com",
      autoReconnect: false,
      keepAlive: true,
      debug: false
    }),
    topic: TOPIC_ROBOT
  };
}
function createDingtalkRuntimeStatus({
  pendingSenders = [],
  approvedSenders = 0
} = {}) {
  return {
    startedAt: null,
    ready: false,
    dingtalkStreamState: "idle",
    harnessReachable: false,
    lastConnectedAt: null,
    lastCheckedAt: null,
    lastCallbackAt: null,
    authorizationMode: "sender-staff-id-approval",
    approvedSenderCount: approvedSenders,
    ...createDingtalkBridgeStatus({ pendingSenders })
  };
}
var DingtalkRuntime = class {
  #config;
  #clientSecret;
  #harness;
  #state;
  #logger;
  #replyTimeoutMs;
  #maxMessageChars;
  #connectTimeoutMs;
  #connectPollIntervalMs;
  #api;
  #streamFactory;
  #status;
  #client = null;
  #bridge = null;
  #topic = null;
  #starting = null;
  #connectionMonitor = null;
  #abortController = null;
  #callbackTasks = /* @__PURE__ */ new Set();
  constructor({
    config,
    clientSecret,
    harness,
    state,
    logger = console,
    replyTimeoutMs = 6e5,
    maxMessageChars = 4e3,
    connectTimeoutMs = 15e3,
    connectPollIntervalMs = 25,
    api = createDingtalkApi(),
    streamFactory = defaultStreamFactory
  }) {
    if (!config || !nonEmptyString3(config.clientId) || !nonEmptyString3(clientSecret)) {
      throw new TypeError("DingtalkRuntime requires app credentials");
    }
    if (!harness || !state) throw new TypeError("DingtalkRuntime requires Harness and state");
    if (typeof streamFactory !== "function") throw new TypeError("streamFactory must be a function");
    this.#config = config;
    this.#clientSecret = clientSecret.trim();
    this.#harness = harness;
    this.#state = state;
    this.#logger = logger;
    this.#replyTimeoutMs = replyTimeoutMs;
    this.#maxMessageChars = maxMessageChars;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#connectPollIntervalMs = connectPollIntervalMs;
    this.#api = api;
    this.#streamFactory = streamFactory;
    this.#status = createDingtalkRuntimeStatus({
      pendingSenders: this.#pendingSenders(),
      approvedSenders: approvedSenderCount(config)
    });
  }
  get status() {
    if (this.#bridge) {
      const bridgeStatus = this.#bridge.status;
      Object.assign(this.#status, bridgeStatus);
    } else {
      this.#status.pendingSenders = this.#pendingSenders();
    }
    return structuredClone(this.#status);
  }
  pendingSender(requestId) {
    return typeof this.#state.pendingSender === "function" ? this.#state.pendingSender(requestId) : null;
  }
  pendingSenders() {
    return this.#pendingSenders();
  }
  async start() {
    if (this.#client && this.#status.ready) return this.status;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }
  async #start() {
    await this.stop();
    const abortController = new AbortController();
    this.#abortController = abortController;
    const { signal } = abortController;
    this.#status.startedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.#status.dingtalkStreamState = "connecting";
    this.#status.lastError = null;
    try {
      await this.#harness.ensureRunning({ signal });
      this.#status.harnessReachable = true;
      if (typeof this.#state.removePendingSenderByStaffId === "function") {
        for (const staffId of approvedSenderIds(this.#config)) {
          await this.#state.removePendingSenderByStaffId(staffId);
        }
        this.#status.pendingSenders = this.#pendingSenders();
      }
      this.#bridge = new DingtalkHarnessBridge({
        api: this.#api,
        clientId: this.#config.clientId,
        clientSecret: this.#clientSecret,
        approvedSenders: this.#config.approvedSenders,
        harness: this.#harness,
        state: this.#state,
        status: this.#status,
        logger: this.#logger,
        replyTimeoutMs: this.#replyTimeoutMs,
        maxMessageChars: this.#maxMessageChars,
        signal
      });
      const created = await this.#streamFactory({
        clientId: this.#config.clientId,
        clientSecret: this.#clientSecret
      });
      signal.throwIfAborted();
      this.#client = created?.client ?? created;
      this.#topic = created?.topic ?? created?.TOPIC_ROBOT ?? "/v1.0/im/bot/messages/get";
      if (!this.#client || typeof this.#client.registerCallbackListener !== "function" || typeof this.#client.connect !== "function" || typeof this.#client.disconnect !== "function" || typeof this.#client.socketCallBackResponse !== "function") {
        throw new TypeError("streamFactory returned an invalid DingTalk Stream client");
      }
      const client = this.#client;
      const bridge = this.#bridge;
      client.registerCallbackListener(this.#topic, (response) => {
        if (this.#client !== client || this.#bridge !== bridge) return;
        const callbackMessageId = nonEmptyString3(response?.headers?.messageId);
        if (callbackMessageId) {
          try {
            client.socketCallBackResponse(callbackMessageId, { success: true });
          } catch {
            this.#logger.warn?.("[dsh-dingtalk] unable to acknowledge an inbound callback");
          }
        }
        const task = Promise.resolve().then(async () => {
          if (this.#bridge !== bridge) return;
          let message;
          try {
            message = typeof response?.data === "string" ? JSON.parse(response.data) : response?.data;
          } catch {
            this.#status.lastError = "\u9489\u9489\u6D88\u606F\u683C\u5F0F\u65E0\u6548\u3002";
            this.#logger.warn?.("[dsh-dingtalk] ignored an invalid callback payload");
            return;
          }
          if (!message || typeof message !== "object") return;
          this.#status.lastCallbackAt = Date.now();
          await bridge.accept(message);
        }).catch(() => {
          if (signal.aborted || this.#bridge !== bridge) return;
          this.#status.lastError = "\u9489\u9489\u6D88\u606F\u5904\u7406\u5931\u8D25\u3002";
          this.#logger.error?.("[dsh-dingtalk] callback processing failed");
        }).finally(() => this.#callbackTasks.delete(task));
        this.#callbackTasks.add(task);
      });
      await connectStream(
        client,
        this.#connectTimeoutMs,
        this.#connectPollIntervalMs,
        signal
      );
      this.#status.ready = true;
      this.#status.dingtalkStreamState = "connected";
      this.#status.lastConnectedAt = Date.now();
      this.#status.lastCheckedAt = Date.now();
      this.#status.lastError = null;
      this.#connectionMonitor = setInterval(() => {
        const connected = streamIsOpen(client);
        this.#status.ready = connected;
        this.#status.dingtalkStreamState = connected ? "connected" : "reconnecting";
        this.#status.lastCheckedAt = Date.now();
        if (connected) this.#status.lastError = null;
      }, 1e3);
      this.#connectionMonitor.unref?.();
      return this.status;
    } catch (error) {
      const aborted = signal.aborted;
      this.#status.ready = false;
      this.#status.dingtalkStreamState = aborted ? "idle" : "failed";
      this.#status.lastError = aborted ? null : error?.message ?? String(error);
      await this.stop({ preserveError: !aborted });
      throw error;
    }
  }
  async stop({ preserveError = false } = {}) {
    const lastError = preserveError ? this.#status.lastError : null;
    const abortController = this.#abortController;
    this.#abortController = null;
    abortController?.abort(new DOMException("DingTalk runtime stopped", "AbortError"));
    if (this.#connectionMonitor) clearInterval(this.#connectionMonitor);
    this.#connectionMonitor = null;
    this.#status.ready = false;
    const client = this.#client;
    this.#client = null;
    this.#topic = null;
    if (client) {
      try {
        await client.disconnect();
      } catch {
        this.#logger.warn?.("[dsh-dingtalk] DingTalk Stream disconnect failed");
      }
    }
    await Promise.allSettled([...this.#callbackTasks]);
    this.#callbackTasks.clear();
    if (this.#bridge) await this.#bridge.waitForIdle();
    this.#bridge = null;
    this.#status.dingtalkStreamState = preserveError ? "failed" : "idle";
    this.#status.lastError = lastError;
    return this.status;
  }
  #pendingSenders() {
    return typeof this.#state.pendingSenders === "function" ? this.#state.pendingSenders() : [];
  }
};

// src/harness-client.mjs
import { spawn } from "node:child_process";
import { randomUUID as randomUUID3 } from "node:crypto";
function sleep(ms, signal) {
  return new Promise((resolve2, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve2();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function assistantMessageText(event) {
  return (event?.data?.message?.content ?? []).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}
var HarnessReplyTracker = class {
  #promptRpcId;
  #lastSeq;
  #openTurn = null;
  #targetTurn = null;
  #stepText = /* @__PURE__ */ new Map();
  #latestText = "";
  #finished = false;
  #reason = null;
  constructor({ promptRpcId, afterSeq = -1 }) {
    this.#promptRpcId = promptRpcId;
    this.#lastSeq = afterSeq;
  }
  get finished() {
    return this.#finished;
  }
  get answer() {
    return this.#latestText.trim();
  }
  get reason() {
    return this.#reason;
  }
  consume(entries) {
    let update = null;
    const ordered = [...entries].map((entry) => entry?.event ?? entry).filter(Boolean).sort((left, right) => (left.seq ?? -1) - (right.seq ?? -1));
    for (const event of ordered) {
      const seq = event.seq ?? -1;
      if (seq <= this.#lastSeq) continue;
      this.#lastSeq = seq;
      if (event.type === "turn/start") this.#openTurn = event.data?.turn ?? null;
      if (event.type === "user/message" && event.data?.source?.rpcId === this.#promptRpcId) {
        this.#targetTurn = this.#openTurn;
        continue;
      }
      if (this.#targetTurn === null) continue;
      if (event.type === "turn/end") {
        if (event.data?.turn !== this.#targetTurn) continue;
        this.#finished = true;
        this.#reason = event.data?.reason ?? null;
        this.#openTurn = null;
        continue;
      }
      if (event.data?.turn !== this.#targetTurn) continue;
      if (event.type === "assistant/chunk" && event.data?.chunk?.type === "text-delta") {
        const step = event.data?.step ?? 0;
        const index = event.data.chunk.index ?? 0;
        const key = `${step}:${index}`;
        this.#stepText.set(key, (this.#stepText.get(key) ?? "") + event.data.chunk.text);
        const prefix = `${step}:`;
        const text = [...this.#stepText.entries()].filter(([partKey]) => partKey.startsWith(prefix)).sort(([left], [right]) => Number(left.split(":")[1]) - Number(right.split(":")[1])).map(([, part]) => part).join("\n").trim();
        if (text && text !== this.#latestText) {
          this.#latestText = text;
          update = { type: "text", text };
        }
        continue;
      }
      if (event.type === "assistant/message") {
        const text = assistantMessageText(event);
        if (text && text !== this.#latestText) {
          this.#latestText = text;
          update = { type: "text", text };
        }
        continue;
      }
      if (event.type === "tool/call") {
        update = { type: "tool", name: event.data?.name ?? "\u5DE5\u5177" };
      } else if (event.type === "tool/result") {
        update = { type: "status", text: "\u6B63\u5728\u6574\u7406\u7ED3\u679C\u2026" };
      }
    }
    return update;
  }
};
var HarnessRpcError = class extends Error {
  constructor(method, error) {
    super(`${method}: ${error?.message ?? "unknown Harness RPC error"}`);
    this.name = "HarnessRpcError";
    this.method = method;
    this.code = error?.code ?? "internal";
    this.details = error?.details ?? {};
  }
};
var HarnessClient = class {
  #baseUrl;
  #workspace;
  #agentPreset;
  #autostart;
  #dshBin;
  #fetch;
  #managedProcess = null;
  constructor({
    baseUrl,
    workspace,
    agentPreset = "standard",
    autostart = false,
    dshBin = "dsh",
    fetchImpl = fetch
  }) {
    this.#baseUrl = new URL(baseUrl);
    this.#workspace = workspace;
    this.#agentPreset = agentPreset;
    this.#autostart = autostart;
    this.#dshBin = dshBin;
    this.#fetch = fetchImpl;
  }
  async rpc(method, payload = {}, timeoutMs = 3e4, options = {}) {
    const rpcId = options.rpcId ?? `dingtalk-${randomUUID3()}`;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    const response = await this.#fetch(new URL(`/api/${method}`, this.#baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
      signal
    });
    if (!response.ok) throw new Error(`Harness transport ${method} failed: HTTP ${response.status}`);
    const body = await response.json();
    if (body?.type !== "server-response" || body?.rpcId !== rpcId) {
      throw new Error(`Harness returned an invalid response for ${method}`);
    }
    if (!body.result?.ok) throw new HarnessRpcError(method, body.result?.error);
    return body.result.value;
  }
  async health(options = {}) {
    await this.rpc("host.describe", {}, 5e3, options);
    return true;
  }
  async ensureRunning(options = {}) {
    try {
      return await this.health(options);
    } catch (firstError) {
      if (!this.#autostart) throw firstError;
    }
    if (!this.#managedProcess || this.#managedProcess.exitCode !== null) {
      const port = this.#baseUrl.port || (this.#baseUrl.protocol === "https:" ? "443" : "80");
      this.#managedProcess = spawn(this.#dshBin, [
        "web",
        "--host",
        this.#baseUrl.hostname,
        "--port",
        port
      ], {
        cwd: this.#workspace,
        env: process.env,
        stdio: ["ignore", "inherit", "inherit"]
      });
      this.#managedProcess.on("error", (error) => {
        console.error("[dsh-dingtalk] failed to start Harness:", error.message);
      });
    }
    const deadline = Date.now() + 6e4;
    let lastError;
    while (Date.now() < deadline) {
      await sleep(1e3, options.signal);
      try {
        return await this.health(options);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Harness did not become ready: ${lastError?.message ?? "timeout"}`);
  }
  async workspaceId(options = {}) {
    const { items } = await this.rpc("workspace.list", {}, 3e4, options);
    const existing = items.find((item) => item.path === this.#workspace);
    if (existing) return existing.workspaceId;
    const created = await this.rpc("workspace.create", { path: this.#workspace }, 3e4, options);
    return created.workspace.workspaceId;
  }
  async createSession(options = {}) {
    await this.ensureRunning(options);
    const workspaceId = await this.workspaceId(options);
    const created = await this.rpc("session.create", {
      workspaceId,
      agentPreset: this.#agentPreset
    }, 3e4, options);
    return created.sessionId;
  }
  async sessionExists(sessionId, options = {}) {
    try {
      await this.rpc("session.history", { sessionId, maxMessages: 1 }, 3e4, options);
      return true;
    } catch (error) {
      if (error instanceof HarnessRpcError && error.code === "session-not-found") return false;
      throw error;
    }
  }
  async ask(sessionId, text, options = {}) {
    if (typeof options === "number") options = { timeoutMs: options };
    const timeoutMs = options.timeoutMs ?? 6e5;
    const signal = options.signal;
    const onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : null;
    await this.ensureRunning({ signal });
    const before = await this.rpc(
      "session.history",
      { sessionId, maxMessages: 1 },
      3e4,
      { signal }
    );
    const baselineSeq = Math.max(-1, ...(before.events ?? []).map(({ event }) => event.seq ?? -1));
    const promptRpcId = `dingtalk-${randomUUID3()}`;
    const tracker = new HarnessReplyTracker({ promptRpcId, afterSeq: baselineSeq });
    await this.rpc("session.prompt", {
      sessionId,
      mode: "queue",
      content: [{ type: "text", text }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }, 3e4, { rpcId: promptRpcId, signal });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(300, signal);
      const history = await this.rpc(
        "session.history",
        { sessionId, maxMessages: 50 },
        3e4,
        { signal }
      );
      const update = tracker.consume(history.events ?? []);
      if (update && onUpdate) {
        try {
          await onUpdate(update);
        } catch (error) {
          console.warn("[dsh-dingtalk] ignored a progress update failure:", error.message);
        }
      }
      if (!tracker.finished) continue;
      if (tracker.answer) return tracker.answer;
      throw new Error(
        `Harness turn ended without a text reply${tracker.reason ? ` (${JSON.stringify(tracker.reason)})` : ""}`
      );
    }
    throw new Error(`Harness reply timed out after ${Math.round(timeoutMs / 1e3)} seconds`);
  }
  stopManagedProcess() {
    if (this.#managedProcess?.exitCode === null) this.#managedProcess.kill("SIGTERM");
  }
};

// src/state-store.mjs
import { randomUUID as randomUUID4 } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile2, rename as rename2, unlink as unlink2, writeFile as writeFile2 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
var EMPTY_STATE = Object.freeze({
  version: 1,
  sessions: {},
  seenMessageIds: [],
  pendingSenders: {}
});
function nonEmptyString4(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function displayName(value) {
  return (nonEmptyString4(value) ?? "\u9489\u9489\u7528\u6237").slice(0, 100);
}
function normalizePendingSender2(value, fallbackRequestId) {
  if (!value || typeof value !== "object") return null;
  const requestId = nonEmptyString4(value.requestId) ?? nonEmptyString4(fallbackRequestId);
  const staffId = nonEmptyString4(value.staffId);
  const requestedAt = nonEmptyString4(value.requestedAt) ?? nonEmptyString4(value.lastSeenAt);
  const lastSeenAt = nonEmptyString4(value.lastSeenAt) ?? requestedAt;
  if (!requestId || !staffId || !requestedAt || !lastSeenAt) return null;
  return {
    requestId,
    staffId,
    displayName: displayName(value.displayName ?? value.nick),
    requestedAt,
    lastSeenAt
  };
}
function normalizeState(value) {
  if (!value || typeof value !== "object") return structuredClone(EMPTY_STATE);
  const sessions = {};
  if (value.sessions && typeof value.sessions === "object" && !Array.isArray(value.sessions)) {
    for (const [key, sessionId] of Object.entries(value.sessions)) {
      const normalizedKey = nonEmptyString4(key);
      const normalizedSession = nonEmptyString4(sessionId);
      if (normalizedKey && normalizedSession) sessions[normalizedKey] = normalizedSession;
    }
  }
  const pendingSenders = {};
  const entries = Array.isArray(value.pendingSenders) ? value.pendingSenders.map((entry) => [entry?.requestId, entry]) : Object.entries(value.pendingSenders && typeof value.pendingSenders === "object" ? value.pendingSenders : {});
  for (const [key, candidate] of entries) {
    const pending = normalizePendingSender2(candidate, key);
    if (!pending) continue;
    const duplicate = Object.values(pendingSenders).find((entry) => entry.staffId === pending.staffId);
    if (!duplicate || duplicate.lastSeenAt < pending.lastSeenAt) {
      if (duplicate) delete pendingSenders[duplicate.requestId];
      pendingSenders[pending.requestId] = pending;
    }
  }
  return {
    version: 1,
    sessions,
    seenMessageIds: Array.isArray(value.seenMessageIds) ? [...new Set(value.seenMessageIds.map(nonEmptyString4).filter(Boolean))].slice(-1e3) : [],
    pendingSenders
  };
}
var DingtalkStateStore = class {
  #path;
  #state = structuredClone(EMPTY_STATE);
  #writeQueue = Promise.resolve();
  #idFactory;
  #now;
  constructor(path, { idFactory = randomUUID4, now = () => (/* @__PURE__ */ new Date()).toISOString() } = {}) {
    if (!nonEmptyString4(path)) throw new TypeError("state path is required");
    if (typeof idFactory !== "function" || typeof now !== "function") {
      throw new TypeError("idFactory and now must be functions");
    }
    this.#path = path;
    this.#idFactory = idFactory;
    this.#now = now;
  }
  async load() {
    try {
      this.#state = normalizeState(JSON.parse(await readFile2(this.#path, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.#state = structuredClone(EMPTY_STATE);
      await this.#persist();
    }
    return this;
  }
  sessionFor(key) {
    return this.#state.sessions[key] ?? null;
  }
  async setSession(key, sessionId) {
    const normalizedKey = nonEmptyString4(key);
    const normalizedSession = nonEmptyString4(sessionId);
    if (!normalizedKey || !normalizedSession) throw new TypeError("key and sessionId are required");
    this.#state.sessions[normalizedKey] = normalizedSession;
    await this.#persist();
  }
  async clearSession(key) {
    const normalizedKey = nonEmptyString4(key);
    if (!normalizedKey || !(normalizedKey in this.#state.sessions)) return;
    delete this.#state.sessions[normalizedKey];
    await this.#persist();
  }
  hasSeen(messageId) {
    const id = nonEmptyString4(messageId);
    return Boolean(id && this.#state.seenMessageIds.includes(id));
  }
  async markSeen(messageId) {
    const id = nonEmptyString4(messageId);
    if (!id) throw new TypeError("messageId is required");
    if (this.hasSeen(id)) return;
    this.#state.seenMessageIds.push(id);
    if (this.#state.seenMessageIds.length > 1e3) {
      this.#state.seenMessageIds.splice(0, this.#state.seenMessageIds.length - 1e3);
    }
    await this.#persist();
  }
  pendingSenders() {
    return Object.values(this.#state.pendingSenders).sort((left, right) => left.requestedAt.localeCompare(right.requestedAt)).map((entry) => structuredClone(entry));
  }
  pendingSender(requestId) {
    const id = nonEmptyString4(requestId);
    const entry = id ? this.#state.pendingSenders[id] : null;
    return entry ? structuredClone(entry) : null;
  }
  async recordPendingSender(staffIdOrEntry, name2, seenAt) {
    const input = staffIdOrEntry && typeof staffIdOrEntry === "object" ? staffIdOrEntry : { staffId: staffIdOrEntry, displayName: name2, lastSeenAt: seenAt };
    const staffId = nonEmptyString4(input.staffId);
    if (!staffId) throw new TypeError("staffId is required");
    const timestamp = nonEmptyString4(input.lastSeenAt) ?? nonEmptyString4(input.requestedAt) ?? this.#now();
    const existing = Object.values(this.#state.pendingSenders).find((entry2) => entry2.staffId === staffId);
    const entry = {
      requestId: existing?.requestId ?? `ding_sender_${this.#idFactory()}`,
      staffId,
      displayName: displayName(input.displayName ?? input.nick ?? name2),
      requestedAt: existing?.requestedAt ?? timestamp,
      lastSeenAt: timestamp
    };
    this.#state.pendingSenders[entry.requestId] = entry;
    await this.#persist();
    return structuredClone(entry);
  }
  async removePendingSender(requestId) {
    const id = nonEmptyString4(requestId);
    if (!id || !this.#state.pendingSenders[id]) return false;
    delete this.#state.pendingSenders[id];
    await this.#persist();
    return true;
  }
  async removePendingSenderByStaffId(staffId) {
    const id = nonEmptyString4(staffId);
    const pending = id ? Object.values(this.#state.pendingSenders).find((entry) => entry.staffId === id) : null;
    return pending ? this.removePendingSender(pending.requestId) : false;
  }
  snapshot() {
    return structuredClone(this.#state);
  }
  async remove() {
    await this.#writeQueue;
    try {
      await unlink2(this.#path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    this.#state = structuredClone(EMPTY_STATE);
  }
  async #persist() {
    const snapshot = `${JSON.stringify(this.#state, null, 2)}
`;
    const operation = this.#writeQueue.then(async () => {
      await mkdir2(dirname2(this.#path), { recursive: true, mode: 448 });
      const temporary = `${this.#path}.tmp`;
      await writeFile2(temporary, snapshot, { encoding: "utf8", mode: 384 });
      await rename2(temporary, this.#path);
    });
    this.#writeQueue = operation.then(() => void 0, () => void 0);
    await operation;
  }
};

// plugin-src/host/connection-supervisor.mjs
var DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 1e3, 3e3, 5e3, 1e4, 3e4]);
function retryDelays(value) {
  if (!Array.isArray(value) || value.length === 0) return [...DEFAULT_RETRY_DELAYS_MS];
  const valid = value.filter((delay) => Number.isFinite(delay) && delay >= 0);
  return valid.length > 0 ? valid : [...DEFAULT_RETRY_DELAYS_MS];
}
var ConnectionSupervisor = class {
  #controller;
  #harness;
  #logger;
  #retryDelays;
  #healthyIntervalMs;
  #setTimeout;
  #clearTimeout;
  #timer = null;
  #running = null;
  #retryIndex = 0;
  #closed = false;
  #started = false;
  #ready;
  #resolveReady;
  constructor({
    controller,
    harness,
    logger = console,
    retryDelaysMs,
    healthyIntervalMs = 15e3,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  }) {
    if (!controller || typeof controller.initialize !== "function" || typeof controller.status !== "function") {
      throw new TypeError("ConnectionSupervisor requires a controller");
    }
    if (!harness || typeof harness.ensureRunning !== "function") {
      throw new TypeError("ConnectionSupervisor requires a Harness client");
    }
    this.#controller = controller;
    this.#harness = harness;
    this.#logger = logger;
    this.#retryDelays = retryDelays(retryDelaysMs);
    this.#healthyIntervalMs = Number.isFinite(healthyIntervalMs) && healthyIntervalMs >= 0 ? healthyIntervalMs : 15e3;
    this.#setTimeout = setTimeoutImpl;
    this.#clearTimeout = clearTimeoutImpl;
    this.#ready = new Promise((resolve2) => {
      this.#resolveReady = resolve2;
    });
  }
  get ready() {
    return this.#ready;
  }
  start() {
    if (this.#started || this.#closed) return this;
    this.#started = true;
    this.#schedule(0);
    return this;
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== null) this.#clearTimeout(this.#timer);
    this.#timer = null;
    await this.#running?.catch(() => void 0);
    this.#resolveReady?.(null);
    this.#resolveReady = null;
  }
  #schedule(delayMs) {
    if (this.#closed) return;
    this.#timer = this.#setTimeout(() => {
      this.#timer = null;
      void this.#run();
    }, delayMs);
    this.#timer?.unref?.();
  }
  async #run() {
    if (this.#closed || this.#running) return;
    const operation = this.#reconcile();
    this.#running = operation;
    try {
      await operation;
    } finally {
      if (this.#running === operation) this.#running = null;
    }
  }
  async #reconcile() {
    try {
      await this.#harness.ensureRunning();
      if (this.#closed) return;
      const status = await this.#controller.initialize();
      if (this.#closed) return;
      this.#resolveReady?.(status);
      this.#resolveReady = null;
      const { configured, connected } = status.totals;
      if (connected < configured) {
        const delayMs = this.#retryDelays[Math.min(this.#retryIndex, this.#retryDelays.length - 1)];
        this.#retryIndex += 1;
        this.#logger.warn?.(
          `[dsh-dingtalk] ${connected}/${configured} bots connected; retrying in ${delayMs}ms`
        );
        this.#schedule(delayMs);
        return;
      }
      this.#retryIndex = 0;
      this.#schedule(this.#healthyIntervalMs);
    } catch (error) {
      if (this.#closed) return;
      const delayMs = this.#retryDelays[Math.min(this.#retryIndex, this.#retryDelays.length - 1)];
      this.#retryIndex += 1;
      this.#logger.warn?.(
        `[dsh-dingtalk] connection reconciliation failed; retrying in ${delayMs}ms`,
        error
      );
      this.#schedule(delayMs);
    }
  }
};
function createConnectionSupervisor(options) {
  return new ConnectionSupervisor(options);
}

// plugin-src/host/production.mjs
function harnessOrigin(webServer, configured) {
  if (configured !== void 0) return new URL(configured);
  const port = webServer?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("dsh-dingtalk requires an initialized DSH webServer port");
  }
  return new URL(`http://127.0.0.1:${port}`);
}
function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh"));
  const root = resolve(config.dataDir ?? join(dshHome, "integrations", "dsh-dingtalk"));
  return {
    root,
    config: resolve(config.configPath ?? join(root, "config.json")),
    bots: resolve(config.botsDir ?? join(root, "bots"))
  };
}
async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError("dsh-dingtalk requires ctx.credentials");
  if (!ctx?.webServer) throw new TypeError("dsh-dingtalk requires ctx.webServer");
  const ConfigStore = internals.ConfigStore ?? DingtalkConfigStore;
  const DeviceAuth = internals.DeviceAuth ?? DingtalkDeviceAuth;
  const StateStore = internals.StateStore ?? DingtalkStateStore;
  const Harness = internals.HarnessClient ?? HarnessClient;
  const Controller = internals.Controller ?? DingtalkController;
  const Runtime = internals.Runtime ?? DingtalkRuntime;
  const createSupervisor = internals.createConnectionSupervisor ?? createConnectionSupervisor;
  const logger = typeof ctx.logger === "function" ? ctx.logger("dsh-dingtalk") : ctx.logger ?? console;
  const paths = pluginPaths(config);
  const configStore = await new ConfigStore(paths.config).load();
  const deviceAuth = internals.deviceAuth ?? new DeviceAuth({
    baseUrl: config.registrationBaseUrl
  });
  const stateStores = /* @__PURE__ */ new Map();
  const statePath = (botId) => resolve(paths.bots, botId, "state.json");
  const stateFor = async (botId) => {
    let state = stateStores.get(botId);
    if (!state) {
      state = await new StateStore(statePath(botId)).load();
      stateStores.set(botId, state);
    }
    return state;
  };
  const harness = new Harness({
    baseUrl: harnessOrigin(ctx.webServer, config.harnessBaseUrl),
    workspace: resolve(config.workspace ?? process.cwd()),
    agentPreset: config.agentPreset ?? "standard",
    autostart: false,
    dshBin: config.dshBin ?? "dsh"
  });
  const controller = new Controller({
    deviceAuth,
    credentials: ctx.credentials,
    configStore,
    logger,
    createRuntime: async ({ botId, config: botConfig, clientSecret }) => {
      const state = await stateFor(botId);
      return new Runtime({
        config: botConfig,
        clientSecret,
        harness,
        state,
        replyTimeoutMs: config.replyTimeoutMs ?? 6e5,
        maxMessageChars: config.maxMessageChars ?? 4e3,
        connectTimeoutMs: config.connectTimeoutMs ?? 15e3,
        logger: {
          error: (...args) => logger.error?.(`[${botId}]`, ...args),
          warn: (...args) => logger.warn?.(`[${botId}]`, ...args),
          info: (...args) => logger.info?.(`[${botId}]`, ...args),
          debug: (...args) => logger.debug?.(`[${botId}]`, ...args)
        }
      });
    },
    deleteState: async ({ botId }) => {
      const state = stateStores.get(botId);
      stateStores.delete(botId);
      if (state && typeof state.remove === "function") {
        await state.remove();
        return;
      }
      try {
        await unlink3(statePath(botId));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  });
  const supervisor = createSupervisor({
    controller,
    harness,
    logger,
    retryDelaysMs: config.retryDelaysMs,
    healthyIntervalMs: config.healthyIntervalMs
  }).start();
  return {
    controller,
    ready: supervisor.ready,
    async close() {
      await supervisor.close();
      await controller.close();
      harness.stopManagedProcess();
    }
  };
}

// plugin-src/host/rpc.mjs
import QRCode from "qrcode";
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
var DINGTALK_RPC_ENDPOINTS = Object.freeze(Object.values(DINGTALK_ENDPOINTS));
var FORBIDDEN_PUBLIC_KEYS = /* @__PURE__ */ new Set([
  "clientSecret",
  "client_secret",
  "deviceCode",
  "device_code",
  "secretRef",
  "staffId",
  "senderStaffId",
  "verificationUrl",
  "verificationUri",
  "userCode"
]);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function payloadFailure(endpoint, payload) {
  if (!isRecord(payload)) return "Payload must be an object.";
  if (endpoint === DINGTALK_ENDPOINTS.status) {
    return exactKeys(payload, []) ? null : "connection.status does not accept fields.";
  }
  if (endpoint === DINGTALK_ENDPOINTS.beginProvisioning) {
    return exactKeys(payload, ["locale"]) && (payload.locale === void 0 || payload.locale === "zh-CN") ? null : "provision.begin received unsupported fields.";
  }
  if ([DINGTALK_ENDPOINTS.pollProvisioning, DINGTALK_ENDPOINTS.cancelProvisioning].includes(endpoint)) {
    return exactKeys(payload, ["attemptId"]) && validId(payload.attemptId) ? null : `${endpoint} requires an attemptId.`;
  }
  if (endpoint === DINGTALK_ENDPOINTS.reconnectBot) {
    return exactKeys(payload, ["botId"]) && validId(payload.botId) ? null : "bot.reconnect requires a botId.";
  }
  if (endpoint === DINGTALK_ENDPOINTS.deleteBot) {
    return exactKeys(payload, ["botId", "confirm"]) && validId(payload.botId) && payload.confirm === true ? null : "bot.delete requires a botId and confirm=true.";
  }
  if (endpoint === DINGTALK_ENDPOINTS.approveSender) {
    return exactKeys(payload, ["botId", "requestId", "confirm"]) && validId(payload.botId) && validId(payload.requestId) && payload.confirm === true ? null : "bot.sender.approve requires botId, requestId, and confirm=true.";
  }
  if (endpoint === DINGTALK_ENDPOINTS.revokeSender) {
    return exactKeys(payload, ["botId", "senderKey", "confirm"]) && validId(payload.botId) && validId(payload.senderKey) && payload.confirm === true ? null : "bot.sender.revoke requires botId, senderKey, and confirm=true.";
  }
  return "Unknown DingTalk endpoint.";
}
function badRequest(message) {
  return { ok: false, error: { code: "bad-request", message } };
}
function cancelled() {
  return { ok: false, error: { code: "cancelled", message: "The request was cancelled." } };
}
function internalFailure() {
  return {
    ok: false,
    error: { code: "dingtalk-operation-failed", message: "\u9489\u9489\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" }
  };
}
function sanitizePublic(value) {
  if (Array.isArray(value)) return value.map(sanitizePublic);
  if (!isRecord(value)) return value;
  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (!FORBIDDEN_PUBLIC_KEYS.has(key)) safe[key] = sanitizePublic(child);
  }
  return safe;
}
async function qrDataUrl(value) {
  return QRCode.toDataURL(value, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320
  });
}
async function withEncodedQr(value, encodeQr) {
  if (!value || typeof value.verificationUrl !== "string") return sanitizePublic(value);
  return sanitizePublic({
    ...value,
    qrCodeDataUrl: await encodeQr(value.verificationUrl)
  });
}
async function publicStatus(status, encodeQr) {
  const value = structuredClone(status);
  if (value?.provisioning) {
    value.provisioning = await withEncodedQr(value.provisioning, encodeQr);
  }
  return sanitizePublic(value);
}
function assertController(controller) {
  for (const method of [
    "status",
    "startProvisioning",
    "registrationStatus",
    "cancelProvisioning",
    "reconnectBot",
    "deleteBot",
    "approveSender",
    "revokeSender"
  ]) {
    if (typeof controller?.[method] !== "function") {
      throw new TypeError(`A complete DingTalk controller is required (${method})`);
    }
  }
}
function createDingtalkRpcHandler(controller, { encodeQr = qrDataUrl } = {}) {
  assertController(controller);
  const qrCache = /* @__PURE__ */ new Map();
  const cachedEncode = (url) => {
    let encoded = qrCache.get(url);
    if (!encoded) {
      if (qrCache.size >= 16) qrCache.delete(qrCache.keys().next().value);
      encoded = Promise.resolve().then(() => encodeQr(url));
      qrCache.set(url, encoded);
    }
    return encoded;
  };
  return async (endpoint, payload, signal) => {
    if (signal?.aborted) return cancelled();
    if (!DINGTALK_RPC_ENDPOINTS.includes(endpoint)) return badRequest("Unknown DingTalk endpoint.");
    const invalid = payloadFailure(endpoint, payload);
    if (invalid) return badRequest(invalid);
    try {
      let value;
      if (endpoint === DINGTALK_ENDPOINTS.status) {
        value = await publicStatus(await controller.status(), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.beginProvisioning) {
        const started = await controller.startProvisioning({ signal });
        if (signal?.aborted) {
          await controller.cancelProvisioning(started.attemptId);
          return cancelled();
        }
        value = await withEncodedQr(started, cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.pollProvisioning) {
        const current = await controller.registrationStatus(payload.attemptId);
        if (!current) return badRequest("The provisioning attempt no longer exists.");
        value = await withEncodedQr(current, cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.cancelProvisioning) {
        value = await controller.cancelProvisioning(payload.attemptId);
        if (!value) return badRequest("The provisioning attempt no longer exists.");
        value = sanitizePublic(value);
      } else if (endpoint === DINGTALK_ENDPOINTS.reconnectBot) {
        value = await publicStatus(await controller.reconnectBot(payload.botId), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.deleteBot) {
        value = await publicStatus(await controller.deleteBot(payload.botId), cachedEncode);
      } else if (endpoint === DINGTALK_ENDPOINTS.approveSender) {
        value = await publicStatus(
          await controller.approveSender(payload.botId, payload.requestId),
          cachedEncode
        );
      } else {
        value = await publicStatus(
          await controller.revokeSender(payload.botId, payload.senderKey),
          cachedEncode
        );
      }
      return signal?.aborted ? cancelled() : { ok: true, value };
    } catch {
      return signal?.aborted ? cancelled() : internalFailure();
    }
  };
}
function installDingtalkRpc(ctx, controller, options) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== "function") {
    throw new TypeError("DSH Host Connection RPC is required");
  }
  return ctx.connection.rpc.handle(
    DINGTALK_RPC_CHANNEL,
    createDingtalkRpcHandler(controller, options),
    { authority: "loopback" }
  );
}

// plugin-src/host/index.mjs
var name = "dsh-dingtalk-host";
var inject = ["connection", "credentials", "webServer"];
async function apply(ctx, config = {}) {
  if (config?.controller) return installDingtalkRpc(ctx, config.controller, config.rpcOptions);
  const production = await createProductionController(ctx, config, config.internals);
  const disposeRpc = installDingtalkRpc(ctx, production.controller, config.rpcOptions);
  ctx.effect(() => async () => {
    await production.close();
  }, "dsh-dingtalk: close bot connections");
  return disposeRpc;
}
function createDingtalkHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}
export {
  ConnectionSupervisor,
  DINGTALK_ENDPOINTS,
  DINGTALK_RPC_CHANNEL,
  DINGTALK_RPC_ENDPOINTS,
  DingtalkController,
  DingtalkRuntime,
  apply,
  createConnectionSupervisor,
  createDingtalkHostPlugin,
  createDingtalkRpcHandler,
  createProductionController,
  inject,
  installDingtalkRpc,
  name
};
