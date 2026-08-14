import * as React from 'react';

import {
  DINGTALK_ENDPOINTS,
  DINGTALK_RPC_CHANNEL,
  formatRemaining,
  normalizeProvisioning,
  normalizeSnapshot,
  presentError,
  safeQrSource,
  unwrapRpcResult,
} from './api.js';
import { installDingtalkStyles } from './styles.js';

const h = React.createElement;
const ACTIVE_PROVISION_STATES = new Set(['pending', 'scanned', 'authorizing', 'creating', 'connecting']);

export const name = 'dingtalk-settings';
export const inject = ['slots', 'connection'];

function DingtalkIcon({ size = 28 }) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 48 48',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
    focusable: 'false',
  }, h('path', {
    fill: 'currentColor',
    d: 'M37.05 22.783c-6.758-5.216-14.378-12.128-22.73-19.538-.655-.585-1.242-.354-1.536.42-1.88 4.973-.058 9.386 2.889 11.932s7.368 4.912 10.058 6.155c.105.049.013.203-.093.163-4.953-2.182-8.397-3.765-13.07-7.368-.497-.388-1.01-.242-1.07.521-.384 4.748 2.657 8.483 6.058 9.745 2.1.781 4.398 1.212 6.53 1.474.109.015.084.178-.027.178-2.747.01-6.058-.654-8.935-1.751-.606-.233-.818.25-.722.633.491 2.008 2.974 5.076 6.926 5.73a12 12 0 0 0 2.228.115c.164 0 .208.089.154.217q-2.685 4.6-2.803 4.797c-.091.152-.036.275.156.275h3.543c.164 0 .264.106.18.246l-4.958 8.196c-.191.328.035.565.395.301s15.212-11.133 15.636-11.448c.195-.142.148-.327-.124-.327h-3.18c-.206 0-.252-.14-.111-.28.14-.141 3.602-3.594 4.837-4.888 1.283-1.35 1.938-3.825-.231-5.498',
  }));
}

const Button = React.forwardRef(function Button(
  { children, kind = 'secondary', className = '', ...props },
  ref,
) {
  return h('button', {
    ...props,
    ref,
    type: 'button',
    className: `ddt-button ${className}`.trim(),
    'data-kind': kind,
  }, children);
});

function Heading({ totals, adding, busy, onAdd, addButtonRef }) {
  return h('div', { className: 'ddt-heading' },
    h('div', { className: 'ddt-headingCopy' },
      h('div', { className: 'ddt-eyebrow' }, 'Channel'),
      h('h2', null, '钉钉机器人'),
      h('p', null, '通过扫码把钉钉机器人接入 DeepSeek Harness')),
    h('div', { className: 'ddt-tools' },
      totals.configured > 0
        ? h('div', { className: 'ddt-badge' },
            h('span', {
              className: 'ddt-dot',
              'data-tone': totals.connected > 0 ? 'success' : 'warning',
            }),
            h('span', null, `${totals.connected} / ${totals.configured} 在线`))
        : null,
      totals.pendingApproval > 0
        ? h('div', { className: 'ddt-badge', 'data-tone': 'attention' },
            `${totals.pendingApproval} 个待批准`)
        : null,
      h('div', {
        className: 'ddt-badge',
        title: '应用密钥只写入 Harness Host 凭据服务，不会发送到浏览器',
      }, '凭据仅保存在本机'),
      h(Button, {
        kind: 'primary',
        onClick: onAdd,
        disabled: adding || busy,
        ref: addButtonRef,
      }, adding ? '正在接入' : '扫码接入钉钉')));
}

function LoadingView() {
  return h('div', { className: 'ddt-card ddt-loading', 'aria-busy': 'true' },
    h('div', { className: 'ddt-spinner' }),
    h('span', null, '正在读取钉钉连接状态…'));
}

function EmptyView({ busy, onStart }) {
  return h('div', { className: 'ddt-card' },
    h('div', { className: 'ddt-cardBody ddt-empty' },
      h('div', null,
        h('div', { className: 'ddt-stateLabel' },
          h('span', { className: 'ddt-dot' }), h('span', null, '尚未接入钉钉机器人')),
        h('h3', null, '扫一次码，自动创建并连接机器人'),
        h('p', null, '授权由钉钉官方页面完成。创建成功后，应用凭据会直接写入 Harness Host，本页面只接收脱敏的连接状态。'),
        h('div', { className: 'ddt-actions' },
          h(Button, { kind: 'primary', onClick: onStart, disabled: busy },
            busy ? '正在生成二维码…' : '生成钉钉二维码'))),
      h('div', { className: 'ddt-brandMark', 'aria-hidden': 'true' },
        h(DingtalkIcon, { size: 68 }))));
}

