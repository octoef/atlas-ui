// Prometheus metrics integration for Atlas UI
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const TIMEOUT_MS = 2000;

async function query(promql) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`Prometheus query failed: ${res.status}`);
    const data = await res.json();
    return data.data?.result || [];
  } catch (error) {
    // Silent fail - return empty result
    return [];
  }
}

export async function getMetricsSummary() {
  try {
    // Get cluster-wide CPU and memory usage
    const [cpuResult, memResult, diskResult] = await Promise.all([
      // Average CPU usage across all Proxmox nodes (from node_exporter)
      query('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
      // Memory usage percentage
      query('100 - ((avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes)) * 100)'),
      // Root disk usage
      query('100 - ((avg(node_filesystem_avail_bytes{mountpoint="/"}) / avg(node_filesystem_size_bytes{mountpoint="/"})) * 100)')
    ]);

    const cpu = cpuResult[0]?.value?.[1] ? parseFloat(cpuResult[0].value[1]).toFixed(1) : null;
    const memory = memResult[0]?.value?.[1] ? parseFloat(memResult[0].value[1]).toFixed(1) : null;
    const disk = diskResult[0]?.value?.[1] ? parseFloat(diskResult[0].value[1]).toFixed(1) : null;

    // Determine status based on resource usage
    let status = 'healthy';
    if (cpu > 80 || memory > 80 || disk > 85) status = 'warning';
    if (cpu > 95 || memory > 95 || disk > 95) status = 'degraded';

    return {
      cpu: cpu ? `${cpu}%` : null,
      memory: memory ? `${memory}%` : null,
      disk: disk ? `${disk}%` : null,
      status
    };
  } catch (error) {
    console.error('Metrics summary error:', error.message);
    return {
      cpu: null,
      memory: null,
      disk: null,
      status: 'error'
    };
  }
}
