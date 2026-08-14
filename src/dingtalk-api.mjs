export const DINGTALK_REGISTRATION_BASE_URL = 'https://oapi.dingtalk.com/';
export const DINGTALK_API_BASE_URL = 'https://api.dingtalk.com/';
export const DINGTALK_REGISTRATION_SOURCE = 'DING_DWS_CLAW';

const DEFAULT_TIMEOUT_MS = 15_000;
const REGISTRATION_STATUSES = new Set(['WAITING', 'SUCCESS', 'FAIL', 'EXPIRED']);

export class DingtalkApiError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'DingtalkApiError';
    this.code = code;
    this.status = options.status;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isDingtalkHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'dingtalk.com' || normalized.endsWith('.dingtalk.com');
}

function normalizeTrustedUrl(value, { label, requireSubdomain = true } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DingtalkApiError('invalid-url', `${label ?? '钉钉服务'}返回了无效地址。`);
  }
  const normalizedHost = url.hostname.toLowerCase().replace(/\.$/, '');
  const trustedHost = requireSubdomain
    ? normalizedHost !== 'dingtalk.com' && isDingtalkHost(normalizedHost)
    : isDingtalkHost(normalizedHost);
  if (url.protocol !== 'https:' || !trustedHost || (url.port && url.port !== '443')) {
    throw new DingtalkApiError('untrusted-url', `${label ?? '钉钉服务'}地址不受信任。`);
  }
  if (url.username || url.password) {
    throw new DingtalkApiError('untrusted-url', `${label ?? '钉钉服务'}地址不受信任。`);
  }
  return url;
}

export function normalizeDingtalkSessionWebhook(value) {
  const text = nonEmptyString(value);
  if (!text) throw new DingtalkApiError('invalid-session-webhook', '钉钉消息没有可用的回复地址。');
  const url = normalizeTrustedUrl(text, { label: '钉钉回复', requireSubdomain: false });
  url.hash = '';
  return url.toString();
}

