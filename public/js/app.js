let allTasks = [];
let allUsers = [];
let currentUser = null;
let deleteTaskId = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    window.location.href = '/';
    return;
  }

  document.getElementById('currentUser').textContent = currentUser.displayName;

  await loadUsers();
  await loadTasks();
  setupEventListeners();
});

async function loadUsers() {
  const res = await fetch('/api/users');
  allUsers = await res.json();
  const select = document.getElementById('taskAssignee');
  select.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
  allUsers.forEach(user => {
    select.innerHTML += `<option value="${user.id}">${user.displayName}</option>`;
  });
}

async function loadTasks() {
  const res = await fetch('/api/tasks');
  allTasks = await res.json();
  renderTasks();
}

function renderTasks() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const statusFilter = document.getElementById('filterStatus').value;
  const priorityFilter = document.getElementById('filterPriority').value;

  const filtered = allTasks.filter(task => {
    const matchSearch = task.title.toLowerCase().includes(search) ||
      (task.description && task.description.toLowerCase().includes(search)) ||
      (task.assigneeName && task.assigneeName.toLowerCase().includes(search));
    const matchStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const lists = { 'todo': [], 'in-progress': [], 'done': [] };
  filtered.forEach(task => {
    if (lists[task.status]) lists[task.status].push(task);
  });

  renderColumn('todoList', lists['todo']);
  renderColumn('inProgressList', lists['in-progress']);
  renderColumn('doneList', lists['done']);

  document.getElementById('todoCount').textContent = lists['todo'].length;
  document.getElementById('inProgressCount').textContent = lists['in-progress'].length;
  document.getElementById('doneCount').textContent = lists['done'].length;
  document.getElementById('taskCount').textContent = `${filtered.length} งาน`;
  updateStats();
}

function renderColumn(elementId, tasks) {
  const container = document.getElementById(elementId);
  container.innerHTML = tasks.map(task => createTaskCard(task)).join('');
}

function createTaskCard(task) {
  const priorityLabels = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done';

  let dueDateHtml = '';
  if (task.dueDate) {
    const date = new Date(task.dueDate).toLocaleDateString('th-TH');
    const overdueClass = isOverdue ? 'overdue' : '';
    dueDateHtml = `<span class="due-date-badge ${overdueClass}">📅 ${date}</span>`;
  }

  let quickActions = '';
  if (task.status === 'todo') {
    quickActions = `<button class="quick-btn quick-start" onclick="event.stopPropagation(); quickStatus('${task.id}', 'in-progress')">▶ เริ่มทำ</button>`;
  } else if (task.status === 'in-progress') {
    quickActions = `<button class="quick-btn quick-done" onclick="event.stopPropagation(); quickStatus('${task.id}', 'done')">✓ เสร็จแล้ว</button>`;
  }

  return `
    <div class="task-card" data-id="${task.id}" onclick="editTask('${task.id}')">
      <div class="task-card-header">
        <span class="task-card-title">${escapeHtml(task.title)}</span>
        <div class="task-card-actions">
          <button class="task-action-btn" onclick="event.stopPropagation(); editTask('${task.id}')" title="แก้ไข">✏️</button>
          <button class="task-action-btn" onclick="event.stopPropagation(); deleteTask('${task.id}')" title="ลบ">🗑️</button>
        </div>
      </div>
      ${task.description ? `<div class="task-card-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-card-meta">
        <span class="priority-badge priority-${task.priority}">${priorityLabels[task.priority]}</span>
        ${task.assigneeName ? `<span class="assignee-badge">👤 ${escapeHtml(task.assigneeName)}</span>` : ''}
        ${dueDateHtml}
      </div>
      ${quickActions ? `<div class="task-card-footer">${quickActions}</div>` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupEventListeners() {
  document.getElementById('addTaskBtn').addEventListener('click', () => openModal());
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelDelete').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDelete').addEventListener('click', confirmDeleteTask);

  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTask();
  });

  document.getElementById('searchInput').addEventListener('input', renderTasks);
  document.getElementById('filterStatus').addEventListener('change', renderTasks);
  document.getElementById('filterPriority').addEventListener('change', renderTasks);

  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('taskModal')) closeModal();
  });
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirmModal')) closeConfirmModal();
  });
}

function openModal(task = null) {
  const modal = document.getElementById('taskModal');
  const form = document.getElementById('taskForm');
  form.reset();

  if (task) {
    document.getElementById('modalTitle').textContent = 'แก้ไขงาน';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskAssignee').value = task.assignee || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskDueDate').value = task.dueDate || '';
  } else {
    document.getElementById('modalTitle').textContent = 'เพิ่มงานใหม่';
    document.getElementById('taskId').value = '';
  }

  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('taskModal').classList.remove('active');
}

function openConfirmModal(taskId) {
  deleteTaskId = taskId;
  document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
  deleteTaskId = null;
  document.getElementById('confirmModal').classList.remove('active');
}

async function saveTask() {
  const id = document.getElementById('taskId').value;
  const taskData = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    assignee: document.getElementById('taskAssignee').value,
    priority: document.getElementById('taskPriority').value,
    status: document.getElementById('taskStatus').value,
    dueDate: document.getElementById('taskDueDate').value
  };

  if (id) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
  } else {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
  }

  closeModal();
  await loadTasks();
}

function editTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (task) openModal(task);
}

function deleteTask(id) {
  openConfirmModal(id);
}

async function confirmDeleteTask() {
  if (deleteTaskId) {
    await fetch(`/api/tasks/${deleteTaskId}`, { method: 'DELETE' });
    closeConfirmModal();
    await loadTasks();
  }
}

async function quickStatus(id, newStatus) {
  await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  await loadTasks();
}

function updateStats() {
  const total = allTasks.length;
  const done = allTasks.filter(t => t.status === 'done').length;
  const inProgress = allTasks.filter(t => t.status === 'in-progress').length;
  const overdue = allTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done').length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statInProgress').textContent = inProgress;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statCompletion').textContent = completion + '%';
}
