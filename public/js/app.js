let allTasks = [];
let allUsers = [];
let allTags = [];
let currentUser = null;
let deleteTaskId = null;
let selectedTags = [];

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) { window.location.href = '/'; return; }

  document.getElementById('currentUser').textContent = currentUser.displayName;
  const roleBadge = document.getElementById('userRole');
  if (currentUser.role === 'admin') {
    roleBadge.textContent = 'แอดมิน';
    roleBadge.style.display = '';
    document.getElementById('manageUsersBtn').style.display = '';
    document.getElementById('manageTagsBtn').style.display = '';
  }

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
    document.getElementById('darkModeToggle').textContent = '☀️';
  }

  document.getElementById('darkModeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    document.getElementById('darkModeToggle').textContent = isDark ? '☀️' : '🌙';
  });

  await loadUsers();
  await loadTags();
  await loadTasks();
  setupEventListeners();
  checkDueDateNotifications();
});

async function loadUsers() {
  const res = await fetch('/api/users');
  allUsers = await res.json();
  const select = document.getElementById('taskAssignee');
  select.innerHTML = '<option value="">-- ไม่ระบุ --</option>';
  const filterSelect = document.getElementById('filterAssignee');
  filterSelect.innerHTML = '<option value="all">ทุกคน</option>';
  allUsers.forEach(user => {
    select.innerHTML += `<option value="${user.id}">${user.displayName}</option>`;
    filterSelect.innerHTML += `<option value="${user.id}">${user.displayName}</option>`;
  });
}

