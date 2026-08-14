import { DingtalkDeviceAuth } from '../src/device-auth.mjs';

const result = await new DingtalkDeviceAuth().start({
  signal: AbortSignal.timeout(15_000),
});
if (!result.deviceCode
  || !result.verificationUrl
  || !Number.isFinite(result.expiresAt)
  || !Number.isFinite(result.pollIntervalMs)) {
  throw new Error('DingTalk registration endpoint returned incomplete metadata');
}

console.log(
  `DingTalk QR registration protocol is available (poll interval ${result.pollIntervalMs}ms).`,
);
