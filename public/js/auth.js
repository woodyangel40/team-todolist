document.addEventListener('DOMContentLoaded', () => {
  const isLoginPage = window.location.pathname === '/' || window.location.pathname === '/index.html';
  const isRegisterPage = window.location.pathname === '/register.html';
  const isDashboard = window.location.pathname === '/dashboard.html';

  if (isDashboard) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) {
      window.location.href = '/';
      return;
    }
    const displayName = user.displayName || user.username;
    const userEl = document.getElementById('currentUser');
    if (userEl) userEl.textContent = displayName;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = '/';
      });
    }
    return;
  }

  const user = JSON.parse(localStorage.getItem('currentUser'));
  if (user && (isLoginPage || isRegisterPage)) {
    window.location.href = '/dashboard.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const errorMsg = document.getElementById('errorMsg');
      errorMsg.textContent = '';

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
          errorMsg.textContent = data.error;
          return;
        }

        localStorage.setItem('currentUser', JSON.stringify(data));
        window.location.href = '/dashboard.html';
      } catch (err) {
        errorMsg.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('displayName').value;
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const errorMsg = document.getElementById('errorMsg');
      errorMsg.textContent = '';

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, displayName })
        });
        const data = await res.json();

        if (!res.ok) {
          errorMsg.textContent = data.error;
          return;
        }

        localStorage.setItem('currentUser', JSON.stringify(data));
        window.location.href = '/dashboard.html';
      } catch (err) {
        errorMsg.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      }
    });
  }
});
