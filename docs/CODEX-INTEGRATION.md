# Codex Provider 对接约定（已收敛）

> 状态：**方案已定，实现暂缓**（暂无 Codex 账号，后续按本文直接接入，无需重规划）

## 1. 结论

白皮书流水线 **成稿 · 写稿** 的 Codex 接入方式固定为：

| 项 | 约定 |
|----|------|
| Provider 名称 | `codex-cli`（实现时可保留 CLI 别名 `codex`） |
| 认证方式 | **ChatGPT 登录 + 个人/团队 Pro 套餐额度** |
| **不用** | OpenAI Platform `API Key`（按量另计费，不进 ChatGPT 订阅） |
| 调用形态 | `codex exec` 非交互执行（与 `cursor-sdk` 的 `Agent.prompt` 并列） |
| Prompt / 规程 | 与 `cursor-sdk` **共用** `buildPhase3bPrompt`、`docs/narrative-guide.md`、输入输出路径约定 |

## 2. 为何不用「Codex API Key 按量」

- 个人 Pro $200 的 Codex 额度绑定 **ChatGPT 账号登录态**，不是 Platform API Key。
- `CODEX_API_KEY` / OpenAI Platform Key 走 **标准 API 按 token 计费**，不计入 ChatGPT 订阅。
- 因此本项目的 Codex 路径目标是 **套餐内自动化**，不是复制 Cursor `CURSOR_API_KEY` 模式。

## 3. 登录与无人值守（个人版）

### 3.1 推荐模式（本机流水线）

1. 账号主人在 **跑流水线的同一台机器** 执行一次：`codex login`（选 Sign in with ChatGPT）。
2. 登录态缓存于 `~/.codex/auth.json`（或 `CODEX_HOME` 指定目录）。
3. 流水线调用 `codex exec` 时 **自动复用** 该登录态，消耗 Pro 套餐额度。
4. 同一主人本机同时使用 Codex App 写代码 **不算账号共享**；但 **套餐额度共用**，需错开大批量无人值守时段。

### 3.2 凭证文件约定（实现时）

```
secrets/.codex/auth.json    # 可选：从 ~/.codex/auth.json 同步；等同密码，勿提交 Git
```

`.gitignore` 已忽略 `secrets/` 下敏感文件；实现 Provider 时补充 `secrets/.codex/`。

### 3.3 不采用（除非后续明确变更）

- 把同事 ChatGPT 密码交给他人使用。
- 默认用 OpenAI Platform API Key 跑 `codex exec`（除非作为超额兜底且接受按量费用）。
- Enterprise Access Token（当前无企业账号，暂不规划）。

## 4. 与现有 Provider 抽象的关系

```
run-phase3b.js
  ├─ manual          → 只写 phase3b-prompt.md，人工在 IDE 执行
  ├─ cursor-sdk      → Agent.prompt + CURSOR_API_KEY（当前默认）
  └─ codex-cli       → codex exec + ChatGPT 登录态（待实现）
```

`scripts/narrative/phase3b.js` 中 `runCodexProvider()` 预留位，实现时：

1. 生成与 `cursor-sdk` 相同的 prompt（或 `phase3b-prompt.md`）。
2. `spawn('codex', ['exec', '--sandbox', 'workspace-write', '-o', outputPath, prompt])`。
3. `CODEX_HOME` 指向 `secrets/.codex` 或默认 `~/.codex`。
4. 失败时提示「请在本机执行 codex login（ChatGPT，非 API Key）」。

## 5. 配置占位（`config/systems.local.yaml`）

```yaml
narrative:
  provider: cursor-sdk          # 当前
  # provider: codex-cli         # 后续切换
  defaultModel: composer-2.5    # Cursor 侧
  codexModel: gpt-5.3-codex     # Codex 侧（以实现时 Cursor.models.list / codex models 为准）
  codexHome: secrets/.codex     # 可选
```

## 6. 参考链接

- [Codex Authentication](https://developers.openai.com/codex/auth)
- [Codex Non-interactive (`codex exec`)](https://developers.openai.com/codex/noninteractive)
- [Codex Pricing（ChatGPT 登录 vs API Key）](https://developers.openai.com/codex/pricing)
