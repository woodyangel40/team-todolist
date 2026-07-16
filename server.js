const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static('public'));

// Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const user = rows[0];
    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    }
    const id = uuidv4();
    await pool.query(
      'INSERT INTO users (id, username, password, display_name, role) VALUES ($1,$2,$3,$4,$5)',
      [id, username, password, displayName, 'member']
    );
    res.json({ id, username, displayName, role: 'member' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Users Management
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, display_name, role FROM users ORDER BY id');
    res.json(rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role })));
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { displayName, role } = req.body;
  try {
    await pool.query('UPDATE users SET display_name = $1, role = $2 WHERE id = $3', [displayName, role, id]);
    const { rows } = await pool.query('SELECT id, username, display_name, role FROM users WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const u = rows[0];
    res.json({ id: u.id, username: u.username, displayName: u.display_name, role: u.role });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.put('/api/users/:id/password', async (req, res) => {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (rows[0].password !== currentPassword) {
      return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1 AND role != $2', [id, 'admin']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { rows: tasks } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    const { rows: users } = await pool.query('SELECT id, display_name FROM users');
    const { rows: allTags } = await pool.query('SELECT t.id, t.name, t.color, tt.task_id FROM tags t LEFT JOIN task_tags tt ON t.id = tt.tag_id');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.display_name; });
    const taskTagsMap = {};
    allTags.forEach(t => {
      if (t.task_id) {
        if (!taskTagsMap[t.task_id]) taskTagsMap[t.task_id] = [];
        taskTagsMap[t.task_id].push({ id: t.id, name: t.name, color: t.color });
      }
    });
    const enriched = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignee: t.assignee,
      priority: t.priority,
      status: t.status,
      dueDate: t.due_date,
      createdAt: t.created_at,
      cost: parseFloat(t.cost) || 0,
      taskType: t.task_type || '',
      assigneeName: userMap[t.assignee] || 'ไม่ระบุ',
      tags: taskTagsMap[t.id] || []
    }));
    res.json(enriched);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title, description, assignee, priority, status, dueDate, tags, cost, taskType } = req.body;
  if (!title) return res.status(400).json({ error: 'กรุณากรอกชื่องาน' });
  try {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, created_at, cost, task_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, title, description || '', assignee || '', priority || 'medium', status || 'todo', dueDate || '', createdAt, cost || 0, taskType || '']
    );
    if (tags && tags.length > 0) {
      for (const tagId of tags) {
        await pool.query('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [id, tagId]);
      }
    }
    res.json({ id, title, description, assignee, priority, status, dueDate, createdAt, cost: cost || 0, taskType: taskType || '', tags: tags || [] });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, assignee, priority, status, dueDate, tags, cost, taskType } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'ไม่พบงาน' });
    await pool.query(
      `UPDATE tasks SET title=$1, description=$2, assignee=$3, priority=$4, status=$5, due_date=$6, cost=$7, task_type=$8 WHERE id=$9`,
      [
        title || existing.rows[0].title,
        description !== undefined ? description : existing.rows[0].description,
        assignee !== undefined ? assignee : existing.rows[0].assignee,
        priority || existing.rows[0].priority,
        status || existing.rows[0].status,
        dueDate !== undefined ? dueDate : existing.rows[0].due_date,
        cost !== undefined ? cost : existing.rows[0].cost,
        taskType !== undefined ? taskType : existing.rows[0].task_type,
        id
      ]
    );
    if (tags !== undefined) {
      await pool.query('DELETE FROM task_tags WHERE task_id = $1', [id]);
      if (tags && tags.length > 0) {
        for (const tagId of tags) {
          await pool.query('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [id, tagId]);
        }
      }
    }
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const t = rows[0];
    res.json({ id: t.id, title: t.title, description: t.description, assignee: t.assignee, priority: t.priority, status: t.status, dueDate: t.due_date, createdAt: t.created_at, cost: parseFloat(t.cost) || 0, taskType: t.task_type || '', tags: tags || [] });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.put('/api/tasks/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE tasks SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM task_tags WHERE task_id = $1', [id]);
    await pool.query('DELETE FROM comments WHERE task_id = $1', [id]);
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Comments
app.get('/api/tasks/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at ASC', [id]);
    res.json(rows.map(c => ({
      id: c.id, taskId: c.task_id, userId: c.user_id, userName: c.user_name, content: c.content, createdAt: c.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/api/tasks/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { userId, userName, content } = req.body;
  if (!content) return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความ' });
  try {
    const commentId = uuidv4();
    const createdAt = new Date().toISOString();
    await pool.query(
      'INSERT INTO comments (id, task_id, user_id, user_name, content, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [commentId, id, userId, userName, content, createdAt]
    );
    res.json({ id: commentId, taskId: id, userId, userName, content, createdAt });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Tags
app.get('/api/tags', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tags ORDER BY name');
    res.json(rows.map(t => ({ id: t.id, name: t.name, color: t.color })));
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/api/tags', async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อแท็ก' });
  try {
    const id = uuidv4();
    await pool.query('INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)', [id, name, color || '#667eea']);
    res.json({ id, name, color: color || '#667eea' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'แท็กนี้มีอยู่แล้ว' });
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM task_tags WHERE tag_id = $1', [id]);
    await pool.query('DELETE FROM tags WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const { rows: tasks } = await pool.query('SELECT * FROM tasks');
    const { rows: users } = await pool.query('SELECT id, display_name FROM users');

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const completion = total > 0 ? Math.round((done / total) * 100) : 0;

    const perUser = users.map(u => {
      const userTasks = tasks.filter(t => t.assignee === u.id);
      const userDone = userTasks.filter(t => t.status === 'done').length;
      const userOverdue = userTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;
      const userDoneOnTime = userTasks.filter(t => {
        if (t.status !== 'done' || !t.due_date) return false;
        return new Date(t.created_at) <= new Date(t.due_date);
      }).length;
      return {
        userId: u.id,
        displayName: u.display_name,
        total: userTasks.length,
        done: userDone,
        overdue: userOverdue,
        completion: userTasks.length > 0 ? Math.round((userDone / userTasks.length) * 100) : 0
      };
    });

    res.json({ total, done, overdue, inProgress, completion, perUser });
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

// Room Report
app.get('/api/room-report', async (req, res) => {
  const { tag_id, start_date, end_date } = req.query;
  try {
    let query = `
      SELECT t.*, tt.tag_id, tg.name as tag_name, tg.color as tag_color
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (tag_id) {
      query += ` AND tt.tag_id = $${paramIdx++}`;
      params.push(tag_id);
    }
    if (start_date) {
      query += ` AND t.created_at >= $${paramIdx++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND t.created_at <= $${paramIdx++}`;
      params.push(end_date + 'T23:59:59.999Z');
    }
    query += ' ORDER BY t.created_at DESC';

    const { rows } = await pool.query(query, params);

    const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

    const byType = {};
    rows.forEach(r => {
      const type = r.task_type || 'อื่นๆ';
      if (!byType[type]) byType[type] = { count: 0, cost: 0 };
      byType[type].count++;
      byType[type].cost += parseFloat(r.cost) || 0;
    });

    res.json({
      tasks: rows.map(r => ({
        id: r.id, title: r.title, description: r.description, status: r.status,
        cost: parseFloat(r.cost) || 0, taskType: r.task_type || '',
        roomName: r.tag_name || '', roomColor: r.tag_color || '',
        createdAt: r.created_at, dueDate: r.due_date
      })),
      totalTasks: rows.length,
      totalCost,
      byType
    });
  } catch (err) {
    console.error('Room report error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