async function loadTags() {
  const res = await fetch('/api/tags');
  allTags = await res.json();
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
  const assigneeFilter = document.getElementById('filterAssignee').value;

  const filtered = allTasks.filter(task => {
    const matchSearch = task.title.toLowerCase().includes(search) ||
      (task.description && task.description.toLowerCase().includes(search)) ||
      (task.assigneeName && task.assigneeName.toLowerCase().includes(search));
    const matchStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchAssignee = assigneeFilter === 'all' || task.assignee === assigneeFilter;
    return matchSearch && matchStatus && matchPriority && matchAssignee;
  });

  const lists = { 'todo': [], 'in-progress': [], 'done': [] };
  filtered.forEach(task => { if (lists[task.status]) lists[task.status].push(task); });

  renderColumn('todoList', lists['todo']);
  renderColumn('inProgressList', lists['in-progress']);
  renderColumn('doneList', lists['done']);

  document.getElementById('todoCount').textContent = lists['todo'].length;
  document.getElementById('inProgressCount').textContent = lists['in-progress'].length;
  document.getElementById('doneCount').textContent = lists['done'].length;
  document.getElementById('taskCount').textContent = `${filtered.length} งาน`;

  updateStats();
  initDragAndDrop();
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

  let tagsHtml = '';
  if (task.tags && task.tags.length > 0) {
    tagsHtml = '<div class="task-tags">' + task.tags.map(t =>
      `<span class="tag-badge" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${escapeHtml(t.name)}</span>`
    ).join('') + '</div>';
  }

  let quickActions = '';
  if (task.status === 'todo') {
    quickActions = `<button class="quick-btn quick-start" onclick="event.stopPropagation(); quickStatus('${task.id}', 'in-progress')">▶ เริ่มทำ</button>`;
  } else if (task.status === 'in-progress') {
    quickActions = `<button class="quick-btn quick-done" onclick="event.stopPropagation(); quickStatus('${task.id}', 'done')">✓ เสร็จแล้ว</button>`;
  }

  return `
    <div class="task-card" draggable="true" data-id="${task.id}" onclick="editTask('${task.id}')">
      <div class="task-card-header">
        <span class="task-card-title">${escapeHtml(task.title)}</span>
        <div class="task-card-actions">
          <button class="task-action-btn" onclick="event.stopPropagation(); editTask('${task.id}')" title="แก้ไข">✏️</button>
          <button class="task-action-btn" onclick="event.stopPropagation(); deleteTask('${task.id}')" title="ลบ">🗑️</button>
        </div>
      </div>
      ${task.description ? `<div class="task-card-desc">${escapeHtml(task.description)}</div>` : ''}
      ${tagsHtml}
      <div class="task-card-meta">
        <span class="priority-badge priority-${task.priority}">${priorityLabels[task.priority]}</span>
        ${task.assigneeName && task.assigneeName !== 'ไม่ระบุ' ? `<span class="assignee-badge">👤 ${escapeHtml(task.assigneeName)}</span>` : ''}
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

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function checkDueDateNotifications() {
  const today = new Date();
  const upcoming = allTasks.filter(t => {
    if (!t.dueDate || t.status === 'done') return false;
    const due = new Date(t.dueDate);
    const diff = (due - today) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 2;
  });
  const overdue = allTasks.filter(t => {
    if (!t.dueDate || t.status === 'done') return false;
    return new Date(t.dueDate) < today;
  });
  if (overdue.length > 0) showToast(`⚠️ มี ${overdue.length} งานเกินกำหนด!`);
  else if (upcoming.length > 0) showToast(`⏰ มี ${upcoming.length} งานใกล้ครบกำหนด (2 วัน)`);

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    if (overdue.length > 0) new Notification('Team Todolist', { body: `มี ${overdue.length} งานเกินกำหนด!` });
    else if (upcoming.length > 0) new Notification('Team Todolist', { body: `มี ${upcoming.length} งานใกล้ครบกำหนด` });
  }
}

async function updateStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statOverdue').textContent = stats.overdue;
    document.getElementById('statInProgress').textContent = stats.inProgress;
    document.getElementById('statDone').textContent = stats.done;
    document.getElementById('statCompletion').textContent = stats.completion + '%';
  } catch (e) {}
}

function setupEventListeners() {
  document.getElementById('addTaskBtn').addEventListener('click', () => openModal());
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
  document.getElementById('cancelDelete').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmDelete').addEventListener('click', confirmDeleteTask);
  document.getElementById('taskForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveTask(); });

  document.getElementById('searchInput').addEventListener('input', renderTasks);
  document.getElementById('filterStatus').addEventListener('change', renderTasks);
  document.getElementById('filterPriority').addEventListener('change', renderTasks);
  document.getElementById('filterAssignee').addEventListener('change', renderTasks);

  document.getElementById('taskModal').addEventListener('click', (e) => { if (e.target === document.getElementById('taskModal')) closeModal(); });
  document.getElementById('confirmModal').addEventListener('click', (e) => { if (e.target === document.getElementById('confirmModal')) closeConfirmModal(); });

  document.getElementById('manageUsersBtn').addEventListener('click', openUserModal);
  document.getElementById('closeUserModal').addEventListener('click', () => document.getElementById('userModal').classList.remove('active'));
  document.getElementById('passwordForm').addEventListener('submit', savePassword);
  document.getElementById('cancelPassword').addEventListener('click', () => document.getElementById('passwordModal').classList.remove('active'));
  document.getElementById('closePasswordModal').addEventListener('click', () => document.getElementById('passwordModal').classList.remove('active'));

  document.getElementById('manageTagsBtn').addEventListener('click', openTagModal);
  document.getElementById('closeTagModal').addEventListener('click', () => document.getElementById('tagModal').classList.remove('active'));
  document.getElementById('addTagBtn').addEventListener('click', addTag);
  document.getElementById('addCommentBtn').addEventListener('click', addComment);
}

// Task Modal
function openModal(task = null) {
  const modal = document.getElementById('taskModal');
  const form = document.getElementById('taskForm');
  form.reset();
  selectedTags = [];

  if (task) {
    document.getElementById('modalTitle').textContent = 'แก้ไขงาน';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskAssignee').value = task.assignee || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    if (task.tags) selectedTags = task.tags.map(t => t.id);
    document.getElementById('commentsSection').style.display = '';
    loadComments(task.id);
  } else {
    document.getElementById('modalTitle').textContent = 'เพิ่มงานใหม่';
    document.getElementById('taskId').value = '';
    document.getElementById('commentsSection').style.display = 'none';
  }

  renderTagSelector();
  modal.classList.add('active');
}

function closeModal() { document.getElementById('taskModal').classList.remove('active'); }

function renderTagSelector() {
  const container = document.getElementById('taskTags');
  container.innerHTML = allTags.map(tag => {
    const checked = selectedTags.includes(tag.id);
    return `<label class="tag-option ${checked ? 'selected' : ''}" style="border-color:${tag.color};background:${checked ? tag.color + '20' : 'transparent'}">
      <input type="checkbox" value="${tag.id}" ${checked ? 'checked' : ''} onchange="toggleTag('${tag.id}')" style="display:none">
      <span class="tag-dot" style="background:${tag.color}"></span> ${escapeHtml(tag.name)}
    </label>`;
  }).join('');
}

function toggleTag(tagId) {
  const idx = selectedTags.indexOf(tagId);
  if (idx >= 0) selectedTags.splice(idx, 1);
  else selectedTags.push(tagId);
  renderTagSelector();
}

// Comments
async function loadComments(taskId) {
  const res = await fetch(`/api/tasks/${taskId}/comments`);
  const comments = await res.json();
  const container = document.getElementById('commentsList');
  container.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <strong>${escapeHtml(c.userName)}</strong>
        <span class="comment-date">${new Date(c.createdAt).toLocaleString('th-TH')}</span>
        ${c.userId === currentUser.id ? `<button class="task-action-btn" onclick="deleteComment('${c.id}','${taskId}')" title="ลบ">🗑️</button>` : ''}
      </div>
      <div class="comment-body">${escapeHtml(c.content)}</div>
    </div>
  `).join('');
}

