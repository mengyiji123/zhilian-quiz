# 知练（ZhiLian Quiz）

一个面向 iPad 和小规模多人使用的在线刷题平台。支持完整章节进度、错题与收藏、答题统计、AI 快问和 Apple Pencil 临时草稿板。

> 本仓库只开源程序源码，不包含作者的私有题库、题目答案、解析、Word/PDF 原稿或生产环境密钥。仓库内仅提供少量完全虚构的示例题，用于本地演示和数据格式说明。

## 功能

- 科目刷题、整章刷题和随机刷题
- 单选、多选、判断及知识点筛选
- 章节进度自动续刷，完成后可重置
- 多选题漏选项黄色提示
- 错题本、错误次数记录和收藏
- 用户独立答题历史与统计
- 答题卡与已答题目快速跳转
- AI 流式问答与 Markdown 安全渲染
- AI 接口 URL、模型和 Key 后台配置
- Apple Pencil 临时草稿板，关闭即清空
- 最多 5 个启用账号的轻量管理
- iPad 响应式布局与 PWA 安装

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Web | Vue 3、TypeScript、Vite、Pinia、Vue Router、PWA |
| API | Express 5、TypeScript、Zod、mysql2 |
| 数据库 | MySQL 8 |
| 安全 | bcrypt、HttpOnly Session Cookie、Helmet、限流、AES-256-GCM |
| 部署 | Nginx、systemd、HTTPS（不依赖 Docker） |

## 项目结构

```text
apps/web                 Vue 前端
apps/api                 Express API
database/schema.sql      MySQL 表结构
data/questions.example.json
                         虚构示例题与数据格式参考
deploy                   Nginx、systemd 和环境变量模板
```

## 快速预览（无需 MySQL）

要求 Node.js 24+、pnpm 11+。

```bash
pnpm install
pnpm demo
```

浏览器打开 `http://localhost:5173`。演示模式使用仓库内的虚构示例题，所有操作只保存在内存或当前浏览器中，停止服务后重置，也不会调用真实 AI。

## 使用 MySQL 运行

1. 复制环境变量：

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell 可使用：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 生成用于加密 AI Key 的随机密钥：

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   将输出写入 `.env` 的 `APP_ENCRYPTION_KEY`，并设置数据库连接和初始管理员密码。

3. 创建数据库及专用用户：

   ```sql
   CREATE DATABASE shuati CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'quiz_user'@'127.0.0.1' IDENTIFIED BY '请替换为强密码';
   GRANT ALL PRIVILEGES ON shuati.* TO 'quiz_user'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

4. 准备自己的题库数据。复制示例文件后替换其中的虚构内容：

   ```bash
   cp data/questions.example.json data/questions.json
   ```

   `data/questions.json` 默认被 Git 忽略，不会意外提交。也可以通过 `QUESTION_DATA_PATH` 指定其他 JSON 文件；字段结构见 [`data/questions.example.json`](data/questions.example.json)。

5. 初始化并启动：

   ```bash
   pnpm db:schema
   pnpm db:seed
   pnpm dev
   ```

## AI 快问

管理员可在系统管理页配置兼容以下任一请求/响应结构的外部服务：

- OpenAI Chat Completions
- OpenAI Responses

需要填写完整接口 URL、模型 ID、API Key 和系统提示词。API Key 使用 `APP_ENCRYPTION_KEY` 经 AES-256-GCM 加密后存入 MySQL，浏览器不会收到明文 Key。用户提交答案并看到解析后才能询问当前题目。

## 生产部署（无 Docker）

推荐由 systemd 运行 Node.js API，Nginx 提供前端静态文件、代理 `/api` 并终止 HTTPS。完整步骤见 [`deploy/DEPLOY_NO_DOCKER.md`](deploy/DEPLOY_NO_DOCKER.md)。

生产环境至少应设置：

```dotenv
COOKIE_SECURE=true
TRUST_PROXY=true
```

不要把 API 的 `3001` 端口直接暴露到公网，也不要提交 `.env`、真实题库或数据库备份。

## 常用命令

```bash
pnpm dev          # 启动前后端开发服务
pnpm demo         # 使用虚构示例题预览，不连接 MySQL
pnpm typecheck    # TypeScript/Vue 类型检查
pnpm test         # 单元测试
pnpm build        # 生产构建
pnpm db:schema    # 应用 MySQL 表结构
pnpm db:seed      # 导入或更新自备题库
```

## 许可证

程序源码使用 [MIT License](LICENSE) 开源。你导入的题库内容仍由其各自权利人所有，使用者需自行确认数据来源与授权。

