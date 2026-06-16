# 常见问题 FAQ

---

## 安装与环境

**Q：`npm install` 报 better-sqlite3 编译失败**

better-sqlite3 是原生模块，需要本地编译环境：
- Windows：安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选「C++ 桌面开发」工作负载）
- 安装 Python 3.x（node-gyp 依赖）
- 确认 Node.js ≥ 18

安装后重新运行 `npm install`。**不要**用 sql.js 等替代品绕过，better-sqlite3 是锁定的技术选型。

**Q：`npm run dev` 启动后窗口空白**

通常是主进程崩溃。查看终端输出，常见原因：
- 数据库路径权限问题（`%APPDATA%\SkillBooster\` 目录）
- Node.js 版本低于 18

---

## LLM 配置

**Q：支持哪些 LLM 服务**

任何 OpenAI 兼容接口均可：
- OpenAI（`https://api.openai.com/v1`）
- Azure OpenAI
- DeepSeek（`https://api.deepseek.com/v1`）
- 阿里云 Qwen
- 本地 Ollama（`http://localhost:11434/v1`）
- 其他兼容 `/chat/completions` 端点的服务

**Q：三个智能体必须用同一个模型吗**

不必须。进入「设置 → 智能体配置」可以为引导/萃取/验证三个 Agent 各自配置不同的 Provider 和模型。建议萃取 Agent 用支持 function calling 的强模型，引导 Agent 可以用轻量快速模型降低成本。

**Q：模型报错"不支持 function calling"**

SkillBooster 会自动检测并切换为 JSON 降级协议（基于提示词约定输出格式），功能基本一致，略微影响响应速度。无需手动干预。

**Q：遇到 429 限流错误**

系统内置退避重试（5s / 21s / 30s 三次），通常会自动恢复。如持续限流，说明模型 API 用量触及速率上限，等待约 1 分钟后重试。

---

## 经验萃取

**Q：智能体说话但画布没有变化**

可能原因：
- 智能体当轮只做了分析/追问，还没到操作画布的步骤——继续对话
- 模型降级 JSON 协议时，工具解析偶尔失败——下一轮继续即可，不会丢失已有内容

**Q：幽灵积木是什么**

智能体根据对话归纳推断的内容，以半透明虚线积木呈现。这是"提议"而非"事实"——需要你判断并在积木上点「✓ 采纳」或「✗ 拒绝」。采纳后积木实体化进入画布；拒绝后消失。

**Q：如何让智能体重点萃取某一类知识**

直接在对话中告诉智能体："请重点补充规则类的判断条件" 或 "洞察类还太少，帮我挖一下"。系统会追踪三类知识的覆盖情况并驱动追问。

**Q：参考文档上传后智能体没有引用**

参考文档由智能体通过 `search_references` 工具主动检索。你可以直接提示：「请先读参考文档，再开始萃取」或「参考文档里有关于 X 的内容，请提取」。

**Q：对话记录能导出吗**

当前版本不支持独立导出对话记录。对话内容存储在本地数据库，随场景保留。

---

## 画布操作

**Q：不小心删了节点，能恢复吗**

可以。`Ctrl+Z` 撤销（最多 50 步）。画布操作全部支持撤销/重做。

**Q：节点太多，画布很乱**

- 使用右下角小地图导航
- 画布支持缩放（`Ctrl+滚轮` 或触控板捏合）
- 可以按住空格 + 拖拽平移画布

**Q：概念/关系类型的积木在哪里**

当前版本（v0.1）只启用流程、规则、洞察三类。概念/关系为企业级知识建模特性，暂未开放，数据模型已预留，后续版本会启用。

---

## 数据与隐私

**Q：数据存在哪里**

全部在本地：
- Windows：`%APPDATA%\SkillBooster\`
- macOS：`~/Library/Application Support/SkillBooster/`

包含：`skillbooster.db`（SQLite）、`canvas/`（经验卡 JSON）、`references/`（文档副本）

**Q：API Key 安全吗**

API Key 只存在本地 SQLite 数据库中，不写入日志文件，界面显示时掩码处理。所有 LLM 请求由主进程（后台）发起，Key 不会出现在渲染进程或网络请求日志里。

**Q：能备份数据吗**

直接复制上述用户数据目录即可。恢复时粘贴回同路径。

---

## A/B 验证

**Q：验证时两侧回答差别不大**

可能原因：
- 经验画布内容还不够丰富——回到工作台继续萃取
- 测试问题太宽泛——换一个考验具体判断力的专业问题
- 模型本身知识已覆盖该领域——尝试更细分、更有个人风格的经验场景

**Q：验证用的是哪个模型**

使用验证 Agent 的配置（「设置 → 智能体配置 → 验证」）；未单独配置则用全局默认。裸模型和带 Skill 模型用同一个基础模型，差异来自是否注入 SKILL.md 内容。

---

## Skill 包使用

**Q：导出的 SKILL.md 怎么用**

将 `SKILL.md` 的全部内容作为 system prompt（系统提示词）注入对话：
- **API 方式**：`messages[0] = { role: "system", content: skill_md_content }`
- **Dify / FastGPT / Coze**：粘贴到「系统提示词」输入框
- **ChatGPT**：粘贴到自定义 GPT 的 Instructions
- **Claude.ai**：粘贴到 Project Instructions

**Q：experience-card.json 有什么用**

结构化经验数据，供程序化读取。如果你在开发 RAG 应用或知识库系统，可以直接解析这个 JSON 而不是手工处理 Markdown。
