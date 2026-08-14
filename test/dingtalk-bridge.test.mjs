import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDingtalkBridgeStatus,
  DingtalkHarnessBridge,
  PENDING_SENDER_REPLY,
} from '../src/dingtalk-bridge.mjs';

function message(id, text, overrides = {}) {
  return {
    msgId: id,
    msgtype: 'text',
    text: { content: text },
    conversationType: '1',
    conversationId: `conversation-${id}`,
    senderStaffId: 'staff-approved',
    senderNick: '已批准用户',
    sessionWebhook: `https://oapi.dingtalk.com/robot/reply?ticket=${id}`,
    ...overrides,
  };
}

function stateFixture() {
  const sessions = new Map();
  const seen = new Set();
  const pending = new Map();
  return {
    sessions,
    seen,
    pending,
    state: {
      hasSeen: (id) => seen.has(id),
      markSeen: async (id) => seen.add(id),
      sessionFor: (key) => sessions.get(key) ?? null,
      setSession: async (key, sessionId) => sessions.set(key, sessionId),
      clearSession: async (key) => sessions.delete(key),
      pendingSenders: () => [...pending.values()].map((entry) => structuredClone(entry)),
      recordPendingSender: async ({ staffId, displayName, lastSeenAt }) => {
        const existing = [...pending.values()].find((entry) => entry.staffId === staffId);
        const entry = {
          requestId: existing?.requestId ?? `request-${staffId}`,
          staffId,
          displayName,
          requestedAt: existing?.requestedAt ?? lastSeenAt,
          lastSeenAt,
        };
        pending.set(entry.requestId, entry);
        return structuredClone(entry);
      },
      removePendingSenderByStaffId: async (staffId) => {
        const entry = [...pending.values()].find((value) => value.staffId === staffId);
        if (!entry) return false;
        pending.delete(entry.requestId);
        return true;
      },
    },
  };
}

test('bridge maps an approved DingTalk direct conversation to one persistent Harness session', async () => {
  const fixture = stateFixture();
  const sent = [];
  const asked = [];
  const status = createDingtalkBridgeStatus();
  const bridge = new DingtalkHarnessBridge({
    api: { sendText: async (request) => sent.push(request) },
    clientId: 'ding-client',
    clientSecret: 'host-secret',
    approvedSenders: [{ staffId: 'staff-approved' }],
    harness: {
      sessionExists: async (sessionId) => sessionId === 'session-one',
      createSession: async () => 'session-one',
      ask: async (sessionId, text) => {
        asked.push({ sessionId, text });
        return 'Harness 回答';
      },
    },
    state: fixture.state,
    status,
  });

  await Promise.all([
    bridge.accept(message('one', '你好')),
    bridge.accept(message('one', '重复消息')),
  ]);
  await bridge.accept(message('two', '继续'));

  assert.equal(fixture.sessions.get('p2p:staff-approved'), 'session-one');
  assert.deepEqual(asked, [
    { sessionId: 'session-one', text: '你好' },
    { sessionId: 'session-one', text: '继续' },
  ]);
  assert.deepEqual(sent.map(({ text, sessionWebhook }) => ({ text, sessionWebhook })), [
    { text: 'Harness 回答', sessionWebhook: 'https://oapi.dingtalk.com/robot/reply?ticket=one' },
    { text: 'Harness 回答', sessionWebhook: 'https://oapi.dingtalk.com/robot/reply?ticket=two' },
  ]);
  assert.equal(status.messagesReceived, 2);
  assert.equal(status.messagesReplied, 2);
  assert.equal(status.stats.messagesReplied, 2);
});

test('unapproved senders become host-only pending requests and never enter Harness', async () => {
  const fixture = stateFixture();
  const sent = [];
  let harnessCalls = 0;
  const status = createDingtalkBridgeStatus();
  const bridge = new DingtalkHarnessBridge({
    api: { sendText: async (request) => sent.push(request) },
    clientId: 'ding-client',
    clientSecret: 'host-secret',
    approvedSenders: [],
    harness: {
      sessionExists: async () => { harnessCalls += 1; },
      createSession: async () => { harnessCalls += 1; },
      ask: async () => { harnessCalls += 1; },
    },
    state: fixture.state,
    status,
  });

  await bridge.accept(message('pending', '未批准问题', {
    senderStaffId: 'raw-staff-id',
    senderNick: '待批准用户',
  }));

  assert.equal(harnessCalls, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, PENDING_SENDER_REPLY);
  assert.deepEqual(status.pendingSenders, [{
    requestId: 'request-raw-staff-id',
    staffId: 'raw-staff-id',
    displayName: '待批准用户',
    requestedAt: status.lastRejectedAt,
    lastSeenAt: status.lastRejectedAt,
  }]);
  assert.doesNotMatch(JSON.stringify(status.pendingSenders), /sessionWebhook|ticket=pending/);
  assert.equal(status.messagesRejected, 1);
});

test('group messages require an explicit bot mention before authorization or Harness work', async () => {
  const fixture = stateFixture();
  const sent = [];
  const asked = [];
  const bridge = new DingtalkHarnessBridge({
    api: { sendText: async (request) => sent.push(request) },
    clientId: 'ding-client',
    clientSecret: 'host-secret',
    approvedSenders: [{ staffId: 'staff-approved' }],
    harness: {
      sessionExists: async () => true,
      createSession: async () => 'session-group',
      ask: async (_sessionId, text) => {
        asked.push(text);
        return '群聊回答';
      },
    },
    state: fixture.state,
  });
  const group = {
    conversationType: '2',
    conversationId: 'group-one',
  };

  await bridge.accept(message('not-mentioned', '群聊噪音', { ...group, isInAtList: false }));
  await bridge.accept(message('mentioned', '明确问题', { ...group, isInAtList: true }));

  assert.deepEqual(asked, ['明确问题']);
  assert.deepEqual(sent.map(({ text }) => text), ['群聊回答']);
  assert.equal(bridge.status.messagesIgnored, 1);
  assert.equal(fixture.sessions.get('group:group-one'), 'session-group');
});

test('commands stay local and unsafe session webhooks are rejected before Harness', async () => {
  const fixture = stateFixture();
  fixture.sessions.set('p2p:staff-approved', 'old-session');
  const sent = [];
  let asked = 0;
  const bridge = new DingtalkHarnessBridge({
    api: { sendText: async (request) => sent.push(request.text) },
    clientId: 'ding-client',
    clientSecret: 'host-secret',
    approvedSenders: [{ staffId: 'staff-approved' }],
    harness: {
      ensureRunning: async () => true,
      sessionExists: async () => true,
      ask: async () => { asked += 1; },
    },
    state: fixture.state,
    logger: { warn() {}, error() {} },
  });

  await bridge.accept(message('new', '/new'));
  assert.equal(fixture.sessions.has('p2p:staff-approved'), false);
  await bridge.accept(message('unsafe', '不应执行', {
    sessionWebhook: 'https://oapi.dingtalk.com.attacker.example/reply?private=one',
  }));
  assert.equal(asked, 0);
  assert.equal(sent[0], '已开启新会话。请发送你的问题。');
  assert.equal(sent.length, 1);
  assert.equal(bridge.status.lastError, '钉钉消息没有安全的回复地址。');
});
