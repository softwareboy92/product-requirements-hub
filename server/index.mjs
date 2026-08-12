import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)))
const dataDir = join(rootDir, 'data')
const distDir = join(rootDir, 'dist')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'productflow.db'))
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
`)

const app = express()
app.use(express.json({ limit: '256kb' }))

const requireSelect = `SELECT r.id, r.code, r.title, r.description, r.priority, r.status, r.source, r.due_date AS dueDate, r.created_at AS createdAt, COALESCE(p.name, '未分类') AS project FROM requirements r LEFT JOIN projects p ON p.id = r.project_id`
const taskSelect = `SELECT t.id, t.title, t.priority, t.due_date AS dueDate, t.is_done AS done, COALESCE(r.code, '个人计划') AS requirement FROM tasks t LEFT JOIN requirements r ON r.id = t.requirement_id`

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'sqlite' }))
app.get('/api/requirements', (_req, res) => res.json(db.prepare(`${requireSelect} ORDER BY r.created_at DESC, r.id DESC`).all()))
app.post('/api/requirements', (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title || title.length > 200) return res.status(400).json({ error: '需求标题不能为空，且不能超过 200 个字符。' })
  const result = db.prepare(`INSERT INTO requirements (code, title, source) VALUES ('PENDING', ?, '快速记录')`).run(title)
  const id = Number(result.lastInsertRowid)
  const code = `REQ-${1000 + id}`
  db.prepare('UPDATE requirements SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(code, id)
  db.prepare('INSERT INTO activities (entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?)').run('requirement', id, 'created', '通过快速记录创建')
  res.status(201).json(db.prepare(`${requireSelect} WHERE r.id = ?`).get(id))
})
app.patch('/api/requirements/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ error: '需求不存在。' })
  const allowed = ['title', 'description', 'priority', 'status', 'source', 'due_date']
  const updates = Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))
  if (!updates.length) return res.status(400).json({ error: '没有可更新的字段。' })
  const fields = updates.map(([key]) => `${key} = ?`).join(', ')
  db.prepare(`UPDATE requirements SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...updates.map(([, value]) => value), req.params.id)
  res.json(db.prepare(`${requireSelect} WHERE r.id = ?`).get(req.params.id))
})
app.get('/api/tasks', (_req, res) => res.json(db.prepare(`${taskSelect} ORDER BY t.is_done ASC, t.due_date ASC`).all().map(task => ({ ...task, done: Boolean(task.done) }))))
app.patch('/api/tasks/:id', (req, res) => {
  if (typeof req.body?.done !== 'boolean') return res.status(400).json({ error: 'done 必须为布尔值。' })
  const result = db.prepare('UPDATE tasks SET is_done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.done ? 1 : 0, req.params.id)
  if (!result.changes) return res.status(404).json({ error: '任务不存在。' })
  const task = db.prepare(`${taskSelect} WHERE t.id = ?`).get(req.params.id)
  res.json({ ...task, done: Boolean(task.done) })
})
app.get('/api/projects', (_req, res) => res.json(db.prepare(`SELECT p.id, p.name, p.color, COUNT(r.id) AS total, SUM(CASE WHEN r.status IN ('已完成','已上线') THEN 1 ELSE 0 END) AS done FROM projects p LEFT JOIN requirements r ON r.project_id = p.id GROUP BY p.id ORDER BY p.id`).all()))
app.get('/api/dashboard', (_req, res) => {
  const status = db.prepare(`SELECT status AS name, COUNT(*) AS value FROM requirements GROUP BY status`).all()
  const due = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN due_date = date('now', 'localtime') THEN 1 ELSE 0 END), 0) AS today,
    COALESCE(SUM(CASE WHEN due_date > date('now', 'localtime') AND due_date <= date('now', 'localtime', '+3 days') THEN 1 ELSE 0 END), 0) AS soon,
    COALESCE(SUM(CASE WHEN due_date < date('now', 'localtime') AND status NOT IN ('已完成','已上线') THEN 1 ELSE 0 END), 0) AS overdue,
    COALESCE(SUM(CASE WHEN status IN ('已完成','已上线') AND date(updated_at) >= date('now', 'localtime', '-6 days') THEN 1 ELSE 0 END), 0) AS completedWeek
    FROM requirements`).get()
  res.json({ status, due, totals: { requirements: db.prepare('SELECT COUNT(*) AS count FROM requirements').get().count, inbox: db.prepare("SELECT COUNT(*) AS count FROM requirements WHERE status IN ('Inbox','待整理')").get().count } })
})

if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/{*splat}', (_req, res) => res.sendFile(join(distDir, 'index.html')))
}

const port = Number(process.env.PORT || 3000)
app.listen(port, '127.0.0.1', () => console.log(`ProductFlow API running at http://127.0.0.1:${port}`))
