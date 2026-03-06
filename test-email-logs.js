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

async function getEmailLogStats(token) {
  const res = await fetch(`${BASE_URL}/settings/email-logs/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function getEmailLogs(token) {
  const params = new URLSearchParams({ page: 1, limit: 10 });
  const res = await fetch(`${BASE_URL}/settings/email-logs?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  try {
    console.log('1) Admin login');
    const token = await loginAdmin();
    console.log('   OK');

    console.log('2) GET /settings/email-logs/stats');
    const stats = await getEmailLogStats(token);
    console.log('   Status:', stats.status, stats.data.success ? 'Success' : 'Failed');
    if (!stats.data.success) console.error(stats.data);

    console.log('3) GET /settings/email-logs');
    const logs = await getEmailLogs(token);
    console.log('   Status:', logs.status, logs.data.success ? 'Success' : 'Failed');
    if (!logs.data.success) console.error(logs.data);
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  }
}

main();
