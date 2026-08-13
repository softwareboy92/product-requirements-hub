import express from "express";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = join(rootDir, "data");
const distDir = join(rootDir, "dist");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "productflow.db"));
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'blue',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT '功能需求',
    source TEXT NOT NULL DEFAULT '快速记录',
    priority TEXT NOT NULL DEFAULT 'P3' CHECK(priority IN ('P0','P1','P2','P3')),
    status TEXT NOT NULL DEFAULT 'Inbox',
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2','P3')),
    due_date TEXT,
    is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
`);

function ensureColumn(table, name, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

ensureColumn("projects", "description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("projects", "status", "TEXT NOT NULL DEFAULT '进行中'");
ensureColumn("projects", "health", "TEXT NOT NULL DEFAULT '正常'");
ensureColumn("projects", "goal", "TEXT NOT NULL DEFAULT ''");
ensureColumn("projects", "start_date", "TEXT");
ensureColumn("projects", "target_date", "TEXT");
ensureColumn("activities", "field_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("activities", "old_value", "TEXT");
ensureColumn("activities", "new_value", "TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT NOT NULL CHECK(report_type IN ('daily','weekly')),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    next_plan TEXT NOT NULL DEFAULT '',
    risks TEXT NOT NULL DEFAULT '',
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_type, period_start, period_end)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS project_weekly_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    total_requirements INTEGER NOT NULL DEFAULT 0,
    inbox_count INTEGER NOT NULL DEFAULT 0,
    in_progress_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    overdue_count INTEGER NOT NULL DEFAULT 0,
    p0_count INTEGER NOT NULL DEFAULT 0,
    p1_count INTEGER NOT NULL DEFAULT 0,
    completion_rate REAL NOT NULL DEFAULT 0,
    project_health TEXT NOT NULL DEFAULT '正常',
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, week_start)
  ) STRICT;
`);

const isoDate = (date) => date.toISOString().slice(0, 10);
function weekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day + 1 + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

const app = express();
app.use(express.json({ limit: "256kb" }));

const requireSelect = `SELECT r.id, r.code, r.title, r.description, r.project_id AS projectId, r.type, r.priority, r.status, r.source, r.due_date AS dueDate, r.created_at AS createdAt, COALESCE(p.name, '未分类') AS project FROM requirements r LEFT JOIN projects p ON p.id = r.project_id`;
const taskSelect = `SELECT t.id, t.title, t.priority, t.due_date AS dueDate, t.is_done AS done, COALESCE(r.code, '个人计划') AS requirement FROM tasks t LEFT JOIN requirements r ON r.id = t.requirement_id`;
const projectSelect = `SELECT p.id, p.name, p.color, p.description, p.status, p.health, p.goal, p.start_date AS startDate, p.target_date AS targetDate, COUNT(r.id) AS total, COALESCE(SUM(CASE WHEN r.status IN ('已完成','已上线') THEN 1 ELSE 0 END), 0) AS done, COALESCE(SUM(CASE WHEN r.due_date < date('now','localtime') AND r.status NOT IN ('已完成','已上线') THEN 1 ELSE 0 END), 0) AS overdue FROM projects p LEFT JOIN requirements r ON r.project_id = p.id GROUP BY p.id`;

function reportSnapshot(start, end) {
  const requirements = db
    .prepare(
      `${requireSelect} WHERE date(r.updated_at) BETWEEN ? AND ? ORDER BY r.updated_at DESC`,
    )
    .all(start, end);
  const created = requirements.filter(
    (item) =>
      item.createdAt.slice(0, 10) >= start &&
      item.createdAt.slice(0, 10) <= end,
  );
  const completed = requirements.filter((item) =>
    ["已完成", "已上线"].includes(item.status),
  );
  const overdue = db
    .prepare(
      `${requireSelect} WHERE r.due_date < date('now','localtime') AND r.status NOT IN ('已完成','已上线') ORDER BY r.due_date`,
    )
    .all();
  const projects = db.prepare(`${projectSelect} ORDER BY p.name`).all();
  return {
    createdCount: created.length,
    completedCount: completed.length,
    changedCount: requirements.length,
    overdueCount: overdue.length,
    requirements,
    completed,
    overdue,
    projects,
  };
}

