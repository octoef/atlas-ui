import axios from 'axios';
import https from 'https';

// Central Portainer server - all endpoints managed from here
const PORTAINER_URL = process.env.PORTAINER_URL || 'https://10.0.60.120:9443';
const PORTAINER_API_KEY = process.env.PORTAINER_API_KEY;

// VPN container port mappings - services that use network_mode: service:gluetun
// Maps container name to port(s) exposed through gluetun
const VPN_PORT_MAPPINGS = {
  // stack gluetun ports
  'qbittorrent': [{ host: 8080, container: 8080 }],
  'qbit-manage': [{ host: 8081, container: 8081 }],
  'sabnzbd': [{ host: 8083, container: 8083 }],
  'jackett': [{ host: 9117, container: 9117 }],
  'prowlarr': [{ host: 9696, container: 9696 }],
  'autobrr': [{ host: 7474, container: 7474 }],
  'qui': [{ host: 7476, container: 7476 }],
  'cross-seed': [{ host: 2468, container: 2468 }],
  'thelounge': [{ host: 9000, container: 9000 }],
  'cmdlounge': [{ host: 9003, container: 9003 }],
  // stuck gluetun ports (similar setup)
  'stash': [{ host: 9999, container: 9999 }],
};

// Create axios instance
const createApi = () => axios.create({
  baseURL: PORTAINER_URL,
  headers: {
    'X-API-Key': PORTAINER_API_KEY
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 10000
});

export async function getContainers() {
  if (!PORTAINER_API_KEY) {
    console.warn('No Portainer API key configured');
    return [];
  }

  const allContainers = [];
  const api = createApi();

  try {
    // Get all endpoints from central Portainer
    const endpointsRes = await api.get('/api/endpoints');
    const endpoints = endpointsRes.data;

    for (const endpoint of endpoints) {
      try {
        const containersRes = await api.get(`/api/endpoints/${endpoint.Id}/docker/containers/json`, {
          params: { all: true }
        });

        const containers = containersRes.data.map(c => {
          const containerName = c.Names[0]?.replace(/^\//, '') || 'unknown';
          
          // Extract IP from NetworkSettings
          let ip = null;
          let networkMode = 'bridge';
          let usesVpn = false;
          
          if (c.NetworkSettings?.Networks) {
            const networkNames = Object.keys(c.NetworkSettings.Networks);
            if (networkNames.includes('host')) {
              networkMode = 'host';
            }
            // Check if using container network (VPN)
            if (networkNames.length === 0 || c.HostConfig?.NetworkMode?.startsWith('container:')) {
              usesVpn = true;
            }
            const networks = Object.values(c.NetworkSettings.Networks);
            if (networks.length > 0 && networks[0].IPAddress) {
              ip = networks[0].IPAddress;
            }
          }

          // Extract port mappings - get unique host ports
          let ports = [];
          if (c.Ports) {
            for (const p of c.Ports) {
              if (p.PublicPort && p.IP === '0.0.0.0') {
                ports.push({
                  host: p.PublicPort,
                  container: p.PrivatePort,
                  protocol: p.Type
                });
              }
            }
          }
          
          // If no ports and container uses VPN, check VPN_PORT_MAPPINGS
          if (ports.length === 0 && (usesVpn || !ip)) {
            const vpnPorts = VPN_PORT_MAPPINGS[containerName];
            if (vpnPorts) {
              ports = vpnPorts.map(p => ({ ...p, protocol: 'tcp' }));
              usesVpn = true;
            }
          }

          return {
            id: c.Id.substring(0, 12),
            name: containerName,
            image: c.Image.split('@')[0].split(':')[0], // Clean image name
            state: c.State,
            status: c.State === 'running' ? 'up' : 'down',
            ip: ip,
            ports: ports,
            networkMode: usesVpn ? 'vpn' : networkMode,
            host: endpoint.Name,
            endpointId: endpoint.Id
          };
        });

        allContainers.push(...containers);
      } catch (error) {
        console.error(`Error fetching containers from endpoint ${endpoint.Name}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Portainer API error:', error.message);
  }

  return allContainers;
}

// Restart a container
export async function restartContainer(endpointId, containerId) {
  if (!PORTAINER_API_KEY) throw new Error('No Portainer API key configured');

  const api = createApi();
  await api.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/restart`);
  return { success: true };
}
