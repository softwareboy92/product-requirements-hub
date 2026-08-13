import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  NotebookText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import "./reports.css";

type Priority = "P0" | "P1" | "P2" | "P3";
type Requirement = {
  id: number;
  code: string;
  title: string;
  description: string;
  projectId: number;
  project: string;
  type: string;
  priority: Priority;
  status: string;
  dueDate: string | null;
  source: string;
};
type Task = {
  id: number;
  title: string;
  requirement: string;
  priority: Priority;
  dueDate: string | null;
  done: boolean;
};
type Project = {
  id: number;
  name: string;
  color: "blue" | "purple" | "green";
  done: number;
  total: number;
  overdue: number;
  description: string;
  status: string;
  health: string;
  goal: string;
  startDate: string | null;
  targetDate: string | null;
};
type ReportSnapshot = {
  createdCount: number;
  completedCount: number;
  changedCount: number;
  overdueCount: number;
  projects: Project[];
};
type Report = {
  id: number;
  reportType: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  title: string;
  summary: string;
  nextPlan: string;
  risks: string;
  snapshot: ReportSnapshot;
};
type WeeklySnapshot = {
  id: number;
  projectId: number;
  project: string;
  color: Project["color"];
  weekStart: string;
  weekEnd: string;
  total: number;
  completed: number;
  overdue: number;
  completionRate: number;
  health: string;
};
type Summary = {
  due: { today: number; soon: number; overdue: number; completedWeek: number };
  totals: { requirements: number; inbox: number };
};
type RequirementDraft = {
  title: string;
  description: string;
  projectId: string;
  type: string;
  priority: Priority;
  status: string;
  source: string;
  dueDate: string;
};
const types = [
  "功能需求",
  "优化需求",
  "缺陷修复",
  "技术改造",
  "调研事项",
  "其他",
];
const sources = [
  "自己规划",
  "用户反馈",
  "会议",
  "业务方",
  "技术团队",
  "临时需求",
  "其他",
];
const statuses = [
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
];
const freshDraft = (): RequirementDraft => ({
  title: "",
  description: "",
  projectId: "",
  type: "功能需求",
  priority: "P2",
  status: "Inbox",
  source: "自己规划",
  dueDate: "",
});
const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        "请求失败，请稍后重试。",
    );
  return response.json();
};
const dueText = (value: string | null) =>
  value ? value.slice(0, 10) : "未设置";
function PriorityTag({ value }: { value: Priority }) {
  return <span className={`priority ${value.toLowerCase()}`}>{value}</span>;
}

