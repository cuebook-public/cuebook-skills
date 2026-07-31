<p align="center">
  <a href="https://cuebook.app">
    <img
      src="https://raw.githubusercontent.com/cuebook-public/cuebook-cli/main/assets/cuebook-cli-logo.png"
      width="200"
      alt="Cuebook"
    />
  </a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<h1 align="center">Cuebook Skills — 面向 AI Agent 的市场观点表达</h1>

<p align="center"><strong>为市场直觉补上结构、证据和未来检查点，同时保留创作者本人的判断与署名。</strong></p>

<p align="center">
  <strong><a href="plugins/cuebook/INSTALL.md">让 AI Agent 安装</a></strong> ·
  <a href="plugins/cuebook/platforms/README.md">选择平台</a>
</p>

Cuebook 是一套面向交易前思考的记忆与表达基础设施。它帮助创作者把直觉整理成清晰、可回看、可结算的 Frame；市场数据、授权、幂等与发布规则由 Cuebook MCP 统一执行。

## 三个公开 Skill

| Skill | 用途 | 写入边界 |
| --- | --- | --- |
| `query-cuebook` | 查询、比较和解释带来源的 Cuebook 情报，也可发现社区 Skill | 只读 |
| `create-cuebook-content` | 把创作者的市场观点整理成一个可发布 Frame | 只有明确意图后才草拟或发布 |
| `author-cuebook-skill` | 打包并提交一个创作者 Skill 进入社区审核 | 明确确认后提交；不会把“已提交”说成“已通过” |

Create 可以调用 Query 获取最小必要证据；Query 不会反向调用 Create。内部研究、指标、视觉与发布模块按需加载，不会全部占用宿主首轮上下文。

## MCP 与 Skill 的关系

Cuebook Plugin 同时提供：

- 连接 `https://cuebook.app/mcp` 的生产 MCP 配置；
- 三个公开 Agent Skill；
- Skill 使用的 schema、验证器和按需参考模块。

MCP 负责数据、鉴权和服务端动作；Skill 负责访谈、证据选择、视觉编排和确认流程。只连接 MCP 的宿主可以调用 Tool，但不会自动获得完整 Skill 工作流。

`cuebook.xyz` 是开发环境，`cuebook.app` 是生产环境。两边的登录和授权状态相互独立；测试环境已登录，不代表生产环境已注册或已授权。

## 社区 Skill 的发现与交接

Cuebook MCP 可以查询已经审核并发布的社区 Skill：

- `list_community_skills` 用于发现；
- `get_community_skill` 用于解析一个明确的 `<handle>--<slug>`；
- Frame 或 handoff 带有发布时 semver 时，可以解析当时对应的审核版本、分发 commit、包 sha256 和版本级能力披露；
- 未提供版本时，解析当前已分发版本。

`<handle>--<slug>` 是稳定 Skill 标识。Claude 兼容 marketplace 命令里的 `@cuebook-community` 是 marketplace 后缀，不是版本号。MCP 查询证明 Skill 可发现、来源可追溯，但不等于 Codex、Claude Code、Hermes 或其他宿主已经完成安装；最终安装或导入由接收方宿主负责。

社区分发仓库见 [cuebook-community-skills](https://github.com/cuebook-public/cuebook-community-skills)。

## 平台支持

| 宿主 | 分发方式 | 能力层 |
| --- | --- | --- |
| Codex App / CLI | Cuebook Plugin | Skills + MCP |
| Claude Code | 原生 Claude Code marketplace | Skills + MCP |
| Cursor | 三个 Agent Skill bundle + 远程 MCP | Skills + MCP |
| Hermes Agent | 三个 Agent Skill bundle + 远程 MCP | Skills + MCP |
| OpenClaw | 三个 Agent Skill bundle + 远程 MCP | Skills + MCP |
| Claude / Claude Desktop | 自定义远程连接器 | MCP |
| ChatGPT | 自定义 MCP app | MCP |
| Grok | 自定义 MCP 连接器 | MCP |

具体安装方式见 [平台说明](plugins/cuebook/platforms/README.md)。

## Claude Code 快速安装

一行完成安装：

```bash
claude plugin marketplace add cuebook-public/cuebook-skills && claude plugin install cuebook@cuebook
```

随后重启 Claude Code 或运行 `/reload-plugins`，再从 `/mcp` 完成一次浏览器授权。
验证、更新与失败处理见 [Claude Code 指南](plugins/cuebook/platforms/claude-code.md)。

## Codex 快速安装

让 AI Agent 在任意受支持平台完成安装时，请从统一的
[Agent 安装入口](plugins/cuebook/INSTALL.md)开始。该入口负责选择当前分发分支、
路由到具体平台，并统一维护身份验证与可用性验证规则。

从 `main` 安装当前稳定版：

```bash
codex plugin marketplace add cuebook-public/cuebook-skills

codex plugin add cuebook@cuebook

# 仅当状态为 not_logged_in 且没有登录正在进行时：
codex mcp list --json
codex mcp login cuebook
codex mcp list --json
```

首次安装时，仅在宿主明确返回 `not_logged_in` 或授权挑战时执行一次登录。浏览器授权页打开并不等于连接成功；`codex mcp list --json` 的状态和新任务中的一次正常 MCP 结果，才是端到端可用证明。

安装或版本更新后，请彻底退出并重启 Codex App，再打开一个新任务。只新建对话但不重启宿主，可能继续使用旧的 Plugin 和 Tool 快照。

如需固定到可复现版本，在 marketplace 命令后加：

```bash
--ref v0.9.22
```

固定 tag 后不会自动跟随 `main`，直到你主动更改 ref。

## 更新

```bash
codex plugin marketplace upgrade cuebook
codex plugin add cuebook@cuebook
codex mcp list --json
```

正常更新不需要卸载 Plugin，也不需要重复 OAuth。只有连接器明确报告未登录、授权被撤销或需要 scope step-up 时，才重新登录。

## 版本分别代表什么

这里有三类不同的版本：

- Plugin release（例如 `0.9.20`）：一次可安装、可回滚的官方发行快照；
- 内部 catalog / schema version：机器契约兼容性，不应随每次文字调整自动改动；
- 社区 Skill semver：审核字节的来源与复现标识，不进入稳定安装名。

本仓库的功能调整先记录在 `CHANGELOG.md` 的 `Unreleased`，到真正准备发布时再统一提升 Plugin release。这样版本号仍然代表一个完整、经过验证的发行物，而不是每次文档编辑都变化。

## 开发与验证

规范源位于 `plugins/cuebook/skills/`；`skills/` 和
`plugins/runtime/cuebook/` 是生成结果，不应手工编辑。

```bash
npm ci
npm run build:release
npm run check
```

分发通道：

```bash
npm run distribution:development # dev → https://cuebook.xyz/mcp
npm run distribution:production  # main/release → https://cuebook.app/mcp
```

根目录中文 README 是显式允许的本地化文档；规范 Skill、schema、测试 fixture 和生成 bundle 仍保持英文，避免把双语说明混入 Agent 运行时上下文。

## 安全边界

- 服务器而不是客户端负责 grant、scope、策略、幂等、准备哈希和发布 token。
- Query 不调用写 Tool，也不会安装社区 Skill。
- Frame 发布、模拟 Paper Trade、记忆提案和社区 Skill 提交都有独立授权边界。
- 不要提交 API key、OAuth token、凭据、用户输出或字体文件。

本项目不提供投资建议。社区 Skill 表达其作者的工作流和观点；安装前应阅读能力披露和 Skill 内容。