function saveWeeklySnapshots(range = weekRange(-1)) {
  const projects = db.prepare(`${projectSelect} ORDER BY p.id`).all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO project_weekly_snapshots (project_id, week_start, week_end, total_requirements, inbox_count, in_progress_count, completed_count, overdue_count, p0_count, p1_count, completion_rate, project_health, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let created = 0;
  for (const project of projects) {
    const items = db
      .prepare(`${requireSelect} WHERE r.project_id = ? ORDER BY r.id`)
      .all(project.id);
    const completed = items.filter((item) =>
      ["已完成", "已上线"].includes(item.status),
    ).length;
    const payload = { project, requirements: items };
    const result = insert.run(
      project.id,
      range.start,
      range.end,
      items.length,
      items.filter((item) => ["Inbox", "待整理"].includes(item.status)).length,
      items.filter(
        (item) =>
          !["Inbox", "待整理", "已完成", "已上线"].includes(item.status),
      ).length,
      completed,
      items.filter(
        (item) =>
          item.dueDate &&
          item.dueDate < isoDate(new Date()) &&
          !["已完成", "已上线"].includes(item.status),
      ).length,
      items.filter((item) => item.priority === "P0").length,
      items.filter((item) => item.priority === "P1").length,
      items.length ? Math.round((completed / items.length) * 1000) / 10 : 0,
      project.health,
      JSON.stringify(payload),
    );
    created += Number(result.changes);
  }
  return created;
}

saveWeeklySnapshots(weekRange(-1));

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, database: "sqlite" }),
);
app.get("/api/requirements", (_req, res) =>
  res.json(
    db.prepare(`${requireSelect} ORDER BY r.created_at DESC, r.id DESC`).all(),
  ),
);
app.post("/api/requirements", (req, res) => {
  const title = String(req.body?.title || "").trim();
  const projectId = Number(req.body?.projectId);
  const description = String(req.body?.description || "").trim();
  const type = String(req.body?.type || "功能需求");
  const priority = String(req.body?.priority || "P2");
  const status = String(req.body?.status || "Inbox");
  const source = String(req.body?.source || "自己规划");
  const dueDate = req.body?.dueDate ? String(req.body.dueDate) : null;
  if (!title || title.length > 200)
    return res
      .status(400)
      .json({ error: "需求标题不能为空，且不能超过 200 个字符。" });
  if (
    !Number.isInteger(projectId) ||
    !db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)
  )
    return res.status(400).json({ error: "请选择需求所属项目。" });
  if (
    ![
      "功能需求",
      "优化需求",
      "缺陷修复",
      "技术改造",
      "调研事项",
      "其他",
    ].includes(type)
  )
    return res.status(400).json({ error: "需求类型无效。" });
  if (!["P0", "P1", "P2", "P3"].includes(priority))
    return res.status(400).json({ error: "需求优先级无效。" });
  if (
    ![
      "Inbox",
      "待整理",
      "待评估",
      "已确认",
      "方案设计",
      "待开发",
      "开发中",
      "待验收",
      "已上线",
      "已完成",
    ].includes(status)
  )
    return res.status(400).json({ error: "需求状态无效。" });
  const result = db
    .prepare(
      `INSERT INTO requirements (code, title, description, project_id, type, source, priority, status, due_date) VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      description,
      projectId,
      type,
      source,
      priority,
      status,
      dueDate,
    );
  const id = Number(result.lastInsertRowid);
  const code = `REQ-${1000 + id}`;
  db.prepare(
    "UPDATE requirements SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(code, id);
  db.prepare(
    "INSERT INTO activities (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)",
  ).run("requirement", id, "created", "创建需求");
  res.status(201).json(db.prepare(`${requireSelect} WHERE r.id = ?`).get(id));
});
app.patch("/api/requirements/:id", (req, res) => {
  const current = db
    .prepare("SELECT * FROM requirements WHERE id = ?")
    .get(req.params.id);
  if (!current) return res.status(404).json({ error: "需求不存在。" });
  const allowed = [
    "title",
    "description",
    "project_id",
    "type",
    "priority",
    "status",
    "source",
    "due_date",
  ];
  const updates = Object.entries(req.body || {}).filter(([key]) =>
    allowed.includes(key),
  );
  if (!updates.length)
    return res.status(400).json({ error: "没有可更新的字段。" });
  const fields = updates.map(([key]) => `${key} = ?`).join(", ");
  db.prepare(
    `UPDATE requirements SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(...updates.map(([, value]) => value), req.params.id);
  const activity = db.prepare(
    "INSERT INTO activities (entity_type, entity_id, action, detail, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [field, value] of updates)
    activity.run(
      "requirement",
      Number(req.params.id),
      "updated",
      "更新需求字段",
      field,
      current[field] == null ? null : String(current[field]),
      value == null ? null : String(value),
    );
  res.json(db.prepare(`${requireSelect} WHERE r.id = ?`).get(req.params.id));
});
app.get("/api/tasks", (_req, res) =>
  res.json(
    db
      .prepare(`${taskSelect} ORDER BY t.is_done ASC, t.due_date ASC`)
      .all()
      .map((task) => ({ ...task, done: Boolean(task.done) })),
  ),
);
app.patch("/api/tasks/:id", (req, res) => {
  if (typeof req.body?.done !== "boolean")
    return res.status(400).json({ error: "done 必须为布尔值。" });
  const result = db
    .prepare(
      "UPDATE tasks SET is_done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(req.body.done ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "任务不存在。" });
  const task = db.prepare(`${taskSelect} WHERE t.id = ?`).get(req.params.id);
  res.json({ ...task, done: Boolean(task.done) });
});
app.get("/api/projects", (_req, res) =>
  res.json(
    db.prepare(`${projectSelect} ORDER BY p.created_at DESC, p.id DESC`).all(),
  ),
);
app.post("/api/projects", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const color = String(req.body?.color || "blue");
  if (!name || name.length > 100)
    return res
      .status(400)
      .json({ error: "项目名称不能为空，且不能超过 100 个字符。" });
  if (!["blue", "purple", "green"].includes(color))
    return res.status(400).json({ error: "项目颜色无效。" });
  try {
    const result = db
      .prepare("INSERT INTO projects (name, color) VALUES (?, ?)")
      .run(name, color);
    const id = Number(result.lastInsertRowid);
    db.prepare(
      "INSERT INTO activities (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)",
    ).run("project", id, "created", "创建项目");
    res.status(201).json(db.prepare(`${projectSelect} HAVING p.id = ?`).get(id));
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed"))
      return res.status(409).json({ error: "已存在同名项目。" });
    throw error;
  }
});
app.get("/api/projects/:id/requirements", (req, res) =>
  res.json(
    db
      .prepare(
        `${requireSelect} WHERE r.project_id = ? ORDER BY r.created_at DESC, r.id DESC`,
      )
      .all(req.params.id),
  ),
);
app.patch("/api/projects/:id", (req, res) => {
  const current = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(req.params.id);
  if (!current) return res.status(404).json({ error: "项目不存在。" });
  const map = {
    description: "description",
    status: "status",
    health: "health",
    goal: "goal",
    startDate: "start_date",
    targetDate: "target_date",
  };
  const updates = Object.entries(req.body || {}).filter(([key]) => map[key]);
  if (!updates.length)
    return res.status(400).json({ error: "没有可更新字段。" });
  db.prepare(
    `UPDATE projects SET ${updates.map(([key]) => `${map[key]} = ?`).join(", ")} WHERE id = ?`,
  ).run(...updates.map(([, value]) => value || null), req.params.id);
  res.json(db.prepare(`${projectSelect} HAVING p.id = ?`).get(req.params.id));
});

app.get("/api/activities", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(
    db
      .prepare(
        "SELECT id, entity_type AS entityType, entity_id AS entityId, action, detail, field_name AS fieldName, old_value AS oldValue, new_value AS newValue, created_at AS createdAt FROM activities ORDER BY id DESC LIMIT ?",
      )
      .all(limit),
  );
});

