import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'lib/index.js',
  'lib/client.js',
  'bin/dsh-dingtalk.mjs',
  'cordis.patch.yml',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
];
await Promise.all(required.map((path) => access(resolve(root, path))));

const [client, host, patch, executable] = await Promise.all([
  readFile(resolve(root, 'lib/client.js'), 'utf8'),
  readFile(resolve(root, 'lib/index.js'), 'utf8'),
  readFile(resolve(root, 'cordis.patch.yml'), 'utf8'),
  stat(resolve(root, 'bin/dsh-dingtalk.mjs')),
]);
if (!client.includes('id: "@xmanrui/dsh-dingtalk"')) {
  throw new Error('client bundle does not register the package loader id');
}
if (!host.includes('dsh-dingtalk-host')) throw new Error('host bundle does not contain the plugin entry');
if (!host.includes('dingtalk-stream')) throw new Error('host bundle does not use the official DingTalk Stream SDK');
if (!patch.includes("name: '@xmanrui/dsh-dingtalk'")) {
  throw new Error('bundle patch does not activate the package');
}
if ((executable.mode & 0o111) === 0) throw new Error('dsh-dingtalk CLI is not executable');
if (/clientSecret\s*[:=]\s*["'][^"']{10,}|must-not-leak|DEEPSEEK_API_KEY=/.test(client + host)) {
  throw new Error('built artifacts contain a credential or test-secret marker');
}
for (const forbidden of ['deviceCode', 'clientSecret', 'secretRef', 'senderStaffId']) {
  if (client.includes(forbidden)) throw new Error(`client bundle contains forbidden field ${forbidden}`);
}
console.log('Verified dsh-dingtalk package artifacts.');
