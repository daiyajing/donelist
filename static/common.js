/* ============================================================
   个人工作台 · 共享脚本 v3
   ============================================================ */
// Inject font: Sora for display/headings/numbers
(function injectFonts() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(link);
})();

const API = {
  todos: () => fetch('/api/todos').then(r => r.json()),
  createTodo: (d) => fetch('/api/todos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  updateTodo: (id, d) => fetch(`/api/todos/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  deleteTodo: (id) => fetch(`/api/todos/${id}`, { method: 'DELETE' }).then(r => r.json()),
  reorderTodos: (d) => fetch('/api/todos/reorder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  dones: () => fetch('/api/dones').then(r => r.json()),
  createDone: (d) => fetch('/api/dones', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  updateDone: (id, d) => fetch(`/api/dones/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  deleteDone: (id) => fetch(`/api/dones/${id}`, { method: 'DELETE' }).then(r => r.json()),
  habits: () => fetch('/api/habits').then(r => r.json()),
  createHabit: (d) => fetch('/api/habits', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  deleteHabit: (id) => fetch(`/api/habits/${id}`, { method: 'DELETE' }).then(r => r.json()),
  setHabitRecord: (id, d) => fetch(`/api/habits/${id}/record`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
};

/* ---------- Date utilities ---------- */
function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() - (nd.getDay()+6)%7);
  nd.setHours(0,0,0,0);
  return nd;
}
function durationMin(start, end) {
  if (!start || !end) return 0;
  const [sh,sm] = start.split(':').map(Number), [eh,em] = end.split(':').map(Number);
  let mins = eh*60+em - (sh*60+sm);
  if (mins < 0) mins += 24*60;
  return mins;
}
function fmtMin(m) {
  if (m <= 0) return '0分';
  const h = Math.floor(m/60), min = m%60;
  if (h === 0) return `${min}分`;
  if (min === 0) return `${h}小时`;
  return `${h}小时${min}分`;
}
function fmtDateShort(ds) { return ds ? `${parseInt(ds.slice(5,7))}/${parseInt(ds.slice(8,10))}` : ''; }
function daysUntil(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T23:59:59');
  return Math.ceil((d - new Date()) / 86400000);
}
function fmtDeadline(ds) {
  if (!ds) return null;
  const d = daysUntil(ds);
  const date = new Date(ds);
  const m = date.getMonth() + 1, day = date.getDate();
  if (d < 0) return { text: '逾期', cls: 'overdue' };
  if (d === 0) return { text: '今天', cls: 'today' };
  if (d === 1) return { text: '明天', cls: '' };
  if (d <= 7) return { text: d + '天', cls: '' };
  return { text: `${m}/${day}`, cls: '' };
}
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
const DOWS = ['一','二','三','四','五','六','日'];

/* ---------- Importance (0-3, exclamation marks) ---------- */
const IMP_INFO = {
  0: { label: '无', icon: '', desc: '不重要不紧急' },
  1: { label: '低', icon: '!', desc: '不重要但紧急' },
  2: { label: '中', icon: '!!', desc: '重要不紧急' },
  3: { label: '高', icon: '!!!', desc: '重要紧急' },
};
function impHtml(imp) {
  if (!imp) return '';
  const info = IMP_INFO[imp];
  return `<span class="imp-icon imp-${imp}" title="${info.label}优先级 · ${info.desc}">${info.icon}</span>`;
}

/* ---------- Tree helpers ---------- */
function getChildren(todos, pid) { return todos.filter(t => t.parent_id === pid).sort((a,b)=>a.sort_order-b.sort_order); }
function getTodo(todos, id) { return todos.find(t => t.id === id); }
function hasChildren(todos, id) { return todos.some(t => t.parent_id === id); }
function todoTime(todos, dones, id) {
  let total = 0; const stack = [id]; const visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue; visited.add(cur);
    dones.filter(d => d.todo_id === cur).forEach(d => total += durationMin(d.start_time, d.end_time));
    getChildren(todos, cur).forEach(c => stack.push(c.id));
  }
  return total;
}
function todoDoneCount(todos, dones, id) {
  let n = 0; const stack = [id]; const visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue; visited.add(cur);
    n += dones.filter(d => d.todo_id === cur).length;
    getChildren(todos, cur).forEach(c => stack.push(c.id));
  }
  return n;
}
function todoDones(todos, dones, id) {
  const result = []; const stack = [id]; const visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue; visited.add(cur);
    dones.filter(d => d.todo_id === cur).forEach(d => result.push(d));
    getChildren(todos, cur).forEach(c => stack.push(c.id));
  }
  return result.sort((a,b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
}
function getRootParent(todos, id) {
  let t = getTodo(todos, id);
  while (t && t.parent_id) t = getTodo(todos, t.parent_id);
  return t;
}
function getFolderPath(todos, id) {
  const path = []; let t = getTodo(todos, id);
  while (t && t.parent_id) {
    const p = getTodo(todos, t.parent_id);
    if (p) path.unshift(p.title);
    t = p;
  }
  return path;
}
function isDescendant(todos, id, ancestorId) {
  const desc = new Set(); const stack = [ancestorId];
  while (stack.length) {
    const cur = stack.pop();
    if (desc.has(cur)) continue; desc.add(cur);
    getChildren(todos, cur).forEach(c => stack.push(c.id));
  }
  return desc.has(id);
}
const TODO_COLORS = ['#5b8a5e','#5b7a99','#b8954a','#a06850','#6b6b8f'];
function todoColor(todos, id) {
  const root = getRootParent(todos, id);
  if (!root) return TODO_COLORS[0];
  const roots = todos.filter(t => !t.parent_id);
  const idx = roots.findIndex(t => t.id === root.id);
  return TODO_COLORS[idx % TODO_COLORS.length];
}

/* ---------- Toast & Modal ---------- */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1800);
}
function openModal(title, bodyHtml, onConfirm, opts = {}) {
  let mask = document.getElementById('modalMask');
  if (!mask) {
    mask = document.createElement('div'); mask.id = 'modalMask'; mask.className = 'modal-mask';
    document.body.appendChild(mask);
    mask.addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });
  }
  const footHtml = opts.hideFoot ? '' : `<div class="modal-foot"><button class="btn" id="modalCancel">取消</button><button class="btn primary" id="modalOk">确定</button></div>`;
  mask.innerHTML = `<div class="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div>${footHtml}</div>`;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  if (!opts.hideFoot) {
    document.getElementById('modalCancel').onclick = closeModal;
    document.getElementById('modalOk').onclick = onConfirm;
  }
  mask.classList.add('show');
  setTimeout(() => { const f = document.querySelector('#modalBody input, #modalBody textarea'); if (f) f.focus(); }, 50);
  return mask;
}
function closeModal() { document.getElementById('modalMask')?.classList.remove('show'); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

/* ---------- Navigation ---------- */
const NAV_ITEMS = [
  { id: 'index', label: '首页', href: 'index.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>' },
  { id: 'todos', label: '待办', href: 'todos.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3"/><path d="M9 3h6"/></svg>' },
  { id: 'calendar', label: '日历', href: 'calendar.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' },
  { id: 'stats', label: '统计', href: 'stats.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>' },
  { id: 'habits', label: '习惯', href: 'habits.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' },
];
function getDateStr() {
  const d = new Date();
  return `${d.getMonth()+1}月${d.getDate()}日 周${DOWS[(d.getDay()+6)%7]}`;
}
function renderSidebar(activeId) {
  const dateStr = getDateStr();
  const items = NAV_ITEMS.map(it => `<a class="nav-item ${it.id===activeId?'active':''}" href="${it.href}">${it.icon}${it.label}</a>`).join('');
  return `<div class="brand"><h1>我的工作台</h1><p>${dateStr}</p></div><nav class="nav">${items}</nav>`;
}
function renderTopbar() {
  return `<h1>我的工作台</h1><span class="date">${getDateStr()}</span>`;
}
function renderTabbar(activeId) {
  return NAV_ITEMS.map(it => `<a class="tab-item ${it.id===activeId?'active':''}" href="${it.href}">${it.icon}<span>${it.label}</span></a>`).join('');
}
