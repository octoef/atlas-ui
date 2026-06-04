// Semaphore API integration for Atlas UI
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (no insecure default; set it in the runtime env)`);
  return v;
}
const SEMAPHORE_URL = process.env.SEMAPHORE_URL || 'http://localhost:3002';
const SEMAPHORE_USER = process.env.SEMAPHORE_USER || 'admin';
const SEMAPHORE_PASS = requireEnv('SEMAPHORE_PASS');
const TIMEOUT_MS = 2000;

let sessionCookie = null;
let sessionExpiry = null;

async function login() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const res = await fetch(`${SEMAPHORE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: SEMAPHORE_USER,
        password: SEMAPHORE_PASS
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Semaphore login failed: ${res.status}`);
    }

    // Extract session cookie
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
      sessionExpiry = Date.now() + (30 * 60 * 1000); // 30 min
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchWithAuth(endpoint) {
  // Re-login if session expired
  if (!sessionCookie || Date.now() > sessionExpiry) {
    const loggedIn = await login();
    if (!loggedIn) return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const res = await fetch(`${SEMAPHORE_URL}${endpoint}`, {
      headers: { 'Cookie': sessionCookie },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      sessionCookie = null;
      return fetchWithAuth(endpoint);
    }

    if (!res.ok) {
      throw new Error(`Semaphore API error: ${res.status}`);
    }

    return res.json();
  } catch (error) {
    console.error(`Semaphore fetch error (${endpoint}):`, error.message);
    return null;
  }
}

export async function getSchedules() {
  const schedules = await fetchWithAuth('/api/project/1/schedules');
  return schedules || [];
}

export async function getTasks(limit = 10) {
  const tasks = await fetchWithAuth('/api/project/1/tasks?count=' + limit);
  return tasks || [];
}

export async function getTemplates() {
  const templates = await fetchWithAuth('/api/project/1/templates');
  return templates || [];
}

export async function runTask(templateId) {
  if (!sessionCookie || Date.now() > sessionExpiry) {
    const loggedIn = await login();
    if (!loggedIn) return { error: 'Login failed' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`${SEMAPHORE_URL}/api/project/1/tasks`, {
      method: 'POST',
      headers: { 
        'Cookie': sessionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: templateId,
        debug: false,
        dry_run: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { error: `Failed: ${res.status}` };
    }

    return await res.json();
  } catch (error) {
    return { error: error.message };
  }
}

export async function getOpsDetails() {
  try {
    const [schedules, tasks, templates] = await Promise.all([
      getSchedules(),
      getTasks(20),
      getTemplates()
    ]);

    // Map template IDs to names
    const templateMap = {};
    templates.forEach(t => templateMap[t.id] = t.name);

    // Enrich schedules with template names
    const enrichedSchedules = schedules.map(s => ({
      id: s.id,
      name: s.name || templateMap[s.template_id] || `Template ${s.template_id}`,
      templateId: s.template_id,
      cron: s.cron_format,
      active: s.active !== false,
      lastRun: s.last_commit_time
    }));

    // Enrich tasks with template names
    const enrichedTasks = tasks.map(t => ({
      id: t.id,
      name: templateMap[t.template_id] || `Task ${t.id}`,
      templateId: t.template_id,
      status: t.status,
      start: t.start,
      end: t.end,
      created: t.created
    }));

    return {
      schedules: enrichedSchedules,
      tasks: enrichedTasks,
      templates: templates.map(t => ({ id: t.id, name: t.name }))
    };
  } catch (error) {
    return { schedules: [], tasks: [], templates: [], error: error.message };
  }
}

export async function getAutomationSummary() {
  try {
    const [schedules, tasks] = await Promise.all([
      getSchedules(),
      getTasks(5)
    ]);

    const lastTask = tasks[0];
    const okSchedules = schedules.filter(s => s.active !== false).length;
    
    // Determine status based on recent task results
    let status = 'unknown';
    if (tasks.length > 0) {
      const recentFailures = tasks.slice(0, 5).filter(t => t.status === 'error').length;
      status = recentFailures === 0 ? 'healthy' : (recentFailures < 3 ? 'warning' : 'degraded');
    }

    return {
      schedules: schedules.length,
      active: okSchedules,
      lastRun: lastTask?.created || null,
      lastStatus: lastTask?.status || null,
      status
    };
  } catch (error) {
    console.error('Semaphore summary error:', error.message);
    return {
      schedules: 0,
      active: 0,
      lastRun: null,
      lastStatus: null,
      status: 'error'
    };
  }
}
