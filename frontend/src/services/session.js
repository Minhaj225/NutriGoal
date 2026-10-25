const key = 'authSession';
const oldKeys = ['token', 'isAdmin', 'adminUser'];

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(key));
    return typeof session?.token === 'string' && session.token &&
      ['admin', 'staff', 'student'].includes(session.role) && typeof session.username === 'string' &&
      (session.role !== 'student' || typeof session.email === 'string')
      ? session : null;
  } catch {
    return null;
  }
}

export function saveSession({ token, role, username, email }) {
  if (typeof token !== 'string' || !token || !['admin', 'staff', 'student'].includes(role) ||
      typeof username !== 'string' || !username || (role === 'student' && typeof email !== 'string')) {
    throw new Error('Invalid login response');
  }
  localStorage.setItem(key, JSON.stringify({ token, role, username, ...(role === 'student' ? { email } : {}) }));
  oldKeys.forEach(oldKey => localStorage.removeItem(oldKey));
  window.dispatchEvent(new Event('adminLoginChange'));
}

export function clearSession() {
  localStorage.removeItem(key);
  oldKeys.forEach(oldKey => localStorage.removeItem(oldKey));
  window.dispatchEvent(new Event('adminLoginChange'));
}
