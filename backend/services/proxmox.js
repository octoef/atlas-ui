import axios from 'axios';
import https from 'https';

const PROXMOX_HOST = process.env.PROXMOX_HOST || '10.0.60.204';
// Token ID can be full format (user@realm!tokenid) or just tokenid
const PROXMOX_TOKEN_ID = process.env.PROXMOX_TOKEN_ID || 'ansible@pve!inventory';
const PROXMOX_TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET || '8b39debd-7ee3-45e1-a016-65f072a708a6';

const api = axios.create({
  baseURL: `https://${PROXMOX_HOST}:8006/api2/json`,
  headers: {
    'Authorization': `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}`
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

export async function getInfrastructure() {
  try {
    // Get nodes
    const nodesRes = await api.get('/nodes');
    const nodes = nodesRes.data.data.map(n => ({
      name: n.node,
      ip: getNodeIp(n.node),
      status: n.status,
      uptime: formatUptime(n.uptime),
      cpu: n.cpu,
      mem: n.mem,
      maxmem: n.maxmem
    }));

    // Get all LXCs from cluster resources
    const resourcesRes = await api.get('/cluster/resources', { params: { type: 'vm' } });
    const lxcResources = resourcesRes.data.data
      .filter(r => r.type === 'lxc' && r.tags?.includes('homelab'));

    // Get all VMs (qemu) from cluster resources
    const vmResources = resourcesRes.data.data
      .filter(r => r.type === 'qemu' && r.tags?.includes('homelab'));

    // Fetch IP for each LXC from its config
    const lxcs = await Promise.all(lxcResources.map(async (r) => {
      const ip = await getLxcIp(r.node, r.vmid);
      return {
        vmid: r.vmid,
        name: r.name,
        node: r.node,
        status: r.status,
        ip: ip,
        uptime: formatUptime(r.uptime),
        hasDocker: r.tags?.includes('docker') || false,
        tags: r.tags?.split(';') || [],
        type: 'lxc'
      };
    }));

    // Fetch IP for each VM from its config (agent or cloud-init)
    const vms = await Promise.all(vmResources.map(async (r) => {
      const ip = await getVmIp(r.node, r.vmid);
      return {
        vmid: r.vmid,
        name: r.name,
        node: r.node,
        status: r.status,
        ip: ip,
        uptime: formatUptime(r.uptime),
        hasDocker: r.tags?.includes('docker') || false,
        tags: r.tags?.split(';') || [],
        type: 'qemu'
      };
    }));

    return { nodes, lxcs, vms };
  } catch (error) {
    console.error('Proxmox API error:', error.message);
    // Return cached/static data as fallback
    return getFallbackData();
  }
}

async function getLxcIp(node, vmid) {
  try {
    const configRes = await api.get(`/nodes/${node}/lxc/${vmid}/config`);
    const net0 = configRes.data.data.net0 || '';
    // Parse ip=10.0.60.120/24 from net0 string
    const ipMatch = net0.match(/ip=([^\/,]+)/);
    if (ipMatch && ipMatch[1] !== 'dhcp') {
      return ipMatch[1];
    }
    // For DHCP hosts, use static map (these are DHCP reservations)
    return getDhcpIp(vmid);
  } catch (error) {
    return 'unknown';
  }
}

async function getVmIp(node, vmid) {
  try {
    // Try to get IP from QEMU guest agent first
    const agentRes = await api.get(`/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`);
    const interfaces = agentRes.data.data?.result || [];
    for (const iface of interfaces) {
      if (iface.name !== 'lo') {
        const ipv4 = iface['ip-addresses']?.find(ip => ip['ip-address-type'] === 'ipv4');
        if (ipv4) return ipv4['ip-address'];
      }
    }
  } catch {
    // Agent not available, try cloud-init config
    try {
      const configRes = await api.get(`/nodes/${node}/qemu/${vmid}/config`);
      const ipconfig0 = configRes.data.data.ipconfig0 || '';
      const ipMatch = ipconfig0.match(/ip=([^\/,]+)/);
      if (ipMatch && ipMatch[1] !== 'dhcp') {
        return ipMatch[1];
      }
    } catch {
      // Fallback to static map
    }
  }
  return getDhcpIp(vmid);
}

// DHCP reservations - these LXCs get IPs from DHCP but have reservations
function getDhcpIp(vmid) {
  const dhcpReservations = {
    111: '10.0.60.111',  // stack
    116: '10.0.60.116',  // stuck
    110: '10.0.60.110',  // share
    104: '10.0.60.104',  // ceres
    212: '10.0.60.212',  // docker
    224: '10.0.60.224'   // immich
  };
  return dhcpReservations[vmid] || 'dhcp';
}

function getNodeIp(nodeName) {
  const nodeIps = {
    jupiter: '10.0.60.204',
    io: '10.0.60.205',
    europa: '10.0.60.208',
    ganymede: '10.0.60.209'
  };
  return nodeIps[nodeName] || 'unknown';
}

function formatUptime(seconds) {
  if (!seconds) return 'unknown';
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
}

function getFallbackData() {
  // Static fallback when API unavailable
  return {
    nodes: [
      { name: 'jupiter', ip: '10.0.60.204', status: 'unknown', uptime: '?' },
      { name: 'io', ip: '10.0.60.205', status: 'unknown', uptime: '?' },
      { name: 'europa', ip: '10.0.60.208', status: 'unknown', uptime: '?' },
      { name: 'ganymede', ip: '10.0.60.209', status: 'unknown', uptime: '?' }
    ],
    lxcs: [],
    vms: []
  };
}