export default function App() {
  const [active, setActive] = useState("今日总览");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[]>([]);
  const [requirementOpen, setRequirementOpen] = useState(false);
  const [detail, setDetail] = useState<Requirement | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [draft, setDraft] = useState(freshDraft);
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState<Project["color"]>("blue");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    try {
      const [
        reqs,
        nextProjects,
        nextTasks,
        nextSummary,
        nextReports,
        nextSnapshots,
      ] = await Promise.all([
        api<Requirement[]>("/requirements"),
        api<Project[]>("/projects"),
        api<Task[]>("/tasks"),
        api<Summary>("/dashboard"),
        api<Report[]>("/reports"),
        api<WeeklySnapshot[]>("/snapshots"),
      ]);
      setRequirements(reqs);
      setProjects(nextProjects);
      setTasks(nextTasks);
      setSummary(nextSummary);
      setReports(nextReports);
      setSnapshots(nextSnapshots);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法连接本地服务。");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRequirementOpen(true);
      }
      if (event.key === "Escape") {
        setRequirementOpen(false);
        setProjectOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const inProjects = ["项目中心", "项目列表", "项目看板"].includes(active);
  const inReports = [
    "报告中心",
    "今日日报",
    "本周周报",
    "报告历史",
    "项目周快照",
  ].includes(active);
  const title =
    active === "今日总览"
      ? "今天，专注重要的事"
      : active === "项目中心"
        ? "项目列表"
        : active;
  const createRequirement = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api<Requirement>("/requirements", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          projectId: Number(draft.projectId),
          dueDate: draft.dueDate || null,
        }),
      });
      await refresh();
      setDraft(freshDraft());
      setRequirementOpen(false);
      setActive("需求中心");
      setToast("需求已创建：已归集到项目，并刷新所有统计");
      window.setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建需求失败。");
    }
  };
  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName, color: projectColor }),
      });
      setProjects((current) => [created, ...current]);
      setProjectName("");
      setProjectOpen(false);
      setToast("项目已创建");
      window.setTimeout(() => setToast(""), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败。");
    }
  };
  const toggleTask = async (task: Task) => {
    const updated = await api<Task>(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: !task.done }),
    });
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? updated : item)),
    );
  };
  const generateReport = async (reportType: "daily" | "weekly") => {
    try {
      await api<Report>("/reports/generate", {
        method: "POST",
        body: JSON.stringify({ type: reportType }),
      });
      await refresh();
      setToast(reportType === "daily" ? "今日日报已生成" : "本周周报已生成");
      window.setTimeout(() => setToast(""), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成报告失败。");
    }
  };
  const saveReport = async (
    id: number,
    values: Pick<Report, "summary" | "nextPlan" | "risks">,
  ) => {
    await api<Report>(`/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
    await refresh();
    setToast("报告内容已保存");
    window.setTimeout(() => setToast(""), 2600);
  };
  const generateSnapshots = async () => {
    await api("/snapshots/generate", {
      method: "POST",
      body: JSON.stringify({ period: "current" }),
    });
    await refresh();
    setToast("本周项目快照已保存");
    window.setTimeout(() => setToast(""), 2600);
  };
  const content =
    active === "今日总览" ? (
      <Dashboard
        tasks={tasks}
        projects={projects}
        requirements={requirements}
        summary={summary}
        onToggle={toggleTask}
        onOpen={setDetail}
      />
    ) : active === "需求中心" ||
      active === "需求收件箱" ||
      active === "全部需求" ? (
      <RequirementTable requirements={requirements} onOpen={setDetail} />
    ) : active === "需求看板" ? (
      <RequirementBoard requirements={requirements} onOpen={setDetail} />
    ) : active === "项目看板" ? (
      <ProjectBoard projects={projects} />
    ) : inProjects ? (
      <ProjectList
        projects={projects}
        requirements={requirements}
        onNew={() => setProjectOpen(true)}
      />
    ) : inReports ? (
      <ReportCenter
        active={active}
        reports={reports}
        snapshots={snapshots}
        onGenerate={generateReport}
        onSave={saveReport}
        onSnapshot={generateSnapshots}
      />
    ) : (
      <Empty title={active} />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={18} fill="currentColor" />
          </span>
          ProductFlow
        </div>
        <button
          className="quick-button"
          onClick={() => setRequirementOpen(true)}
        >
          <Plus size={17} />
          新建需求<span className="shortcut">⌘ K</span>
        </button>
        <Nav active={active} setActive={setActive} />
        <div className="sidebar-bottom">
          <button className="nav-item">
            <Settings size={18} />
            设置
          </button>
          <div className="local-badge">
            <span />
            <div>
              <b>本地 SQLite</b>
              <small>数据仅存储在此设备</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-logo"
            aria-label="首页"
            onClick={() => setActive("今日总览")}
          >
            <Zap size={18} />
          </button>
          <div className="search">
            <Search size={17} />
            <input aria-label="搜索" placeholder="搜索需求、项目或文档..." />
            <span>⌘ /</span>
          </div>
          <div className="top-actions">
            <button aria-label="通知" className="icon-button">
              <Bell size={19} />
            </button>
            <div className="avatar">AL</div>
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <p>个人需求管理工作台</p>
              <h1>{title}</h1>
            </div>
            <div className="heading-meta">
              {!inProjects && !inReports && (
                <span>
                  <Target size={16} /> 今日还剩{" "}
                  {tasks.filter((item) => !item.done).length} 项
                </span>
              )}
              {inProjects && (
                <button onClick={() => setProjectOpen(true)}>
                  <Plus size={17} />
                  新建项目
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="api-error">
              {error}
              <button onClick={() => void refresh()}>重试</button>
            </div>
          )}
          {content}
        </div>
      </main>
      {requirementOpen && (
        <RequirementModal
          draft={draft}
          setDraft={setDraft}
          projects={projects}
          onClose={() => setRequirementOpen(false)}
          onSubmit={createRequirement}
          onNewProject={() => {
            setRequirementOpen(false);
            setProjectOpen(true);
          }}
        />
      )}
      {detail && (
        <RequirementDetail
          requirement={detail}
          onClose={() => setDetail(null)}
        />
      )}
      {projectOpen && (
        <ProjectModal
          name={projectName}
          setName={setProjectName}
          color={projectColor}
          setColor={setProjectColor}
          onClose={() => setProjectOpen(false)}
          onSubmit={createProject}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      <MobileNav
        active={active}
        setActive={setActive}
        onAdd={() => setRequirementOpen(true)}
      />
    </div>
  );
}
function Nav({
  active,
  setActive,
}: {
  active: string;
  setActive: (value: string) => void;
}) {
  const groups = [
    { label: "今日总览", icon: LayoutDashboard },
    {
      label: "需求中心",
      icon: Inbox,
      children: ["需求收件箱", "全部需求", "需求看板"],
    },
    {
      label: "项目中心",
      icon: FolderKanban,
      children: ["项目列表", "项目看板"],
    },
    {
      label: "报告中心",
      icon: NotebookText,
      children: ["今日日报", "本周周报", "报告历史", "项目周快照"],
    },
    { label: "我的任务", icon: ListTodo },
  ];
  return (
    <nav aria-label="主导航">
      {groups.map((group) => (
        <div key={group.label}>
          <button
            className={`nav-item ${active === group.label ? "active" : ""}`}
            onClick={() => setActive(group.label)}
          >
            <group.icon size={18} />
            {group.label}
          </button>
          {group.children && (
            <div className="subnav">
              {group.children.map((child) => (
                <button
                  className={active === child ? "selected" : ""}
                  key={child}
                  onClick={() => setActive(child)}
                >
                  {child}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
function MobileNav({
  active,
  setActive,
  onAdd,
}: {
  active: string;
  setActive: (value: string) => void;
  onAdd: () => void;
}) {
  const items = [
    { label: "首页", value: "今日总览", icon: LayoutDashboard },
    { label: "需求", value: "需求中心", icon: Inbox },
    { label: "项目", value: "项目中心", icon: FolderKanban },
    { label: "报告", value: "报告中心", icon: NotebookText },
  ];
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      {items.slice(0, 2).map((item) => (
        <button
          key={item.label}
          className={active === item.value ? "active" : ""}
          onClick={() => setActive(item.value)}
        >
          <item.icon size={19} />
          <span>{item.label}</span>
        </button>
      ))}
      <button className="mobile-add" aria-label="新建需求" onClick={onAdd}>
        <Plus size={22} />
      </button>
      {items.slice(2).map((item) => (
        <button
          key={item.label}
          className={active === item.value ? "active" : ""}
          onClick={() => setActive(item.value)}
        >
          <item.icon size={19} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
function Dashboard({
  tasks,
  projects,
  requirements,
  summary,
  onToggle,
  onOpen,
}: {
  tasks: Task[];
  projects: Project[];
  requirements: Requirement[];
  summary: Summary | null;
  onToggle: (task: Task) => void;
  onOpen: (item: Requirement) => void;
}) {
  const due = summary?.due || {
    today: 0,
    soon: 0,
    overdue: 0,
    completedWeek: 0,
  };
  const statuses = Array.from(new Set(requirements.map((item) => item.status)));
  return (
    <>
      <section className="metrics-grid">
        <Metric
          icon={<Inbox size={19} />}
          tone="blue"
          label="全部需求"
          value={requirements.length}
        />
        <Metric
          icon={<Clock3 size={19} />}
          tone="warm"
          label="今天到期"
          value={due.today}
        />
        <Metric
          icon={<Bell size={19} />}
          tone="red"
          label="已逾期"
          value={due.overdue}
        />
        <Metric
          icon={<FolderKanban size={19} />}
          tone="green"
          label="活跃项目"
          value={projects.length}
        />
      </section>
      <section className="dashboard-grid">
        <article className="card focus-card">
          <CardTitle title="最近新增需求" icon={<Inbox size={18} />} />
          <div className="recent-requirements">
            {requirements.slice(0, 5).map((item) => (
              <button
                className="requirement-link"
                key={item.id}
                onClick={() => onOpen(item)}
              >
                <span className="status-dot" />
                <span>
                  <b>{item.title}</b>
                  <small>
                    {item.project} · {item.type}
                  </small>
                </span>
                <PriorityTag value={item.priority} />
              </button>
            ))}
            {!requirements.length && (
              <p className="empty-copy">
                还没有需求，可从左侧主入口或底部“+”开始记录。
              </p>
            )}
          </div>
        </article>
        <article className="card projects-card">
          <CardTitle title="需求状态" icon={<Target size={18} />} />
          <div className="status-summary">
            {statuses.map((status) => (
              <div key={status}>
                <span>{status}</span>
                <b>
                  {requirements.filter((item) => item.status === status).length}
                </b>
              </div>
            ))}
            {!statuses.length && (
              <p className="empty-copy">创建需求后会在此展示实时分布。</p>
            )}
          </div>
        </article>
        <article className="card focus-card">
          <CardTitle title="今日重点" icon={<CheckCircle2 size={18} />} />
          <div className="task-list">
            {tasks.map((task) => (
              <label
                className={`task-row ${task.done ? "done" : ""}`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => void onToggle(task)}
                />
                <span className="custom-check">
                  {task.done && <Check size={14} />}
                </span>
                <span className="task-main">
                  <b>{task.title}</b>
                  <small>
                    {task.requirement} · {dueText(task.dueDate)}
                  </small>
                </span>
                <PriorityTag value={task.priority} />
              </label>
            ))}
            {!tasks.length && <p className="empty-copy">暂无待办任务。</p>}
          </div>
        </article>
        <article className="card projects-card">
          <CardTitle title="项目进展" icon={<FolderKanban size={18} />} />
          <div className="project-list">
            {projects.map((project) => (
              <div className="project" key={project.id}>
                <div className={`project-logo ${project.color}`}>
                  {project.name.slice(0, 1)}
                </div>
                <div className="project-body">
                  <div>
                    <b>{project.name}</b>
                    <small>{project.done} 已完成</small>
                  </div>
                  <div className="progress">
                    <i
                      className={project.color}
                      style={{
                        width: `${project.total ? (project.done / project.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p>
                    <span>
                      {project.done}/{project.total} 需求
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
function Metric({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>项需要关注</small>
      </div>
      <ChevronRight size={17} />
    </article>
  );
}
function CardTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="card-title">
      <div className="title-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>来自本地 SQLite 数据</p>
      </div>
    </div>
  );
}
function RequirementTable({
  requirements,
  onOpen,
}: {
  requirements: Requirement[];
  onOpen: (item: Requirement) => void;
}) {
  return (
    <section className="card table-card">
      <div className="table-toolbar">
        <div>
          <button className="filter-active">
            全部 <span>{requirements.length}</span>
          </button>
          <button>Inbox</button>
          <button>进行中</button>
        </div>
      </div>
      <div className="requirements-table">
        <div className="tr th">
          <span>需求</span>
          <span>项目 / 类型</span>
          <span>状态</span>
          <span>优先级</span>
          <span>截止时间</span>
        </div>
        {requirements.map((item) => (
          <button
            className="tr requirement-row"
            key={item.id}
            onClick={() => onOpen(item)}
          >
            <span className="req-name">
              <b>{item.title}</b>
              <small>
                {item.code} · {item.source}
              </small>
            </span>
            <span>
              <b>{item.project}</b>
              <small>{item.type}</small>
            </span>
            <span>
              <i className="status-dot" />
              {item.status}
            </span>
            <span>
              <PriorityTag value={item.priority} />
            </span>
            <span>{dueText(item.dueDate)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
function ProjectList({
  projects,
  requirements,
  onNew,
}: {
  projects: Project[];
  requirements: Requirement[];
  onNew: () => void;
}) {
  if (!projects.length) return <Empty title="还没有项目" action={onNew} />;
  return (
    <section className="project-grid">
      {projects.map((project) => (
        <article className="card project-card" key={project.id}>
          <div className="project-card-head">
            <div className={`project-logo ${project.color}`}>
              {project.name.slice(0, 1)}
            </div>
            <div>
              <h2>{project.name}</h2>
              <p>
                {project.total} 个需求 · {project.done} 个已完成
              </p>
            </div>
            <MoreHorizontal size={18} />
          </div>
          <div className="project-card-progress">
            <span>完成进度</span>
            <b>
              {project.total
                ? Math.round((project.done / project.total) * 100)
                : 0}
              %
            </b>
            <div className="progress">
              <i
                className={project.color}
                style={{
                  width: `${project.total ? (project.done / project.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="project-requirements">
            <div>
              <span>归集需求</span>
              <small>
                {
                  requirements.filter((item) => item.projectId === project.id)
                    .length
                }{" "}
                条
              </small>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
function ProjectBoard({ projects }: { projects: Project[] }) {
  const lanes = ["未开始", "进行中", "已完成"];
  const state = (project: Project) =>
    project.total === 0
      ? "未开始"
      : project.done === project.total
        ? "已完成"
        : "进行中";
  return (
    <section className="board-wrap">
      {lanes.map((lane) => (
        <div className="board-lane" key={lane}>
          <div className="board-lane-head">
            <b>{lane}</b>
            <span>
              {projects.filter((project) => state(project) === lane).length}
            </span>
          </div>
          <div className="board-cards">
            {projects
              .filter((project) => state(project) === lane)
              .map((project) => (
                <article className="board-card" key={project.id}>
                  <div className={`project-logo ${project.color}`}>
                    {project.name.slice(0, 1)}
                  </div>
                  <div>
                    <h2>{project.name}</h2>
                    <p>
                      {project.done}/{project.total} 需求完成
                    </p>
                  </div>
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
function RequirementBoard({
  requirements,
  onOpen,
}: {
  requirements: Requirement[];
  onOpen: (item: Requirement) => void;
}) {
  const lanes = [
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
  ];
  return (
    <section className="requirement-board">
      {lanes.map((lane) => {
        const items = requirements.filter((item) => item.status === lane);
        return (
          <div className="requirement-lane" key={lane}>
            <div className="board-lane-head">
              <b>{lane}</b>
              <span>{items.length}</span>
            </div>
            <div className="requirement-cards">
              {items.map((item) => (
                <button
                  className="requirement-board-card"
                  key={item.id}
                  onClick={() => onOpen(item)}
                >
                  <PriorityTag value={item.priority} />
                  <b>{item.title}</b>
                  <small>{item.project}</small>
                  <footer>
                    <span>{item.type}</span>
                    <span>{dueText(item.dueDate)}</span>
                  </footer>
                </button>
              ))}
              {!items.length && <p>暂无需求</p>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
function RequirementModal({
  draft,
  setDraft,
  projects,
  onClose,
  onSubmit,
  onNewProject,
}: {
  draft: RequirementDraft;
  setDraft: Dispatch<SetStateAction<RequirementDraft>>;
  projects: Project[];
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onNewProject: () => void;
}) {
  const set = <K extends keyof RequirementDraft>(
    key: K,
    value: RequirementDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="quick-modal requirement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="requirement-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <span>
            <Sparkles size={18} />
          </span>
          <div>
            <h2 id="requirement-title">新建需求</h2>
            <p>需求必须归属到一个项目</p>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field full">
              需求标题{" "}
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="例如：优化账号设置流程"
                required
              />
            </label>
            <label className="form-field full">
              需求描述{" "}
              <textarea
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="补充目标、背景或验收标准（可选）"
              />
            </label>
            <label className="form-field full">
              所属项目{" "}
              <select
                value={draft.projectId}
                onChange={(event) => set("projectId", event.target.value)}
                required
              >
                <option value="">请选择项目</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {!projects.length && (
                <button
                  type="button"
                  className="inline-link"
                  onClick={onNewProject}
                >
                  还没有项目，先新建项目
                </button>
              )}
            </label>
            <label className="form-field">
              需求类型{" "}
              <select
                value={draft.type}
                onChange={(event) => set("type", event.target.value)}
              >
                {types.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              优先级{" "}
              <select
                value={draft.priority}
                onChange={(event) =>
                  set("priority", event.target.value as Priority)
                }
              >
                {(["P0", "P1", "P2", "P3"] as Priority[]).map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              当前状态{" "}
              <select
                value={draft.status}
                onChange={(event) => set("status", event.target.value)}
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              需求来源{" "}
              <select
                value={draft.source}
                onChange={(event) => set("source", event.target.value)}
              >
                {sources.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              目标完成时间{" "}
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => set("dueDate", event.target.value)}
              />
            </label>
          </div>
          <div className="modal-footer">
            <p>项目、类型、优先级和状态均会写入 SQLite</p>
            <button
              disabled={!draft.title.trim() || !draft.projectId}
              type="submit"
            >
              创建需求 <ChevronRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function RequirementDetail({
  requirement,
  onClose,
}: {
  requirement: Requirement;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="quick-modal detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <span>
            <FileText size={18} />
          </span>
          <div>
            <h2 id="detail-title">{requirement.title}</h2>
            <p>{requirement.code}</p>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="detail-body">
          <div className="detail-tags">
            <PriorityTag value={requirement.priority} />
            <span>{requirement.status}</span>
            <span>{requirement.type}</span>
          </div>
          <section>
            <h3>需求描述</h3>
            <p>{requirement.description || "暂无描述"}</p>
          </section>
          <dl>
            <div>
              <dt>所属项目</dt>
              <dd>{requirement.project}</dd>
            </div>
            <div>
              <dt>需求来源</dt>
              <dd>{requirement.source}</dd>
            </div>
            <div>
              <dt>目标完成时间</dt>
              <dd>{dueText(requirement.dueDate)}</dd>
            </div>
          </dl>
        </div>
        <div className="modal-footer">
          <p>需求详情来自本地 SQLite</p>
          <button onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}
function ProjectModal({
  name,
  setName,
  color,
  setColor,
  onClose,
  onSubmit,
}: {
  name: string;
  setName: (value: string) => void;
  color: Project["color"];
  setColor: (value: Project["color"]) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="quick-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <span>
            <FolderKanban size={18} />
          </span>
          <div>
            <h2>新建项目</h2>
            <p>项目是需求的归属容器</p>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label className="form-field">
            项目名称
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：账号服务优化"
              required
            />
          </label>
          <fieldset className="color-picker">
            <legend>项目颜色</legend>
            {(["blue", "purple", "green"] as Project["color"][]).map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  checked={color === item}
                  onChange={() => setColor(item)}
                />
                <i className={item} />
                {item === "blue" ? "蓝色" : item === "purple" ? "紫色" : "绿色"}
              </label>
            ))}
          </fieldset>
          <div className="modal-footer">
            <p>创建后即可在该项目下创建需求</p>
            <button type="submit">
              创建项目 <ChevronRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function ReportCenter({
  active,
  reports,
  snapshots,
  onGenerate,
  onSave,
  onSnapshot,
}: {
  active: string;
  reports: Report[];
  snapshots: WeeklySnapshot[];
  onGenerate: (type: "daily" | "weekly") => void;
  onSave: (
    id: number,
    values: Pick<Report, "summary" | "nextPlan" | "risks">,
  ) => Promise<void>;
  onSnapshot: () => void;
}) {
  if (active === "报告历史") {
    return (
      <section className="card report-history">
        <CardTitle title="报告历史" icon={<NotebookText size={18} />} />
        {reports.map((report) => (
          <div className="history-row" key={report.id}>
            <span className={`report-type ${report.reportType}`}>
              {report.reportType === "daily" ? "日报" : "周报"}
            </span>
            <div>
              <b>{report.title}</b>
              <small>
                {report.periodStart} — {report.periodEnd}
              </small>
            </div>
            <span>{report.snapshot.completedCount} 项完成</span>
          </div>
        ))}
        {!reports.length && (
          <p className="empty-copy">还没有报告，先生成一份日报或周报。</p>
        )}
      </section>
    );
  }
  if (active === "项目周快照") {
    return (
      <section className="card snapshot-card">
        <div className="report-toolbar">
          <CardTitle title="项目周快照" icon={<FolderKanban size={18} />} />
          <button onClick={onSnapshot}>
            <RefreshCw size={16} />
            保存本周快照
          </button>
        </div>
        <p className="section-note">
          快照保存当周项目状态，重复生成不会覆盖已有历史。
        </p>
        <div className="table-scroll">
          <table className="snapshot-table">
            <thead>
              <tr>
                <th>周期</th>
                <th>项目</th>
                <th>健康度</th>
                <th>需求</th>
                <th>已完成</th>
                <th>逾期</th>
                <th>完成率</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.weekStart}
                    <br />
                    <small>至 {item.weekEnd}</small>
                  </td>
                  <td>
                    <b>{item.project}</b>
                  </td>
                  <td>
                    <span
                      className={`health ${item.health === "正常" ? "good" : "warn"}`}
                    >
                      {item.health}
                    </span>
                  </td>
                  <td>{item.total}</td>
                  <td>{item.completed}</td>
                  <td>{item.overdue}</td>
                  <td>
                    <b>{item.completionRate}%</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!snapshots.length && (
          <p className="empty-copy">
            暂无快照，点击“保存本周快照”建立第一个基线。
          </p>
        )}
      </section>
    );
  }
  const reportType = active === "本周周报" ? "weekly" : "daily";
  const report = reports.find((item) => item.reportType === reportType);
  return (
    <div className="report-page">
      <div className="report-toolbar card">
        <div>
          <span className="eyebrow">
            {reportType === "daily" ? "DAILY REPORT" : "WEEKLY REPORT"}
          </span>
          <h2>{reportType === "daily" ? "今日日报" : "本周周报"}</h2>
          <p>
            {report
              ? `${report.periodStart} — ${report.periodEnd}`
              : "根据需求变更与项目状态自动汇总"}
          </p>
        </div>
        <button onClick={() => onGenerate(reportType)}>
          <RefreshCw size={16} />
          {report ? "重新汇总" : "生成报告"}
        </button>
      </div>
      {report ? (
        <ReportEditor key={report.id} report={report} onSave={onSave} />
      ) : (
        <Empty title="尚未生成报告" />
      )}
    </div>
  );
}
function ReportEditor({
  report,
  onSave,
}: {
  report: Report;
  onSave: (
    id: number,
    values: Pick<Report, "summary" | "nextPlan" | "risks">,
  ) => Promise<void>;
}) {
  const [summary, setSummary] = useState(report.summary);
  const [nextPlan, setNextPlan] = useState(report.nextPlan || "");
  const [risks, setRisks] = useState(report.risks || "");
  const [saving, setSaving] = useState(false);
  const snapshot = report.snapshot;
  return (
    <>
      <section className="report-metrics">
        <Metric
          icon={<Plus size={18} />}
          tone="blue"
          label="新增需求"
          value={snapshot.createdCount}
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          tone="green"
          label="完成上线"
          value={snapshot.completedCount}
        />
        <Metric
          icon={<RefreshCw size={18} />}
          tone="warm"
          label="发生更新"
          value={snapshot.changedCount}
        />
        <Metric
          icon={<Bell size={18} />}
          tone="red"
          label="当前逾期"
          value={snapshot.overdueCount}
        />
      </section>
      <section className="card report-editor">
        <label>
          工作摘要
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
          />
        </label>
        <div className="report-fields">
          <label>
            下一步计划
            <textarea
              value={nextPlan}
              onChange={(event) => setNextPlan(event.target.value)}
              rows={4}
              placeholder="补充下一阶段重点与计划…"
            />
          </label>
          <label>
            风险与阻塞
            <textarea
              value={risks}
              onChange={(event) => setRisks(event.target.value)}
              rows={4}
              placeholder="记录风险、依赖和需要关注的问题…"
            />
          </label>
        </div>
        <div className="editor-footer">
          <span>自动数据已固化，文字内容可随时编辑。</span>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(report.id, { summary, nextPlan, risks });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "保存中…" : "保存报告"}
          </button>
        </div>
      </section>
      <section className="card">
        <CardTitle title="项目情况汇总" icon={<FolderKanban size={18} />} />
        <div className="project-summary-grid">
          {snapshot.projects.map((project) => (
            <div className="project-summary" key={project.id}>
              <div>
                <b>{project.name}</b>
                <span
                  className={`health ${project.health === "正常" ? "good" : "warn"}`}
                >
                  {project.health}
                </span>
              </div>
              <p>{project.goal || "暂未设置项目目标"}</p>
              <div className="progress">
                <i
                  style={{
                    width: `${project.total ? Math.round((project.done / project.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <small>
                {project.done}/{project.total} 已完成 · {project.overdue} 项逾期
              </small>
            </div>
          ))}
        </div>
        {!snapshot.projects.length && (
          <p className="empty-copy">暂无项目数据。</p>
        )}
      </section>
    </>
  );
}
function Empty({ title, action }: { title: string; action?: () => void }) {
  return (
    <section className="card empty">
      <div>
        <FileText size={26} />
      </div>
      <h2>{title}</h2>
      <p>开始创建项目和需求，逐步建立自己的工作台。</p>
      {action && (
        <button onClick={action}>
          <Plus size={15} />
          新建项目
        </button>
      )}
    </section>
  );
}
