const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT DEFAULT 'member'
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        assignee TEXT DEFAULT '',
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'todo',
        due_date TEXT DEFAULT '',
        created_at TEXT DEFAULT ''
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT DEFAULT '',
        content TEXT NOT NULL,
        created_at TEXT DEFAULT ''
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        color TEXT DEFAULT '#667eea'
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_tags (
        task_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (task_id, tag_id)
      )
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT '';
      EXCEPTION WHEN duplicate_column THEN null;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT '';
      EXCEPTION WHEN duplicate_column THEN null;
      END $$;
    `);

    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      await client.query(
        `INSERT INTO users (id, username, password, display_name, role) VALUES ($1, $2, $3, $4, $5)`,
        ['1', 'admin', 'admin123', 'Admin', 'admin']
      );
      await client.query(
        `INSERT INTO users (id, username, password, display_name, role) VALUES ($1, $2, $3, $4, $5)`,
        ['2', 'user1', 'user123', 'สมชาย ใจดี', 'member']
      );
      console.log('Default users created');
    }

    const taskCount = await client.query('SELECT COUNT(*) FROM tasks');
    if (parseInt(taskCount.rows[0].count) === 0) {
      await client.query(
        `INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        ['1', 'ออกแบบ UI หน้าแรก', 'ออกแบบ wireframe สำหรับหน้าแรกของเว็บไซต์', '2', 'high', 'in-progress', '2026-07-20', '2026-07-16T10:00:00.000Z']
      );
      await client.query(
        `INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        ['2', 'เขียน API สำหรับ login', 'สร้าง API endpoint สำหรับ authentication', '1', 'high', 'todo', '2026-07-18', '2026-07-16T10:00:00.000Z']
      );
      await client.query(
        `INSERT INTO tasks (id, title, description, assignee, priority, status, due_date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        ['3', 'ทดสอบระบบ', 'ทดสอบ functionality ทั้งหมดของระบบ', '2', 'medium', 'todo', '2026-07-25', '2026-07-16T10:00:00.000Z']
      );
      console.log('Default tasks created');
    }

    const tagCount = await client.query('SELECT COUNT(*) FROM tags');
    if (parseInt(tagCount.rows[0].count) === 0) {
      await client.query(`INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)`, ['tag1', 'Frontend', '#667eea']);
      await client.query(`INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)`, ['tag2', 'Backend', '#e74c3c']);
      await client.query(`INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)`, ['tag3', 'Design', '#f39c12']);
      await client.query(`INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)`, ['tag4', 'Bug', '#e74c3c']);
      await client.query(`INSERT INTO tags (id, name, color) VALUES ($1,$2,$3)`, ['tag5', 'Feature', '#27ae60']);
      console.log('Default tags created');
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
