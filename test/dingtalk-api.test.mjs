import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDingtalkApi,
  DINGTALK_API_BASE_URL,
  normalizeDingtalkSessionWebhook,
  splitDingtalkText,
} from '../src/dingtalk-api.mjs';

function jsonResponse(value, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

test('registration API performs init, begin, and poll with normalized results', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), options });
    if (url.pathname.endsWith('/init')) return jsonResponse({ errcode: 0, nonce: ' nonce-1 ' });
    if (url.pathname.endsWith('/begin')) {
      return jsonResponse({
        errcode: 0,
        device_code: ' device-1 ',
        user_code: 'user-1',
        verification_uri: 'https://h5.dingtalk.com/verify',
        verification_uri_complete: 'https://h5.dingtalk.com/verify?code=one',
        expires_in: 300,
        interval: 3,
      });
    }
    return jsonResponse({
      errcode: 0,
      status: 'success',
      client_id: 'ding-client',
      client_secret: 'host-only-secret',
    });
  };
  const api = createDingtalkApi({ fetchImpl });

  const begun = await api.beginRegistration();
  const polled = await api.pollRegistration({ deviceCode: begun.deviceCode });

  assert.deepEqual(begun, {
    deviceCode: 'device-1',
    userCode: 'user-1',
    verificationUri: 'https://h5.dingtalk.com/verify',
    verificationUriComplete: 'https://h5.dingtalk.com/verify?code=one',
    expiresInSeconds: 300,
    intervalSeconds: 3,
  });
  assert.deepEqual(polled, {
    status: 'SUCCESS',
    failReason: undefined,
    clientId: 'ding-client',
    clientSecret: 'host-only-secret',
  });
  assert.deepEqual(calls.map(({ url, options }) => ({
    path: new URL(url).pathname,
    body: JSON.parse(options.body),
    redirect: options.redirect,
  })), [
    { path: '/app/registration/init', body: { source: 'DING_DWS_CLAW' }, redirect: 'error' },
    { path: '/app/registration/begin', body: { nonce: 'nonce-1' }, redirect: 'error' },
    { path: '/app/registration/poll', body: { device_code: 'device-1' }, redirect: 'error' },
  ]);
});

test('session replies use the fixed token endpoint, reject redirects, and cache access tokens', async () => {
  const calls = [];
  let now = 1_000;
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), options });
    if (url.toString() === `${DINGTALK_API_BASE_URL}v1.0/oauth2/accessToken`) {
      return jsonResponse({ accessToken: 'access-token', expireIn: 7_200 });
    }
    return jsonResponse({ errcode: 0 });
  };
  const api = createDingtalkApi({ fetchImpl, now: () => now });
  const request = {
    clientId: 'ding-client',
    clientSecret: 'host-only-secret',
    sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=opaque',
    text: '回答',
  };

  await api.sendText(request);
  now += 10_000;
  await api.sendText({ ...request, text: '继续' });

  assert.equal(calls.filter(({ url }) => url.includes('/oauth2/accessToken')).length, 1);
  assert.equal(calls.length, 3);
  for (const { options } of calls) assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    appKey: 'ding-client',
    appSecret: 'host-only-secret',
  });
  assert.equal(calls[1].options.headers['x-acs-dingtalk-access-token'], 'access-token');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    msgtype: 'text',
    text: { content: '继续' },
  });
});

test('session webhook validation accepts only HTTPS DingTalk hosts on the default port', () => {
  assert.equal(
    normalizeDingtalkSessionWebhook('https://dingtalk.com/reply?ticket=one'),
    'https://dingtalk.com/reply?ticket=one',
  );
  assert.equal(
    normalizeDingtalkSessionWebhook('https://oapi.dingtalk.com:443/reply?ticket=one'),
    'https://oapi.dingtalk.com/reply?ticket=one',
  );
  for (const value of [
    'http://oapi.dingtalk.com/reply',
    'https://oapi.dingtalk.com.evil.example/reply',
    'https://user@oapi.dingtalk.com/reply',
    'https://oapi.dingtalk.com:8443/reply',
  ]) {
    assert.throws(() => normalizeDingtalkSessionWebhook(value), /不受信任/);
  }
});

test('text splitting prefers line boundaries and never produces oversized chunks', () => {
  const chunks = splitDingtalkText('第一段\n第二段很长\n第三段', 8);
  assert.equal(chunks.join('').replaceAll('\n', ''), '第一段第二段很长第三段');
  assert.ok(chunks.every((chunk) => chunk.length <= 8));
});