async function addComment() {
  const taskId = document.getElementById('taskId').value;
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content || !taskId) return;
  await fetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, userName: currentUser.displayName, content })
  });
  input.value = '';
  loadComments(taskId);
}

async function deleteComment(commentId, taskId) {
  await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
  loadComments(taskId);
}

// Confirm Delete
function openConfirmModal(taskId) { deleteTaskId = taskId; document.getElementById('confirmModal').classList.add('active'); }
function closeConfirmModal() { deleteTaskId = null; document.getElementById('confirmModal').classList.remove('active'); }

async function saveTask() {
  const id = document.getElementById('taskId').value;
  const taskData = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    assignee: document.getElementById('taskAssignee').value,
    priority: document.getElementById('taskPriority').value,
    status: document.getElementById('taskStatus').value,
    dueDate: document.getElementById('taskDueDate').value,
    tags: selectedTags
  };
  if (id) {
    await fetch(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskData) });
  } else {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskData) });
  }
  closeModal();
  await loadTasks();
}

function editTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (task) openModal(task);
}

function deleteTask(id) { openConfirmModal(id); }

async function confirmDeleteTask() {
  if (deleteTaskId) {
    await fetch(`/api/tasks/${deleteTaskId}`, { method: 'DELETE' });
    closeConfirmModal();
    await loadTasks();
  }
}

async function quickStatus(id, newStatus) {
  await fetch(`/api/tasks/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
  await loadTasks();
}

// User Management
async function openUserModal() {
  document.getElementById('userModal').classList.add('active');
  const res = await fetch('/api/users');
  const users = await res.json();
  const container = document.getElementById('userList');
  container.innerHTML = users.map(u => `
    <div class="user-item">
      <div class="user-info">
        <strong>${escapeHtml(u.displayName)}</strong>
        <span class="user-meta">@${escapeHtml(u.username)} · ${u.role === 'admin' ? 'แอดมิน' : 'สมาชิก'}</span>
      </div>
      <div class="user-actions">
        <button class="btn btn-outline btn-sm" onclick="openPasswordModal('${u.id}')">เปลี่ยนรหัสผ่าน</button>
        ${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}','${escapeHtml(u.displayName)}')">ลบ</button>` : ''}
      </div>
    </div>
  `).join('');
}

function openPasswordModal(userId) {
  document.getElementById('passwordUserId').value = userId;
  document.getElementById('passwordForm').reset();
  document.getElementById('passwordError').textContent = '';
  document.getElementById('passwordModal').classList.add('active');
}

async function savePassword(e) {
  e.preventDefault();
  const userId = document.getElementById('passwordUserId').value;
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const errorEl = document.getElementById('passwordError');
  try {
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error; return; }
    document.getElementById('passwordModal').classList.remove('active');
    showToast('เปลี่ยนรหัสผ่านสำเร็จ');
  } catch (err) { errorEl.textContent = 'เกิดข้อผิดพลาด'; }
}

async function deleteUser(userId, name) {
  if (!confirm(`ต้องการลบผู้ใช้ "${name}" ใช่หรือไม่?`)) return;
  await fetch(`/api/users/${userId}`, { method: 'DELETE' });
  showToast('ลบผู้ใช้สำเร็จ');
  openUserModal();
  await loadUsers();
}

// Tag Management
async function openTagModal() {
  document.getElementById('tagModal').classList.add('active');
  renderTagListAdmin();
}

function renderTagListAdmin() {
  const container = document.getElementById('tagListAdmin');
  container.innerHTML = allTags.map(t => `
    <div class="tag-admin-item">
      <span class="tag-dot" style="background:${t.color}"></span>
      <span>${escapeHtml(t.name)}</span>
      <button class="task-action-btn" onclick="deleteTag('${t.id}')" title="ลบ">🗑️</button>
    </div>
  `).join('');
}

async function addTag() {
  const name = document.getElementById('newTagName').value.trim();
  const color = document.getElementById('newTagColor').value;
  if (!name) return;
  const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }) });
  if (res.ok) {
    document.getElementById('newTagName').value = '';
    await loadTags();
    renderTagListAdmin();
  }
}

async function deleteTag(id) {
  await fetch(`/api/tags/${id}`, { method: 'DELETE' });
  await loadTags();
  renderTagListAdmin();
}

// Drag & Drop
function initDragAndDrop() {
  const cards = document.querySelectorAll('.task-card[draggable]');
  const columns = document.querySelectorAll('.task-list');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  columns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = col.closest('.column').dataset.status;
      await quickStatus(taskId, newStatus);
    });
  });
}
