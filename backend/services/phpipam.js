// phpIPAM integration for Atlas UI
import { exec } from 'child_process';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (no insecure default; set it in the runtime env)`);
  return v;
}
const PHPIPAM_URL = process.env.PHPIPAM_URL || 'http://127.0.0.1:8080/api/homelab';
const PHPIPAM_USER = process.env.PHPIPAM_USER || 'Admin';
const PHPIPAM_PASS = requireEnv('PHPIPAM_PASS');
const TIMEOUT_MS = 2000;

let token = null;
let tokenExpiry = null;

async function getToken() {
  if (token && tokenExpiry && Date.now() < tokenExpiry) {
    return token;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const auth = Buffer.from(`${PHPIPAM_USER}:${PHPIPAM_PASS}`).toString('base64');
    const res = await fetch(`${PHPIPAM_URL}/user/`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    
    const data = await res.json();
    token = data.data?.token;
    tokenExpiry = Date.now() + (5 * 60 * 1000); // 5 min
    return token;
  } catch (error) {
    return null;
  }
}

export async function getNetworkSummary() {
  try {
    const authToken = await getToken();
    if (!authToken) {
      return { subnets: 0, hosts: 0, status: 'error' };
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    // Get all subnets
    const subnetsRes = await fetch(`${PHPIPAM_URL}/subnets/`, {
      headers: { 'token': authToken },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!subnetsRes.ok) {
      return { subnets: 0, hosts: 0, status: 'error' };
    }
    
    const subnetsData = await subnetsRes.json();
    const subnets = subnetsData.data || [];
    
    // Count total hosts by querying addresses for each subnet
    let totalHosts = 0;
    for (const subnet of subnets) {
      try {
        const addrController = new AbortController();
        const addrTimeout = setTimeout(() => addrController.abort(), TIMEOUT_MS);
        
        const addrRes = await fetch(`${PHPIPAM_URL}/subnets/${subnet.id}/addresses/`, {
          headers: { 'token': authToken },
          signal: addrController.signal
        });
        clearTimeout(addrTimeout);
        
        if (addrRes.ok) {
          const addrData = await addrRes.json();
          totalHosts += (addrData.data || []).length;
        }
      } catch (e) {
        // Skip failed subnet
      }
    }
    
    return {
      subnets: subnets.length,
      hosts: totalHosts,
      status: 'healthy'
    };
  } catch (error) {
    return { subnets: 0, hosts: 0, status: 'error' };
  }
}

export async function getSubnets() {
  try {
    const authToken = await getToken();
    if (!authToken) return [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const res = await fetch(`${PHPIPAM_URL}/subnets/`, {
      headers: { 'token': authToken },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return [];
    
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    return [];
  }
}

export async function getSubnetAddresses(subnetId) {
  try {
    const authToken = await getToken();
    if (!authToken) return [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const res = await fetch(`${PHPIPAM_URL}/subnets/${subnetId}/addresses/`, {
      headers: { 'token': authToken },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return [];
    
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    return [];
  }
}

// Get all hosts from phpIPAM
export async function getAllHosts() {
  try {
    const authToken = await getToken();
    if (!authToken) return [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    // Get all subnets first
    const subnetsRes = await fetch(`${PHPIPAM_URL}/subnets/`, {
      headers: { 'token': authToken },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!subnetsRes.ok) return [];
    
    const subnetsData = await subnetsRes.json();
    const subnets = subnetsData.data || [];
    
    // Get addresses from each subnet
    const allHosts = [];
    for (const subnet of subnets) {
      try {
        const addrController = new AbortController();
        const addrTimeout = setTimeout(() => addrController.abort(), TIMEOUT_MS);
        
        const addrRes = await fetch(`${PHPIPAM_URL}/subnets/${subnet.id}/addresses/`, {
          headers: { 'token': authToken },
          signal: addrController.signal
        });
        clearTimeout(addrTimeout);
        
        if (addrRes.ok) {
          const addrData = await addrRes.json();
          const addresses = addrData.data || [];
          addresses.forEach(addr => {
            allHosts.push({
              ip: addr.ip,
              hostname: addr.hostname || addr.ip,
              description: addr.description || '',
              subnet: subnet.description || subnet.subnet
            });
          });
        }
      } catch (e) {
        // Skip failed subnet
      }
    }
    
    return allHosts;
  } catch (error) {
    return [];
  }
}

export async function getStandaloneHosts(clusterIPs = []) {
  try {
    const authToken = await getToken();
    if (!authToken) return [];

    const subnets = await getSubnets();

    const allHosts = [];
    for (const subnet of subnets) {
      const addresses = await getSubnetAddresses(subnet.id);
      allHosts.push(...addresses);
    }

    const clusterIPSet = new Set(clusterIPs.map(ip => ip.toLowerCase()));

    const standalone = allHosts
      .filter(h => {
        const ip = h.ip;
        const desc = (h.description || '').toLowerCase();

        if (clusterIPSet.has(ip)) return false;
        if (desc.includes('proxmox')) return false;
        if (desc.includes('lxc on')) return false;
        if (desc.includes('docker host - lxc')) return false;

        return true;
      })
      .map(h => ({
        hostname: (h.hostname || 'unknown').split('.')[0],
        ip: h.ip,
        description: h.description || '',
        type: categorizeHost(h)
      }));

    return standalone;
  } catch (error) {
    console.error('Error getting standalone hosts:', error.message);
    return [];
  }
}

function categorizeHost(host) {
  const desc = (host.description || '').toLowerCase();
  const name = (host.hostname || '').toLowerCase().split('.')[0];

  if (name === 'cleo') return 'windows';
  if (desc.includes('router') || desc.includes('gateway')) return 'network';
  if (name.includes('ollama') || desc.includes('ai') || desc.includes('llm')) return 'ai';
  if (name.includes('pihole') || name.includes('adguard')) return 'dns';
  if (desc.includes('docker')) return 'docker';
  if (desc.includes('nas') || desc.includes('storage')) return 'storage';

  return 'server';
}

// Quick TCP check for host status (port 22 SSH) - reduced timeout
async function checkHostStatus(ip) {
  return new Promise((resolve) => {
    // Use 200ms timeout instead of 1s for faster checks
    exec('nc -zw1 ' + ip + ' 22', { timeout: 500 }, (error) => {
      resolve(error ? 'down' : 'up');
    });
  });
}

// Cached standalone hosts with status - refreshed in background
let standaloneHostsCache = [];
let cacheLastUpdated = 0;
const CACHE_TTL = 30000; // 30 seconds

// Track when hosts changed state (for uptime/downtime calculation)
const hostStateSince = new Map(); // ip -> { status, since }

function formatDuration(ms) {
  if (!ms || ms <= 0) return '–';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

async function refreshStandaloneHostsCache(clusterIPs = []) {
  try {
    const hosts = await getStandaloneHosts(clusterIPs);
    const now = Date.now();
    
    const results = await Promise.all(
      hosts.map(async (host) => {
        const status = await checkHostStatus(host.ip);
        const hostKey = host.ip;
        
        // Track state change timestamp
        const prevState = hostStateSince.get(hostKey);
        if (!prevState || prevState.status !== status) {
          // State changed or first time seeing this host
          hostStateSince.set(hostKey, { status, since: now });
        }
        
        const currentState = hostStateSince.get(hostKey);
        const duration = formatDuration(now - currentState.since);
        
        return {
          ...host,
          status,
          uptime: duration
        };
      })
    );
    standaloneHostsCache = results;
    cacheLastUpdated = Date.now();
    return results;
  } catch (error) {
    console.error('Error refreshing standalone hosts cache:', error.message);
    return standaloneHostsCache; // Return stale cache on error
  }
}

// Get cached standalone hosts (non-blocking)
export function getCachedStandaloneHosts() {
  return standaloneHostsCache;
}

// Trigger background refresh if cache is stale
export function triggerStandaloneHostsRefresh(clusterIPs = []) {
  if (Date.now() - cacheLastUpdated > CACHE_TTL) {
    // Don't await - let it refresh in background
    refreshStandaloneHostsCache(clusterIPs);
  }
}

// Check status for multiple hosts in parallel (legacy - still used for initial load)
export async function checkHostsStatus(hosts) {
  const results = await Promise.all(
    hosts.map(async (host) => ({
      ...host,
      status: await checkHostStatus(host.ip)
    }))
  );
  return results;
}