function QrPanel({ provision, now, busy, onRefresh, onCancel }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const source = safeQrSource(provision.qrCodeDataUrl);
  const remaining = Math.max(0, provision.expiresAt - now);
  const expired = remaining === 0 || provision.status === 'expired';
  const duration = Math.max(1, provision.durationMs ?? 10 * 60_000);
  const progress = Math.round(Math.min(1, remaining / duration) * 100);

  React.useEffect(() => setImageFailed(false), [source]);

  return h('div', { className: 'ddt-card' },
    h('div', { className: 'ddt-cardBody ddt-qrLayout' },
      h('div', { className: 'ddt-qrColumn' },
        h('div', { className: 'ddt-qrFrame' },
          source && !imageFailed
            ? h('img', {
                src: source,
                alt: '用于把钉钉机器人接入 DeepSeek Harness 的一次性二维码',
                onError: () => setImageFailed(true),
              })
            : h('div', { className: 'ddt-qrFallback' }, '二维码图片未就绪，请重新生成。'),
          expired ? h('div', { className: 'ddt-expired' }, '二维码已过期\n请重新生成') : null),
        h('div', { className: 'ddt-countdown' },
          h('div', { className: 'ddt-countdownTop' },
            h('span', null, '二维码有效时间'), h('strong', null, formatRemaining(remaining))),
          h('div', { className: 'ddt-progress', 'aria-hidden': 'true' },
            h('span', { style: { '--ddt-progress': `${progress}%` } })))),
      h('div', { className: 'ddt-qrCopy' },
        h('div', { className: 'ddt-stateLabel' },
          h('span', { className: 'ddt-dot', 'data-tone': expired ? 'error' : 'warning' }),
          h('span', null, expired ? '二维码已失效' : '等待钉钉扫码授权')),
        h('h3', null, expired ? '重新生成二维码后继续' : '使用钉钉 App 完成机器人授权'),
        h('p', null, '扫码后不需要手工复制应用标识或密钥，授权结果会安全返回到本机 Host。'),
        h('ol', { className: 'ddt-steps' },
          h('li', null, '打开钉钉 App，扫描左侧二维码'),
          h('li', null, '在授权页点击“一键创建新机器人”'),
          h('li', null, '保持本页打开，等待机器人自动连接')),
        h('div', { className: 'ddt-brandNotice' },
          '钉钉官方授权页目前可能显示 OpenClaw 品牌，这是官方连接器授权页面，不影响机器人接入 DeepSeek Harness。'),
        h('div', { className: 'ddt-actions' },
          expired
            ? h(Button, { kind: 'primary', onClick: onRefresh, disabled: busy }, '重新生成二维码')
            : null,
          !expired ? h(Button, { onClick: onRefresh, disabled: busy }, '换一个二维码') : null,
          h(Button, { onClick: onCancel, disabled: busy }, '取消')))));
}

function ProgressPanel({ status, busy, onCancel }) {
  const connecting = status === 'connecting';
  const creating = status === 'creating';
  return h('div', { className: 'ddt-card ddt-loading', 'aria-busy': 'true' },
    h('div', { className: 'ddt-spinner' }),
    h('h3', null, connecting
      ? '机器人已创建，正在建立消息连接'
      : creating ? '授权已确认，正在创建钉钉机器人' : '正在确认钉钉授权'),
    h('p', null, connecting
      ? '正在检查钉钉 Stream 长连接，成功后会自动显示为在线。'
      : '请勿关闭本页，钉钉完成授权后将自动继续。'),
    h('div', { className: 'ddt-actions', style: { justifyContent: 'center', marginTop: 14 } },
      h(Button, { onClick: onCancel, disabled: busy }, '取消接入')));
}

function ProvisionError({ provision, busy, onRetry, onClose }) {
  const error = provision.error ?? {
    code: 'DINGTALK_PROVISION_FAILED',
    message: '钉钉机器人没有接入完成',
  };
  return h('div', { className: 'ddt-card' },
    h('div', { className: 'ddt-inlineError', role: 'alert' },
      h('h3', null, provision.status === 'expired' ? '二维码已过期' : '钉钉机器人没有接入完成'),
      h('p', null, error.message),
      h('span', { className: 'ddt-errorCode' }, error.code),
      h('div', { className: 'ddt-actions' },
        h(Button, { kind: 'primary', onClick: onRetry, disabled: busy }, '重新生成二维码'),
        h(Button, { onClick: onClose, disabled: busy }, '关闭'))));
}

