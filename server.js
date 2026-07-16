const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

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

// Tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { rows: tasks } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    const { rows: users } = await pool.query('SELECT id, display_name FROM users');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.display_name; });
    const enriched = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assignee: t.assignee,
      priority: t.priority,
      status: t.status,
      dueDate: t.due_date,
      createdAt: t.created_at,
      assigneeName: userMap[t.assignee] || 'ไม่ระบุ'
    }));
    res.json(enriched);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title, description, assignee, priority, status, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'กรุณากรอกชื่องาน' });
  try {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, title, description || '', assignee || '', priority || 'medium', status || 'todo', dueDate || '', createdAt]
    );
    res.json({ id, title, description, assignee, priority, status, dueDate, createdAt });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, assignee, priority, status, dueDate } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'ไม่พบงาน' });
    await pool.query(
      `UPDATE tasks SET title=$1, description=$2, assignee=$3, priority=$4, status=$5, due_date=$6 WHERE id=$7`,
      [
        title || existing.rows[0].title,
        description !== undefined ? description : existing.rows[0].description,
        assignee !== undefined ? assignee : existing.rows[0].assignee,
        priority || existing.rows[0].priority,
        status || existing.rows[0].status,
        dueDate !== undefined ? dueDate : existing.rows[0].due_date,
        id
      ]
    );
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const t = rows[0];
    res.json({ id: t.id, title: t.title, description: t.description, assignee: t.assignee, priority: t.priority, status: t.status, dueDate: t.due_date, createdAt: t.created_at });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, display_name, role FROM users');
    res.json(rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role })));
  } catch (err) {
    console.error('Get users error:', err);
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
