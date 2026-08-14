# dsh-dingtalk

[中文](#中文) · [English](#english)

## 中文

通过钉钉扫码创建并授权机器人，把它接入 DeepSeek Harness。插件运行在 `dsh web` 的 Host 进程内：设置页只显示一次性二维码和脱敏状态，扫码得到的 `client_secret` 直接写入 Harness 凭据服务，随后由 Host 通过钉钉 Stream 长连接收消息并把 Harness 回答发回钉钉。

### 前提条件

- DeepSeek Harness `0.1.0-rc.6`，Node.js `>=22.19`；
- 手机安装钉钉 App，扫码账号有权创建机器人；
- 运行 Harness 的设备能够访问 `*.dingtalk.com`。

### 安装与扫码接入

推荐安装包含微信、飞书和钉钉的统一插件：

```bash
npx -y github:xmanrui/dsh-im install
```

也可以只安装钉钉渠道：

```bash
npx -y github:xmanrui/dsh-dingtalk install
```

安装后重启 `dsh web`，然后：

1. 打开「设置 → 插件 → IM机器人 → 钉钉」；
2. 点击「扫码接入钉钉」；
3. 使用手机钉钉扫描页面二维码；
4. 在钉钉授权页点击「一键创建新机器人」；
5. 等待页面自动显示机器人已连接；
6. 在钉钉里私聊机器人，回到本机 Harness 页面批准该使用者，再次发送消息。

钉钉当前把该扫码入口命名为 OpenClaw 注册流程，因此官方授权页可能显示 OpenClaw 品牌。插件只复用钉钉公开的机器人创建授权协议；扫码后的机器人连接、凭据保存、消息处理和会话均由 DeepSeek Harness 管理。

可以重复扫码添加多个钉钉机器人。每个机器人拥有独立凭据引用、Stream 连接、消息去重记录和 Harness 会话映射；一个机器人重连或移除不会影响其他机器人。

### 为什么首次消息还要在本机批准

钉钉扫码结果只返回机器人 `client_id` 和 `client_secret`，不会返回扫码人的 staff ID。插件不能安全地假定第一位发消息的人就是管理员。未批准使用者的消息只会收到固定提示，不会进入 Harness；本机设置页批准后，该使用者才能驱动 Harness。请同时在钉钉开放平台限制机器人的可见范围。

### 消息行为

- 支持钉钉私聊文字消息；群聊仅处理已批准使用者明确 @ 机器人的文字；
- 每个会话映射到持久 Harness 会话，支持连续对话；
- `/new` 开启新会话，`/status` 检查连接，`/help` 显示帮助；
- Harness 回答较长时会拆成多条钉钉文本；
- 当前不把图片、文件、视频或语音送入 Harness。

### 安全设计

- 浏览器永远不会收到或提交 `client_secret`、`device_code`、凭据引用或原始 staff ID；
- Host RPC 仅允许 Harness loopback 页面调用；
- `client_secret` 只保存在 `ctx.credentials`，非敏感配置位于 `$DSH_HOME/integrations/dsh-dingtalk/config.json`；
- 入站消息先向钉钉确认接收，再排队交给 Harness，避免长任务触发重复投递；
- 会话 Webhook 只在内存中使用，必须是钉钉 HTTPS 域名，不写入配置或日志；
- 删除机器人会停止它自己的 Stream 连接，并删除自己的凭据、配置、去重记录和会话映射。

### 本地开发与验证

```bash
git clone https://github.com/xmanrui/dsh-dingtalk.git
cd dsh-dingtalk
npm install
npm run check
node bin/dsh-dingtalk.mjs install --source .
```

只验证钉钉扫码注册端点是否仍兼容，不打印或保存二维码和凭据内容：

```bash
npm run verify:protocol
```

完整人工验收需要在 Harness 设置页完成一次手机扫码，在钉钉中发送测试消息、在本机批准使用者，再确认 Harness 回答返回钉钉。

### 协议来源与许可

扫码注册协议参考钉钉官方 MIT 项目 [`DingTalk-Real-AI/dingtalk-openclaw-connector`](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)，消息长连接使用官方 [`dingtalk-stream`](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)。本项目不依赖 OpenClaw 运行时，具体来源版本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目本身使用 MIT License。

## English

Connect DingTalk bots to DeepSeek Harness through QR-code creation and authorization. The settings page receives only a one-time QR image and redacted status. The resulting `client_secret` is written directly to the Harness credential provider, and the Host uses DingTalk Stream for inbound messages and replies.

### Install and connect

Install the combined IM plugin:

```bash
npx -y github:xmanrui/dsh-im install
```

Or install only this channel:

```bash
npx -y github:xmanrui/dsh-dingtalk install
```

Restart `dsh web`, open **Settings → Plugins → IM Bot → DingTalk**, generate the QR code, scan it with the DingTalk app, and select **Create a new bot** on the authorization page. The DingTalk-hosted page may currently display OpenClaw branding because DingTalk exposes this registration flow under that name; the resulting bot is connected to DeepSeek Harness by this plugin.

DingTalk does not return the scanning user's staff ID. After the Stream connection is ready, send the bot a direct message and approve that sender locally in Harness. Unapproved messages never enter Harness. Limit the bot's visibility in the DingTalk developer console as an additional safeguard.

The plugin supports approved direct-message text and group text that explicitly mentions the bot. It keeps credentials, Stream connections, deduplication, and Harness sessions isolated per bot. See the Chinese section for the complete security model and verification commands.