function checkedTime(value) {
  if (!value) return '尚未检查';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '刚刚';
  }
}

function SenderAccess({ account, busy, onApprove, onRevoke }) {
  const pending = account.senders.pending;
  const approved = account.senders.approved;
  return h('section', { className: 'ddt-access', 'aria-label': `${account.bot.name}使用者权限` },
    h('div', { className: 'ddt-accessHeader' },
      h('div', null,
        h('h4', null, '允许使用机器人的钉钉账号'),
        h('p', null, '新使用者首次发消息后会出现在这里，须在本机明确批准。')),
      h('span', {
        className: 'ddt-accessCount',
        'data-pending': pending.length > 0 ? 'true' : undefined,
      }, pending.length > 0 ? `${pending.length} 个待批准` : `${approved.length} 个已批准`)),
    pending.length > 0
      ? h('ul', { className: 'ddt-senderList' }, pending.map((sender) => h('li', {
          className: 'ddt-sender', key: sender.requestId,
        },
        h('div', { className: 'ddt-senderIdentity' },
          h('strong', null, sender.displayName),
          h('span', null, `${sender.senderIdMasked} · ${sender.conversationType === 'group' ? '群聊' : '单聊'}`)),
        h(Button, {
          kind: 'primary',
          onClick: () => onApprove(sender),
          disabled: Boolean(busy),
        }, busy === `approve:${sender.requestId}` ? '批准中…' : '批准使用'))))
      : null,
    approved.length > 0 ? h(React.Fragment, null,
      h('div', { className: 'ddt-approvedLabel' }, '已批准'),
      h('ul', { className: 'ddt-senderList' }, approved.map((sender) => h('li', {
        className: 'ddt-sender', key: sender.senderKey,
      },
      h('div', { className: 'ddt-senderIdentity' },
        h('strong', null, sender.displayName),
        h('span', null, sender.senderIdMasked)),
      h(Button, {
        kind: 'quiet',
        onClick: () => onRevoke(sender),
        disabled: Boolean(busy),
      }, busy === `revoke:${sender.senderKey}` ? '撤销中…' : '撤销')))))
      : null,
    pending.length === 0 && approved.length === 0
      ? h('p', { className: 'ddt-noSenders' }, '尚无使用请求。机器人收到第一条消息后，可在此批准发送者。')
      : null);
}

function RemoveConfirmation({ account, busy, onConfirm, onCancel }) {
  const cancelRef = React.useRef(null);
  React.useEffect(() => cancelRef.current?.focus(), []);
  return h('div', {
    className: 'ddt-confirm',
    role: 'alertdialog',
    'aria-label': `移除${account.bot.name}`,
    onKeyDown: (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    },
  },
  h('strong', null, `从 DeepSeek Harness 移除“${account.bot.name}”？`),
  h('p', null, '这会停止消息连接，并删除本机保存的应用凭据、机器人配置、会话映射及使用者批准记录。钉钉开放平台中的机器人不会被自动删除。'),
  h('div', { className: 'ddt-actions' },
    h(Button, { ref: cancelRef, onClick: onCancel, disabled: busy }, '保留机器人'),
    h(Button, { kind: 'danger', onClick: onConfirm, disabled: busy },
      busy ? '正在移除…' : '确认移除接入')));
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
  onRevoke,
}) {
  const state = busy === 'reconnect' ? 'connecting' : account.state;
  const tone = account.connected ? 'success' : state === 'error' ? 'error' : 'warning';
  const stateLabel = account.connected ? '运行正常' : state === 'connecting' ? '正在连接' : '连接未就绪';
  return h('article', { className: 'ddt-card', tabIndex: -1, 'data-bot-id': account.botId },
    h('div', { className: 'ddt-cardBody' },
      h('div', { className: 'ddt-accountTop' },
        h('div', { className: 'ddt-accountIdentity' },
          h('div', { className: 'ddt-avatar', 'aria-hidden': 'true' }, h(DingtalkIcon, { size: 29 })),
          h('div', null,
            h('h3', { title: account.bot.name }, account.bot.name),
            h('p', { title: account.bot.clientIdMasked }, account.bot.clientIdMasked))),
        h('div', { className: 'ddt-health' },
          h('span', { className: 'ddt-dot', 'data-tone': tone }), h('span', null, stateLabel))),
      h('dl', { className: 'ddt-metrics' },
        h('div', { className: 'ddt-metric' }, h('dt', null, '消息通道'),
          h('dd', null, account.connected ? 'Stream 长连接' : '离线')),
        h('div', { className: 'ddt-metric' }, h('dt', null, '收到 / 回复'),
          h('dd', null, `${account.stats.messagesReceived} / ${account.stats.messagesReplied}`)),
        h('div', { className: 'ddt-metric' }, h('dt', null, '最近检查'),
          h('dd', null, checkedTime(account.health.lastCheckedAt)))),
      h(SenderAccess, { account, busy, onApprove, onRevoke }),
      h('div', { className: 'ddt-accountFooter' },
        h('div', { className: 'ddt-summary' }, account.error?.message ?? account.health.summary),
        h('div', { className: 'ddt-actions' },
          h(Button, { onClick: onReconnect, disabled: Boolean(busy) },
            busy === 'reconnect' ? '检查中…' : account.connected ? '检查连接' : '重试连接'),
          h(Button, { kind: 'danger', onClick: onRequestRemove, disabled: Boolean(busy) },
            '移除接入')))),
    removing ? h(RemoveConfirmation, {
      account,
      busy: busy === 'delete',
      onConfirm: onConfirmRemove,
      onCancel: onCancelRemove,
    }) : null);
}

