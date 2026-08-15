# dsh-dingtalk

[中文](#中文) · [English](#english)

## 中文

通过钉钉扫码创建并授权机器人，把它接入 DeepSeek Harness。插件运行在 `dsh web` 的 Host 进程内：设置页只显示一次性二维码和脱敏状态，扫码得到的 `client_secret` 直接写入 Harness 凭据服务，随后由 Host 通过钉钉 Stream 长连接收消息并把 Harness 回答发回钉钉。

### 前提条件

- DeepSeek Harness `0.1.0-rc.6`，Node.js `>=22.19`；
- 手机安装钉钉 App，扫码账号已加入一个企业/组织并有权创建机器人；
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
3. 使用已加入企业/组织的钉钉账号扫描页面二维码；
4. 在钉钉授权页点击「一键创建新机器人」；
5. 等待页面自动显示机器人已连接；
6. 在钉钉里私聊机器人，消息会直接进入 Harness。

钉钉当前把该扫码入口命名为 OpenClaw 注册流程，因此官方授权页可能显示 OpenClaw 品牌。插件只复用钉钉公开的机器人创建授权协议；扫码后的机器人连接、凭据保存、消息处理和会话均由 DeepSeek Harness 管理。

若扫码后提示“该账号还未加入组织”，可在钉钉提示页创建企业/组织/团队，或重新登录并换用已加入组织的账号，然后返回 Harness 重新扫码。

可以重复扫码添加多个钉钉机器人。每个机器人拥有独立凭据引用、Stream 连接、消息去重记录和 Harness 会话映射；一个机器人重连或移除不会影响其他机器人。

### 访问范围

插件不再要求 Harness 本机二次批准发送者。能在钉钉中向机器人发送消息的使用者，其文字消息会直接进入 Harness。请在钉钉开放平台中把机器人可见范围限制为信任的组织、群或成员；该可见范围就是本插件的入站访问控制范围。

### 消息行为

- 支持钉钉私聊文字消息；群聊仅处理明确 @ 机器人的文字；
- 每个会话映射到持久 Harness 会话，支持连续对话；
- `/new` 开启新会话，`/status` 检查连接，`/help` 显示帮助；
- Harness 回答通过同一张钉钉 AI Card 持续更新，生成结束后在原卡片中显示完整答案；
- AI Card 创建、更新或完成失败时自动降级为普通钉钉文本，不会重新执行 Harness 请求；
- 当前不把图片、文件、视频或语音送入 Harness。

### 安全设计

- 浏览器永远不会收到或提交 `client_secret`、`device_code`、凭据引用或原始 staff ID；
- Host RPC 仅允许 Harness loopback 页面调用；
- `client_secret` 只保存在 `ctx.credentials`，非敏感配置位于 `$DSH_HOME/integrations/dsh-dingtalk/config.json`；
- 入站访问权由钉钉机器人的可见范围决定，插件不在 Harness 本机重复建立发送者白名单；
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

完整人工验收需要在 Harness 设置页完成一次手机扫码，然后在钉钉中发送测试消息，确认 Harness 回答返回钉钉。

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

The scanning DingTalk account must already belong to an enterprise or organization and have permission to create a bot. If DingTalk reports that the account has not joined an organization, create one from that prompt or sign in with an account that already belongs to one, then scan again.

Restart `dsh web`, open **Settings → Plugins → IM Bot → DingTalk**, generate the QR code, scan it with the DingTalk app, and select **Create a new bot** on the authorization page. The DingTalk-hosted page may currently display OpenClaw branding because DingTalk exposes this registration flow under that name; the resulting bot is connected to DeepSeek Harness by this plugin.

DingTalk visibility is the inbound access-control scope. Any user who can message the bot can send text directly into Harness; there is no second sender-approval step on the Harness host. Restrict the bot's visibility to trusted organizations, groups, or members in the DingTalk developer console.

The plugin supports direct-message text and group text that explicitly mentions the bot. Harness replies update one DingTalk AI Card while generation is in progress and finalize that same card with the complete answer. If card delivery fails, the plugin falls back to ordinary DingTalk text without running the Harness request again. It keeps credentials, Stream connections, deduplication, and Harness sessions isolated per bot. See the Chinese section for the complete security model and verification commands.