export function splitDingtalkText(value, maxChars = 4_000) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return [];
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new TypeError('maxChars must be a positive integer');
  if (text.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf('\n', maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException('The operation was aborted', 'AbortError');
}

async function requestJson(fetchImpl, url, {
  body,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  action = 'request',
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) throw abortError(signal);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : null;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new DingtalkApiError(
        'http-error',
        `钉钉服务请求失败（HTTP ${response.status}）。`,
        { status: response.status },
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new DingtalkApiError('invalid-response', '钉钉服务返回了无法解析的响应。', { cause: error });
    }
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    if (timedOut) throw new DingtalkApiError('timeout', '钉钉服务请求超时。', { cause: error });
    if (error instanceof DingtalkApiError) throw error;
    throw new DingtalkApiError('network-error', `暂时无法完成钉钉${action}请求。`, { cause: error });
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function assertRegistrationOk(value, action) {
  if (!value || typeof value !== 'object' || value.errcode !== 0) {
    throw new DingtalkApiError(
      'registration-rejected',
      `钉钉扫码${action}失败。`,
    );
  }
  return value;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createDingtalkApi({
  fetchImpl = fetch,
  registrationBaseUrl = process.env.DINGTALK_REGISTRATION_BASE_URL
    || DINGTALK_REGISTRATION_BASE_URL,
  registrationSource = process.env.DINGTALK_REGISTRATION_SOURCE
    || DINGTALK_REGISTRATION_SOURCE,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const registrationBase = normalizeTrustedUrl(registrationBaseUrl, {
    label: '钉钉注册服务',
    requireSubdomain: false,
  });
  const apiBase = new URL(DINGTALK_API_BASE_URL);
  const source = nonEmptyString(registrationSource);
  if (!source) throw new TypeError('registrationSource is required');
  const tokenCache = new Map();
  const tokenRequests = new Map();

  const endpoint = (base, pathname) => new URL(pathname.replace(/^\//, ''), base);

  async function accessToken({ clientId, clientSecret, signal }) {
    const appKey = nonEmptyString(clientId);
    const appSecret = nonEmptyString(clientSecret);
    if (!appKey || !appSecret) throw new TypeError('clientId and clientSecret are required');
    const cached = tokenCache.get(appKey);
    if (cached && cached.expiresAt > now()) return cached.token;
    if (tokenRequests.has(appKey)) return tokenRequests.get(appKey);

    const request = (async () => {
      const value = await requestJson(fetchImpl, endpoint(apiBase, 'v1.0/oauth2/accessToken'), {
        body: { appKey, appSecret },
        signal,
        action: '鉴权',
      });
      const token = nonEmptyString(value?.accessToken);
      if (!token) throw new DingtalkApiError('invalid-access-token', '钉钉服务没有返回访问令牌。');
      const expiresInSeconds = positiveNumber(value?.expireIn ?? value?.expiresIn, 7_200);
      const refreshAfterMs = Math.max(1_000, (expiresInSeconds - 60) * 1_000);
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
        endpoint(registrationBase, 'app/registration/init'),
        { body: { source }, signal, action: '初始化' },
      ), '初始化');
      const nonce = nonEmptyString(initialized.nonce);
      if (!nonce) throw new DingtalkApiError('invalid-registration', '钉钉扫码初始化缺少 nonce。');

      const begun = assertRegistrationOk(await requestJson(
        fetchImpl,
        endpoint(registrationBase, 'app/registration/begin'),
        { body: { nonce }, signal, action: '创建' },
      ), '创建');
      const deviceCode = nonEmptyString(begun.device_code);
      const verificationUriComplete = nonEmptyString(begun.verification_uri_complete);
      if (!deviceCode || !verificationUriComplete) {
        throw new DingtalkApiError('invalid-registration', '钉钉扫码服务返回的信息不完整。');
      }
      const verificationUrl = normalizeTrustedUrl(verificationUriComplete, {
        label: '钉钉扫码',
        requireSubdomain: false,
      }).toString();
      return {
        deviceCode,
        userCode: nonEmptyString(begun.user_code) ?? undefined,
        verificationUri: nonEmptyString(begun.verification_uri) ?? undefined,
        verificationUriComplete: verificationUrl,
        expiresInSeconds: positiveNumber(begun.expires_in, 7_200),
        intervalSeconds: positiveNumber(begun.interval, 5),
      };
    },

    async pollRegistration({ deviceCode, signal } = {}) {
      const code = nonEmptyString(deviceCode);
      if (!code) throw new TypeError('deviceCode is required');
      const polled = assertRegistrationOk(await requestJson(
        fetchImpl,
        endpoint(registrationBase, 'app/registration/poll'),
        { body: { device_code: code }, signal, action: '状态查询' },
      ), '状态查询');
      const status = nonEmptyString(polled.status)?.toUpperCase();
      if (!status || !REGISTRATION_STATUSES.has(status)) {
        throw new DingtalkApiError('invalid-registration-status', '钉钉扫码服务返回了无法识别的状态。');
      }
      const result = {
        status,
        failReason: nonEmptyString(polled.fail_reason) ?? undefined,
      };
      if (status === 'SUCCESS') {
        result.clientId = nonEmptyString(polled.client_id) ?? undefined;
        result.clientSecret = nonEmptyString(polled.client_secret) ?? undefined;
        if (!result.clientId || !result.clientSecret) {
          throw new DingtalkApiError('missing-credentials', '钉钉扫码已确认，但没有返回机器人凭据。');
        }
      }
      return result;
    },

    accessToken,

    async sendText({ clientId, clientSecret, sessionWebhook, text, signal }) {
      const content = nonEmptyString(text);
      if (!content) throw new TypeError('text is required');
      const webhook = normalizeDingtalkSessionWebhook(sessionWebhook);
      const token = await accessToken({ clientId, clientSecret, signal });
      const response = await requestJson(fetchImpl, webhook, {
        body: { msgtype: 'text', text: { content } },
        headers: { 'x-acs-dingtalk-access-token': token },
        signal,
        action: '消息回复',
      });
      if ((response?.errcode !== undefined && response.errcode !== 0)
        || (response?.code !== undefined && response.code !== 0)) {
        throw new DingtalkApiError('send-rejected', '钉钉服务拒绝了回复消息。');
      }
      return true;
    },

    clearAccessToken(clientId) {
      const appKey = nonEmptyString(clientId);
      if (appKey) tokenCache.delete(appKey);
    },
  });
}

export const createDingTalkApi = createDingtalkApi;
export const normalizeDingTalkSessionWebhook = normalizeDingtalkSessionWebhook;
export const splitDingTalkText = splitDingtalkText;