const reportDto = (row) => ({
  id: row.id,
  reportType: row.report_type,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  title: row.title,
  summary: row.summary,
  nextPlan: row.next_plan,
  risks: row.risks,
  snapshot: JSON.parse(row.snapshot_json),
});
app.get("/api/reports", (req, res) => {
  const type =
    req.query.type === "daily"
      ? "daily"
      : req.query.type === "weekly"
        ? "weekly"
        : null;
  const rows = type
    ? db
        .prepare(
          "SELECT * FROM reports WHERE report_type = ? ORDER BY period_start DESC",
        )
        .all(type)
    : db.prepare("SELECT * FROM reports ORDER BY period_start DESC").all();
  res.json(rows.map(reportDto));
});
app.post("/api/reports/generate", (req, res) => {
  const type = req.body?.type === "daily" ? "daily" : "weekly";
  const today = isoDate(new Date());
  const range = type === "daily" ? { start: today, end: today } : weekRange(0);
  const snapshot = reportSnapshot(range.start, range.end);
  const title =
    type === "daily" ? `${today} 日报` : `${range.start} 至 ${range.end} 周报`;
  const summary = `新增需求 ${snapshot.createdCount} 项，完成或上线 ${snapshot.completedCount} 项，共有 ${snapshot.changedCount} 项发生更新。`;
  const result = db
    .prepare(
      `INSERT INTO reports (report_type, period_start, period_end, title, summary, snapshot_json) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(report_type, period_start, period_end) DO UPDATE SET title=excluded.title, summary=excluded.summary, snapshot_json=excluded.snapshot_json, updated_at=CURRENT_TIMESTAMP RETURNING id`,
    )
    .get(
      type,
      range.start,
      range.end,
      title,
      summary,
      JSON.stringify(snapshot),
    );
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(result.id);
  res.status(201).json(reportDto(row));
});
app.patch("/api/reports/:id", (req, res) => {
  const summary = String(req.body?.summary || "");
  const nextPlan = String(req.body?.nextPlan || "");
  const risks = String(req.body?.risks || "");
  const result = db
    .prepare(
      "UPDATE reports SET summary = ?, next_plan = ?, risks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(summary, nextPlan, risks, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "报告不存在。" });
  const row = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(req.params.id);
  res.json(reportDto(row));
});
app.get("/api/snapshots", (_req, res) =>
  res.json(
    db
      .prepare(
        `SELECT s.id, s.project_id AS projectId, p.name AS project, p.color, s.week_start AS weekStart, s.week_end AS weekEnd, s.total_requirements AS total, s.completed_count AS completed, s.overdue_count AS overdue, s.completion_rate AS completionRate, s.project_health AS health, s.created_at AS createdAt FROM project_weekly_snapshots s JOIN projects p ON p.id=s.project_id ORDER BY s.week_start DESC, p.name`,
      )
      .all(),
  ),
);
app.post("/api/snapshots/generate", (req, res) => {
  const range = req.body?.period === "current" ? weekRange(0) : weekRange(-1);
  const created = saveWeeklySnapshots(range);
  res.status(201).json({ created, ...range });
});
app.get("/api/dashboard", (_req, res) => {
  const status = db
    .prepare(
      `SELECT status AS name, COUNT(*) AS value FROM requirements GROUP BY status`,
    )
    .all();
  const due = db
    .prepare(
      `SELECT
    COALESCE(SUM(CASE WHEN due_date = date('now', 'localtime') THEN 1 ELSE 0 END), 0) AS today,
    COALESCE(SUM(CASE WHEN due_date > date('now', 'localtime') AND due_date <= date('now', 'localtime', '+3 days') THEN 1 ELSE 0 END), 0) AS soon,
    COALESCE(SUM(CASE WHEN due_date < date('now', 'localtime') AND status NOT IN ('已完成','已上线') THEN 1 ELSE 0 END), 0) AS overdue,
    COALESCE(SUM(CASE WHEN status IN ('已完成','已上线') AND date(updated_at) >= date('now', 'localtime', '-6 days') THEN 1 ELSE 0 END), 0) AS completedWeek
    FROM requirements`,
    )
    .get();
  res.json({
    status,
    due,
    totals: {
      requirements: db
        .prepare("SELECT COUNT(*) AS count FROM requirements")
        .get().count,
      inbox: db
        .prepare(
          "SELECT COUNT(*) AS count FROM requirements WHERE status IN ('Inbox','待整理')",
        )
        .get().count,
    },
  });
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(join(distDir, "index.html")),
  );
}

const port = Number(process.env.PORT || 3000);
app.listen(port, "127.0.0.1", () =>
  console.log(`ProductFlow API running at http://127.0.0.1:${port}`),
);