function AccountList(props) {
  return h('section', null,
    h('div', { className: 'ddt-listHeading' },
      h('h3', null, '已接入的钉钉机器人'), h('span', null, `${props.bots.length} 个`)),
    h('ul', { className: 'ddt-list' }, props.bots.map((account) => h('li', { key: account.botId },
      h(AccountCard, {
        account,
        busy: props.busyByBot[account.botId],
        removing: props.removeTarget === account.botId,
        onReconnect: () => props.onReconnect(account),
        onRequestRemove: () => props.onRequestRemove(account),
        onConfirmRemove: () => props.onConfirmRemove(account),
        onCancelRemove: props.onCancelRemove,
        onApprove: (sender) => props.onApprove(account, sender),
        onRevoke: (sender) => props.onRevoke(account, sender),
      })))));
}

const EMPTY_TOTALS = Object.freeze({ configured: 0, connected: 0, pendingApproval: 0 });

export function DingtalkSettingsTab({ rpcCall }) {
  const [model, setModel] = React.useState({
    phase: 'loading', bots: [], totals: EMPTY_TOTALS, revision: 0, error: null,
  });
  const [provision, setProvision] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [busyByBot, setBusyByBot] = React.useState({});
  const [removeTarget, setRemoveTarget] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const [now, setNow] = React.useState(() => Date.now());
  const addButtonRef = React.useRef(null);

  React.useEffect(() => installDingtalkStyles(), []);

  const announce = React.useCallback((message) => {
    setNotice('');
    if (message) window.requestAnimationFrame(() => setNotice(message));
  }, []);

  const invoke = React.useCallback(async (endpoint, payload = {}, signal) => {
    if (typeof rpcCall !== 'function') throw new TypeError('钉钉设置页缺少 RPC 连接');
    return unwrapRpcResult(await rpcCall(endpoint, payload, signal));
  }, [rpcCall]);

  const loadStatus = React.useCallback(async ({ signal, silent = false } = {}) => {
    if (!silent) setModel((current) => ({ ...current, phase: 'loading', error: null }));
    try {
      const snapshot = normalizeSnapshot(await invoke(DINGTALK_ENDPOINTS.status, {}, signal));
      setModel({
        phase: 'ready',
        bots: snapshot.bots,
        totals: snapshot.totals,
        revision: snapshot.revision,
        error: null,
      });
      if (snapshot.provisioning) {
        setProvision((current) => !current || current.attemptId === snapshot.provisioning.attemptId
          ? {
              ...current,
              ...snapshot.provisioning,
              durationMs: current?.durationMs
                ?? Math.max(1, snapshot.provisioning.expiresAt - Date.now()),
            }
          : current);
      }
      return snapshot;
    } catch (error) {
      if (error?.name === 'AbortError') return undefined;
      setModel((current) => ({
        ...current,
        phase: silent && current.phase === 'ready' ? 'ready' : 'error',
        error: presentError(error),
      }));
      return undefined;
    }
  }, [invoke]);

  React.useEffect(() => {
    const controller = new AbortController();
    void loadStatus({ signal: controller.signal });
    return () => controller.abort();
  }, [loadStatus]);

  React.useEffect(() => {
    if (model.phase !== 'ready') return undefined;
    const controller = new AbortController();
    let running = false;
    const timer = window.setInterval(async () => {
      if (running) return;
      running = true;
      await loadStatus({ signal: controller.signal, silent: true });
      running = false;
    }, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadStatus, model.phase]);

  React.useEffect(() => {
    if (!provision || !ACTIVE_PROVISION_STATES.has(provision.status)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [provision?.attemptId, provision?.status]);

  const startProvisioning = React.useCallback(async ({ replace = false } = {}) => {
    setBusy(true);
    try {
      if (replace && provision?.attemptId) {
        await invoke(DINGTALK_ENDPOINTS.cancelProvisioning, {
          attemptId: provision.attemptId,
        });
      }
      setProvision({ status: 'starting' });
      const started = normalizeProvisioning(await invoke(
        DINGTALK_ENDPOINTS.beginProvisioning,
        { locale: 'zh-CN' },
      ));
      if (!started.qrCodeDataUrl) {
        throw new Error('钉钉扫码服务没有返回安全的二维码');
      }
      setNow(Date.now());
      setProvision({
        ...started,
        durationMs: Math.max(1, started.expiresAt - Date.now()),
      });
      announce('钉钉二维码已生成，请使用钉钉 App 扫描。');
    } catch (error) {
      setProvision({
        attemptId: provision?.attemptId,
        status: 'failed',
        error: presentError(error),
      });
    } finally {
      setBusy(false);
    }
  }, [announce, invoke, provision?.attemptId]);

  const cancelProvisioning = React.useCallback(async () => {
    setBusy(true);
    try {
      if (provision?.attemptId && !['failed', 'expired', 'cancelled'].includes(provision.status)) {
        await invoke(DINGTALK_ENDPOINTS.cancelProvisioning, { attemptId: provision.attemptId });
      }
      setProvision(null);
      announce('已取消钉钉机器人接入。');
      window.requestAnimationFrame(() => addButtonRef.current?.focus());
    } catch (error) {
      setProvision((current) => ({ ...current, status: 'failed', error: presentError(error) }));
    } finally {
      setBusy(false);
    }
  }, [announce, invoke, provision?.attemptId, provision?.status]);

  React.useEffect(() => {
    const attemptId = provision?.attemptId;
    if (!attemptId || !ACTIVE_PROVISION_STATES.has(provision.status)) return undefined;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const result = normalizeProvisioning(await invoke(
          DINGTALK_ENDPOINTS.pollProvisioning,
          { attemptId },
          controller.signal,
        ));
        if (result.status === 'connected') {
          const snapshot = await loadStatus({ signal: controller.signal, silent: true });
          const account = result.botId
            ? snapshot?.bots.find((bot) => bot.botId === result.botId)
            : snapshot?.bots.find((bot) => bot.connected);
          if (!account?.connected) {
            setProvision((current) => current?.attemptId === attemptId
              ? { ...current, ...result, status: 'connecting' }
              : current);
            timer = window.setTimeout(poll, result.pollIntervalMs);
            return;
          }
          setProvision(null);
          announce(result.alreadyConnected
            ? '这个钉钉机器人已经接入并保持在线。'
            : '钉钉机器人已接入，可以开始发送消息。');
          return;
        }
        setProvision((current) => current?.attemptId === attemptId
          ? { ...current, ...result, durationMs: current.durationMs }
          : current);
        if (ACTIVE_PROVISION_STATES.has(result.status)) {
          timer = window.setTimeout(poll, result.pollIntervalMs);
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        setProvision((current) => current?.attemptId === attemptId
          ? { ...current, status: 'failed', error: presentError(error) }
          : current);
      }
    };
    timer = window.setTimeout(poll, provision.pollIntervalMs ?? 3_000);
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
      announce(typeof success === 'function' ? success(snapshot) : success);
      return snapshot;
    } catch (error) {
      announce(`操作失败：${presentError(error).message}`);
      return undefined;
    } finally {
      setBotBusy(account.botId, null);
    }
  }, [announce, invoke, loadStatus, setBotBusy]);

  const reconnect = React.useCallback((account) => runBotAction({
    account,
    operation: 'reconnect',
    endpoint: DINGTALK_ENDPOINTS.reconnectBot,
    payload: { botId: account.botId },
    success: (snapshot) => snapshot?.bots.find((bot) => bot.botId === account.botId)?.connected
      ? '钉钉连接检查完成。'
      : '钉钉仍未连接，插件会继续自动重试。',
  }), [runBotAction]);

  const remove = React.useCallback(async (account) => {
    const snapshot = await runBotAction({
      account,
      operation: 'delete',
      endpoint: DINGTALK_ENDPOINTS.deleteBot,
      payload: { botId: account.botId, confirm: true },
      success: '钉钉机器人及本机凭据已移除。',
    });
    if (snapshot) setRemoveTarget(null);
  }, [runBotAction]);

  const approve = React.useCallback((account, sender) => runBotAction({
    account,
    operation: `approve:${sender.requestId}`,
    endpoint: DINGTALK_ENDPOINTS.approveSender,
    payload: { botId: account.botId, requestId: sender.requestId, confirm: true },
    success: `已批准 ${sender.displayName} 使用这个机器人。`,
  }), [runBotAction]);

  const revoke = React.useCallback((account, sender) => runBotAction({
    account,
    operation: `revoke:${sender.senderKey}`,
    endpoint: DINGTALK_ENDPOINTS.revokeSender,
    payload: { botId: account.botId, senderKey: sender.senderKey, confirm: true },
    success: `已撤销 ${sender.displayName} 的使用权限。`,
  }), [runBotAction]);

  let provisionView = null;
  if (provision?.status === 'starting') {
    provisionView = h('div', { className: 'ddt-card ddt-loading', 'aria-busy': 'true' },
      h('div', { className: 'ddt-spinner' }), h('span', null, '正在申请钉钉授权二维码…'));
  } else if (provision?.status === 'pending') {
    provisionView = h(QrPanel, {
      provision,
      now,
      busy,
      onRefresh: () => void startProvisioning({ replace: true }),
      onCancel: () => void cancelProvisioning(),
    });
  } else if (['scanned', 'authorizing', 'creating', 'connecting'].includes(provision?.status)) {
    provisionView = h(ProgressPanel, {
      status: provision.status,
      busy,
      onCancel: () => void cancelProvisioning(),
    });
  } else if (provision && ['failed', 'expired', 'cancelled'].includes(provision.status)) {
    provisionView = h(ProvisionError, {
      provision,
      busy,
      onRetry: () => void startProvisioning({ replace: Boolean(provision.attemptId) }),
      onClose: () => void cancelProvisioning(),
    });
  }

  return h('section', { className: 'ddt-page', 'aria-label': '钉钉设置' },
    h(Heading, {
      totals: model.totals,
      adding: Boolean(provision),
      busy,
      onAdd: () => void startProvisioning(),
      addButtonRef,
    }),
    h('div', { className: 'ddt-visuallyHidden', role: 'status', 'aria-live': 'polite' }, notice),
    model.error && model.phase === 'ready'
      ? h('div', { className: 'ddt-statusNotice', role: 'alert' }, `状态刷新失败：${model.error.message}`)
      : null,
    model.phase === 'loading'
      ? h(LoadingView)
      : model.phase === 'error'
        ? h('div', { className: 'ddt-card' },
            h('div', { className: 'ddt-inlineError', role: 'alert' },
              h('h3', null, '无法读取钉钉机器人状态'),
              h('p', null, model.error?.message ?? '请稍后重试'),
              h(Button, { onClick: () => void loadStatus() }, '重新读取')))
        : h(React.Fragment, null,
            provisionView,
            model.bots.length === 0 && !provision
              ? h(EmptyView, { busy, onStart: () => void startProvisioning() })
              : null,
            model.bots.length > 0
              ? h(AccountList, {
                  bots: model.bots,
                  busyByBot,
                  removeTarget,
                  onReconnect: (account) => void reconnect(account),
                  onRequestRemove: (account) => setRemoveTarget(account.botId),
                  onConfirmRemove: (account) => void remove(account),
                  onCancelRemove: () => setRemoveTarget(null),
                  onApprove: (account, sender) => void approve(account, sender),
                  onRevoke: (account, sender) => void revoke(account, sender),
                })
              : null));
}

export function apply(ctx) {
  ctx.effect(() => installDingtalkStyles(), 'dingtalk-settings: install client styles');
  const rpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(DINGTALK_RPC_CHANNEL, endpoint, payload, signal);
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'dingtalk',
    order: 40,
    label: '钉钉',
    inject: () => ({ rpcCall }),
  }, DingtalkSettingsTab));
}
