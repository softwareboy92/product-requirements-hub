# ProductFlow

本地私有化的个人产品需求管理工作台。它面向单人使用，聚合需求、任务和项目进度；不包含组织、成员、角色或协作权限。

## 特性

- 今日工作台：到期提醒、任务、需求状态和项目进度
- 需求收件箱：通过全局“快速需求”或 `Cmd/Ctrl + K` 立即记录
- 报告中心：按真实需求变更生成日报、周报，并可补充下一步计划与风险
- 项目周快照：自动保留上周项目基线，也可手动保存本周快照；历史快照不会被覆盖
- 本地持久化：需求、任务、项目和活动记录都存储在 SQLite
- 默认仅监听 `127.0.0.1`，不会主动连接外部服务

## 架构

```text
浏览器（React + Vite） → Node.js / Express API → SQLite（data/productflow.db）
```

生产环境中，Express 同时提供 API 和构建后的前端页面，不需要单独部署数据库服务。

## 快速开始

要求：Node.js 22.5 或更高版本（使用内置 `node:sqlite`）。

```bash
npm install
npm run build
npm start
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。首次启动会自动创建空数据库和表结构，不会写入演示数据。

开发模式：

```bash
npm run dev
```

此命令会同时启动 API（`3000`）与前端开发服务（`5173`）；前端会将 `/api` 请求代理到本地 API。

## 数据与备份

数据库位于 `data/productflow.db`，使用 SQLite WAL 模式。

备份时，先停止服务，然后复制整个 `data/` 目录：

```bash
cp -R data data-backup-$(date +%Y%m%d)
```

`data/` 已被 Git 忽略，个人业务数据不会提交到远端仓库。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务与数据库健康检查 |
| `GET` / `POST` | `/api/requirements` | 查询或创建需求 |
| `PATCH` | `/api/requirements/:id` | 更新需求字段 |
| `GET` | `/api/tasks` | 查询任务 |
| `PATCH` | `/api/tasks/:id` | 更新任务完成状态 |
| `GET` / `POST` | `/api/projects` | 查询或创建项目 |
| `PATCH` | `/api/projects/:id` | 更新项目目标、周期、状态与健康度 |
| `GET` | `/api/projects/:id/requirements` | 查询项目下的需求 |
| `GET` | `/api/activities` | 查询需求字段变更记录 |
| `GET` | `/api/reports` | 查询日报与周报历史 |
| `POST` | `/api/reports/generate` | 根据当前真实数据生成日报或周报 |
| `PATCH` | `/api/reports/:id` | 编辑报告摘要、计划与风险 |
| `GET` | `/api/snapshots` | 查询项目周快照 |
| `POST` | `/api/snapshots/generate` | 保存本周或上周项目快照 |
| `GET` | `/api/dashboard` | 查询首页统计 |

创建需求示例：

```bash
curl -X POST http://127.0.0.1:3000/api/requirements \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"优化账号设置流程"}'
```

## 项目结构

```text
src/                 React 页面与样式
server/index.mjs     Express API、SQLite 初始化与数据访问
data/                本地数据库目录（不提交）
dist/                生产构建产物（不提交）
```

## 常用命令

```bash
npm run dev      # 前后端开发模式
npm run build    # 类型检查并构建前端
npm start        # 启动生产服务（默认 3000 端口）
```
