import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getInfrastructure } from './services/proxmox.js';
import { getContainers } from './services/portainer.js';
import { getMonitorStatus } from './services/uptime.js';
import { getAutomationSummary, getOpsDetails, runTask } from './services/semaphore.js';
import { getBackupSummary } from './services/backups.js';
import { getMetricsSummary } from './services/prometheus.js';
import { getNetworkSummary, getAllHosts, getCachedStandaloneHosts, triggerStandaloneHostsRefresh, getStandaloneHosts, checkHostsStatus } from './services/phpipam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve version directories
  app.use('/v1', express.static(path.join(__dirname, 'public/v1')));
  app.use('/v2', express.static(path.join(__dirname, 'public/v2')));
  app.use('/v3', express.static(path.join(__dirname, 'public/v3')));
  app.use('/v4', express.static(path.join(__dirname, 'public/v4')));
  app.use('/v5', express.static(path.join(__dirname, 'public/v5')));
  // Main public directory
  app.use(express.static(path.join(__dirname, 'public')));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tab configuration for frontend navigation
app.get('/api/config', (req, res) => {
  res.json({
    tabs: [
      { id: 'home', label: 'Home', icon: '🏠', path: '#home' },
      { id: 'infra', label: 'Infrastructure', icon: '🖥️', path: '#infra' },
      { id: 'ops', label: 'Operations', icon: '⚙️', path: '#ops' },
      { id: 'backups', label: 'Backups', icon: '💾', path: '#backups' },
      { id: 'alerts', label: 'Alerts', icon: '🔔', path: '#alerts' }
    ],
    defaultTab: 'home',
    version: '2.0.0'
  });
});

