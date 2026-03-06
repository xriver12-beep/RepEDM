const BASE_URL = 'http://localhost:3001/api';

async function loginAdmin() {
  const res = await fetch(`${BASE_URL}/admin-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Login failed');
  return data.token;
}

async function getMe(token) {
  const res = await fetch(`${BASE_URL}/admin-auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  try {
    console.log('Login as admin...');
    const token = await loginAdmin();
    console.log('Token OK');
    const me = await getMe(token);
    console.log('Status:', me.status, me.data.success ? 'Success' : 'Failed');
    console.log('User:', me.data.user);
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  }
}

main();
