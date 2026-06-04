// Uptime Kuma integration - use metrics endpoint
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (no insecure default; set it in the runtime env)`);
  return v;
}
const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL || 'http://127.0.0.1:3001';
const UPTIME_KUMA_USER = process.env.UPTIME_KUMA_USER || 'admin';
const UPTIME_KUMA_PASS = requireEnv('UPTIME_KUMA_PASS');
const TIMEOUT_MS = 2000;

export async function getMonitorStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    // Basic auth for metrics endpoint
    const auth = Buffer.from(`${UPTIME_KUMA_USER}:${UPTIME_KUMA_PASS}`).toString('base64');
    
    const res = await fetch(`${UPTIME_KUMA_URL}/metrics`, {
      headers: { 'Authorization': `Basic ${auth}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return [];
    
    const text = await res.text();
    const monitors = parsePrometheusMetrics(text);
    return monitors;
  } catch (error) {
    // Silent fail
    return [];
  }
}

function parsePrometheusMetrics(text) {
  const monitors = [];
  const monitorData = {};
  
  // Parse lines like: monitor_status{monitor_name="Portainer",monitor_type="http",monitor_url="http://...",monitor_hostname="null",monitor_port="null"} 1
  const statusRegex = /monitor_status\{monitor_name="([^"]+)"[^}]*\}\s+(\d+)/g;
  let match;
  
  while ((match = statusRegex.exec(text)) !== null) {
    const name = match[1];
    const status = parseInt(match[2]);
    if (!monitorData[name]) monitorData[name] = {};
    monitorData[name].name = name;
    monitorData[name].status = status === 1 ? 'up' : 'down';
  }
  
  // Parse response time: monitor_response_time{...} 123
  const rtRegex = /monitor_response_time\{monitor_name="([^"]+)"[^}]*\}\s+([\d.]+)/g;
  while ((match = rtRegex.exec(text)) !== null) {
    const name = match[1];
    const rt = parseFloat(match[2]);
    if (monitorData[name]) monitorData[name].responseTime = rt;
  }
  
  return Object.values(monitorData);
}

// Get heartbeat for specific monitor
export async function getMonitorHeartbeat(monitorId) {
  return null; // Not available via metrics endpoint
}
