import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CLIENT_URL = new URL('../plugin-src/client/index.js', import.meta.url);
const STYLES_URL = new URL('../plugin-src/client/styles.js', import.meta.url);

test('standalone client exports a reusable settings component and registration', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /export const name = 'dingtalk-settings'/);
  assert.match(source, /export const inject = \['slots', 'connection'\]/);
  assert.match(source, /export function DingtalkSettingsTab\(\{ rpcCall \}\)/);
  assert.match(source, /export function apply\(ctx\)/);
  assert.match(source, /ctx\.connection\.rpc\.call\(DINGTALK_RPC_CHANNEL/);
  assert.match(source, /id: 'dingtalk'/);
  assert.match(source, /label: '钉钉'/);
});

test('QR guidance describes the complete official DingTalk authorization flow', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /打开钉钉 App，扫描左侧二维码/);
  assert.match(source, /在授权页点击“一键创建新机器人”/);
  assert.match(source, /保持本页打开，等待机器人自动连接/);
  assert.match(source, /官方授权页目前可能显示 OpenClaw 品牌/);
  assert.match(source, /safeQrSource\(provision\.qrCodeDataUrl\)/);
  assert.doesNotMatch(source, /verificationUrl|打开备用链接/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|window\.open\(/);
});

test('sender approvals require explicit confirmation and never use a raw sender id', async () => {
  const source = await readFile(CLIENT_URL, 'utf8');
  assert.match(source, /payload: \{ botId: account\.botId, requestId: sender\.requestId, confirm: true \}/);
  assert.match(source, /payload: \{ botId: account\.botId, senderKey: sender\.senderKey, confirm: true \}/);
  assert.match(source, /payload: \{ botId: account\.botId, confirm: true \}/);
  assert.doesNotMatch(source, /sender\.senderId\b/);
});

test('the client uses an isolated compact and accessible DingTalk style namespace', async () => {
  const [source, styles] = await Promise.all([
    readFile(CLIENT_URL, 'utf8'),
    readFile(STYLES_URL, 'utf8'),
  ]);
  assert.doesNotMatch(source, /\bdxw-|\bbxf-/);
  assert.doesNotMatch(styles, /\bdxw-|\bbxf-/);
  assert.match(styles, /\.ddt-page \{/);
  assert.match(styles, /--ddt-accent: #1677ff/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /aria-live': 'polite'/);
  assert.match(source, /role: 'alertdialog'/);
});

test('the QR card responds to its plugin panel width instead of the browser viewport', async () => {
  const styles = await readFile(STYLES_URL, 'utf8');
  assert.match(styles, /container-type: inline-size/);
  assert.match(
    styles,
    /@container \(max-width: 680px\)[\s\S]*\.ddt-qrLayout \{ grid-template-columns: minmax\(0, 1fr\); justify-items: center;/,
  );
  assert.match(styles, /\.ddt-qrFrame \{[^\n]*width: min\(270px, 100%\)/);
  assert.match(styles, /\.ddt-countdown \{ width: min\(270px, 100%\)/);
  assert.match(styles, /\.ddt-qrLayout \{[^\n]*align-items: start;/);
  assert.match(styles, /\.ddt-qrColumn \{ width: 100%; min-width: 0; \}/);
  assert.match(styles, /\.ddt-qrCopy \{ min-width: 0; overflow-wrap: anywhere; \}/);
});
