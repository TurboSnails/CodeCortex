# CodeCortex Gateway

本地网关：接收 Claude Code 的 hooks 事件，通过 WebSocket 实时推送给 UI。完全被动监听，不包装、不 spawn Claude Code 进程。

## 启动

```bash
npm install
npm run dev      # 开发模式，文件变更自动重启
# 或
npm start        # 直接运行
```

默认监听 `http://127.0.0.1:4317`（只绑定 localhost，可通过 `PORT` 环境变量改端口）。

## 接入 Claude Code

将 `hooks/settings.example.json` 中的 `hooks` 字段合并进你的 `~/.claude/settings.json`（**不要直接覆盖**，与已有配置手动合并）。

每个 hook 命令把 stdin 收到的 JSON 原样 POST 给网关的 `/hooks` 端点，并且：
- 设置了 `--max-time 2` 超时，网关无响应也不会卡住 CC
- 以 `|| true` 结尾，保证命令始终以退出码 0 结束——网关未运行或请求失败都不会影响 CC 的工具调用或正常执行

## 测试

```bash
npm test
```