// Summary endpoint for Home tab cards
app.get('/api/summary', async (req, res) => {
  try {
    // Get all data sources in parallel
    const [infrastructure, containers, monitors, automation, backups, metrics, network] = await Promise.all([
      getInfrastructure(),
      getContainers(),
      getMonitorStatus(),
      getAutomationSummary(),
      getBackupSummary(),
      getMetricsSummary(),
      getNetworkSummary()
    ]);

    const { nodes, lxcs, vms = [] } = infrastructure;
    const alerts = monitors.filter(m => m.status === 'down');
    const upMonitors = monitors.filter(m => m.status === 'up').length;

    res.json({
      infrastructure: {
        nodes: nodes.length,
        lxcs: lxcs.length,
        vms: vms.length,
        containers: containers.length,
        status: alerts.length === 0 ? 'healthy' : 'degraded'
      },
      automation,
      monitoring: {
        total: monitors.length,
        up: upMonitors,
        down: alerts.length,
        status: alerts.length === 0 ? 'healthy' : 'degraded'
      },
      backups,
      metrics,
      network,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching summary:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Ops tab - Semaphore schedules and tasks
app.get('/api/ops', async (req, res) => {
  try {
    const data = await getOpsDetails();
    res.json(data);
  } catch (error) {
    console.error('Error fetching ops:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Run a Semaphore task
app.post('/api/ops/run/:templateId', async (req, res) => {
  try {
    const templateId = parseInt(req.params.templateId);
    const result = await runTask(templateId);
    if (result.error) {
      res.status(400).json(result);
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main infrastructure endpoint - hierarchical tree
app.get('/api/infrastructure', async (req, res) => {
  try {
    // Get data from all sources in parallel
    const [infrastructure, containers, monitors] = await Promise.all([
      getInfrastructure(),
      getContainers(),
      getMonitorStatus()
    ]);

    // Build hierarchical tree
    const tree = buildTree(infrastructure, containers, monitors);
    
    // Add cached standalone hosts (non-blocking)
    const clusterIPs = collectClusterIPs(tree);
    tree.standaloneHosts = getCachedStandaloneHosts();
    
    // Trigger background refresh if cache is stale
    triggerStandaloneHostsRefresh(clusterIPs);
    
    res.json(tree);
  } catch (error) {
    console.error('Error fetching infrastructure:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Collect all IPs from the cluster tree for filtering standalone hosts
function collectClusterIPs(tree) {
  const ips = [];
  if (tree?.cluster?.nodes) {
    tree.cluster.nodes.forEach(node => {
      if (node.ip) ips.push(node.ip);
      node.lxcs?.forEach(lxc => { if (lxc.ip) ips.push(lxc.ip); });
      node.vms?.forEach(vm => { if (vm.ip) ips.push(vm.ip); });
    });
  }
  return ips;
}

// Build hierarchical tree: cluster > nodes > lxcs/vms > containers
function buildTree(infrastructure, containers, monitors) {
  const { nodes, lxcs, vms = [] } = infrastructure;
  
  // Create monitor lookup by name (lowercase)
  const monitorLookup = {};
  monitors.forEach(m => {
    monitorLookup[m.name.toLowerCase()] = m;
  });

  // Create container lookup by host
  const containersByHost = {};
  containers.forEach(c => {
    const host = c.host.toLowerCase();
    if (!containersByHost[host]) containersByHost[host] = [];
    // Use monitor status if available, otherwise derive from Docker state
    const monitorStatus = monitorLookup[c.name.toLowerCase()]?.status;
    const derivedStatus = c.state === 'running' ? 'up' : 'down';
    containersByHost[host].push({
      ...c,
      status: monitorStatus || derivedStatus
    });
  });

  // Build node tree with LXCs and VMs
  const nodeTree = nodes.map(node => {
    const nodeLxcs = lxcs
      .filter(lxc => lxc.node === node.name)
      .map(lxc => {
        const lxcMonitor = monitorLookup[lxc.name.toLowerCase()];
        return {
          type: 'lxc',
          name: lxc.name,
          vmid: lxc.vmid,
          ip: lxc.ip,
          status: lxcMonitor?.status || (lxc.status === 'running' ? 'up' : 'down'),
          uptime: lxc.uptime,
          hasDocker: lxc.hasDocker,
          containers: containersByHost[lxc.name.toLowerCase()] || []
        };
      });

    const nodeVms = vms
      .filter(vm => vm.node === node.name)
      .map(vm => {
        const vmMonitor = monitorLookup[vm.name.toLowerCase()];
        return {
          type: 'qemu',
          name: vm.name,
          vmid: vm.vmid,
          ip: vm.ip,
          status: vmMonitor?.status || (vm.status === 'running' ? 'up' : 'down'),
          uptime: vm.uptime,
          hasDocker: vm.hasDocker,
          containers: containersByHost[vm.name.toLowerCase()] || []
        };
      });

    const nodeMonitor = monitorLookup[node.name.toLowerCase()];
    // Normalize Proxmox status: 'online' -> 'up', 'offline' -> 'down'
    const proxmoxStatus = node.status === 'online' ? 'up' : (node.status === 'offline' ? 'down' : 'unknown');
    return {
      type: 'node',
      name: node.name,
      ip: node.ip,
      status: nodeMonitor?.status || proxmoxStatus,
      uptime: node.uptime,
      lxcs: nodeLxcs,
      vms: nodeVms
    };
  });

  // Summary stats
  const summary = {
    nodes: nodes.length,
    lxcs: lxcs.length,
    vms: vms.length,
    containers: containers.length,
    alerts: monitors.filter(m => m.status === 'down').length
  };

  return {
    cluster: {
      name: 'Jovian Cluster',
      nodes: nodeTree
    },
    summary,
    timestamp: new Date().toISOString()
  };
}

// SPA fallback - serve index.html for all other routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.listen(PORT, async () => {
  console.log(`Atlas UI running on port ${PORT}`);
  
  // Pre-warm the standalone hosts cache on startup
  console.log('Pre-warming standalone hosts cache...');
  try {
    const hosts = await getStandaloneHosts([]);
    await checkHostsStatus(hosts).then(() => {
      triggerStandaloneHostsRefresh([]);
    });
    console.log('Standalone hosts cache ready');
  } catch (e) {
    console.log('Cache pre-warm failed (will populate on first request)');
  }
});
