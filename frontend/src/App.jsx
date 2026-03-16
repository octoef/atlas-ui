import React, { useState, useEffect, createContext, useContext } from 'react';
import Masonry from 'react-masonry-css';
import TabNav from './components/TabNav';
import HomeTab from './components/HomeTab';
import OpsTab from './components/OpsTab';
import './App.css';

// Collapse state context for persisting expand/collapse across all components
const CollapseContext = createContext();

function useCollapseState(key, defaultValue = false) {
  const { collapseState, setCollapseState } = useContext(CollapseContext);
  const isCollapsed = collapseState[key] ?? defaultValue;
  
  const setCollapsed = (value) => {
    setCollapseState(prev => {
      const newState = { ...prev, [key]: value };
      localStorage.setItem('atlasCollapseState', JSON.stringify(newState));
      return newState;
    });
  };
  
  return [isCollapsed, setCollapsed];
}

const STATUS_COLORS = {
  up: '#3fb950',
  down: '#f85149',
  running: '#3fb950',
  stopped: '#f85149',
  unknown: '#8b949e'
};

// Map node names to dashboard-icons
const NODE_ICON_MAP = {
  'io': 'proxmox',
  'europa': 'proxmox',
  'jupiter': 'proxmox',
  'ganymede': 'proxmox',
};

// Map LXC names to dashboard-icons
const LXC_ICON_MAP = {
  'stack': 'ubuntu',
  'stuck': 'ubuntu',
  'docker': 'docker',
  'pbs': 'proxmox',
  'share': 'ubuntu',
  'atlas': 'ubuntu',
  'pihole': 'pi-hole',
  'pihole1': 'pi-hole',
  'pihole2': 'pi-hole',
  'npmplus': 'nginx-proxy-manager',
  'nginx': 'nginx-proxy-manager',
  'ceres': 'debian',
  'jelly': 'jellyfin',
  'jellyfin': 'jellyfin',
  'plex': 'plex',
  'immich': 'immich',
};

// Map VM names to dashboard-icons
const VM_ICON_MAP = {
  'ha': 'home-assistant',
  'homeassistant': 'home-assistant',
  'home-assistant': 'home-assistant',
  'windows': 'windows',
  'win10': 'windows',
  'win11': 'windows',
  'truenas': 'truenas',
  'opnsense': 'opnsense',
  'pfsense': 'pfsense',
};

// Map container names to dashboard-icons names
const ICON_MAP = {
  'grafana': 'grafana',
  'atlas-grafana': 'grafana',
  'prometheus': 'prometheus',
  'atlas-prometheus': 'prometheus',
  'loki': 'loki',
  'atlas-loki': 'loki',
  'promtail': 'grafana',
  'atlas-promtail': 'grafana',
  'uptime-kuma': 'uptime-kuma',
  'atlas-uptime-kuma': 'uptime-kuma',
  'n8n': 'n8n',
  'atlas-n8n': 'n8n',
  'portainer': 'portainer',
  'portainer_agent': 'portainer',
  'sonarr': 'sonarr',
  'radarr': 'radarr',
  'prowlarr': 'prowlarr',
  'jackett': 'jackett',
  'qbittorrent': 'qbittorrent',
  'sabnzbd': 'sabnzbd',
  'overseerr': 'overseerr',
  'tautulli': 'tautulli',
  'plex': 'plex',
  'autobrr': 'autobrr',
  'recyclarr': 'recyclarr',
  'unpackerr': 'unpackerr',
  'maintainerr': 'maintainerr',
  'cross-seed': 'cross-seed',
  'gluetun': 'gluetun',
  'watchtower': 'watchtower',
  'semaphore': 'semaphore',
  'semaphore-db': 'postgresql',
  'stash': 'stash',
  'stash-emp': 'stash',
  'stash-vr': 'stash',
  'thelounge': 'thelounge',
  'cmdlounge': 'thelounge',
  'phpipam-web': 'phpipam',
  'phpipam-cron': 'phpipam',
  'phpipam-mariadb': 'mariadb',
  'mariadb': 'mariadb',
  'mysql': 'mysql',
  'postgres': 'postgresql',
  'postgresql': 'postgresql',
  'redis': 'redis',
  'nginx': 'nginx',
  'traefik': 'traefik',
  'docker': 'docker',
  'qui': 'docker',
  'qbit-manage': 'qbittorrent',
  'watchstate': 'plex',
  'deunhealth': 'docker',
  'csui': 'docker',
  'pepicraft': 'minecraft',
  'atlas-blackbox': 'prometheus',
  'atlas-snmp-exporter': 'prometheus',
};

const ICON_CDN_SVG = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg';
const ICON_CDN_PNG = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png';

// Icons that only exist as PNG (no SVG available)
const PNG_ONLY_ICONS = ['phpipam'];

// Chevron for collapse indicator
function Chevron({ collapsed }) {
  return <span className={`chevron ${collapsed ? 'collapsed' : ''}`}>▼</span>;
}

// Summary item with loading skeleton
function SummaryItem({ label, value, loading, isAlert }) {
  return (
    <div className={`summary-item ${isAlert ? 'alerts' : ''}`}>
      <span className={`summary-value ${loading && value === undefined ? 'skeleton' : ''}`}>
        {value !== undefined ? value : '—'}
      </span>
      <span className="summary-label">{label}</span>
    </div>
  );
}

// Skeleton loader for cluster while loading
function SkeletonCluster() {
  return (
    <div className="cluster-box skeleton-box">
      <div className="cluster-header">
        <div className="skeleton-icon"></div>
        <span className="skeleton-text" style={{ width: '150px' }}></span>
      </div>
      <div className="skeleton-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-node">
            <div className="skeleton-header">
              <div className="skeleton-icon small"></div>
              <span className="skeleton-text" style={{ width: '80px' }}></span>
            </div>
            <div className="skeleton-items">
              {[1, 2, 3].map(j => (
                <div key={j} className="skeleton-item"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getIconUrl(containerName) {
  // Try exact match first
  const lowerName = containerName.toLowerCase();
  if (ICON_MAP[lowerName]) {
    const iconName = ICON_MAP[lowerName];
    if (PNG_ONLY_ICONS.includes(iconName)) {
      return `${ICON_CDN_PNG}/${iconName}.png`;
    }
    return `${ICON_CDN_SVG}/${iconName}.svg`;
  }
  
  // Try partial match (container name contains known service)
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      if (PNG_ONLY_ICONS.includes(icon)) {
        return `${ICON_CDN_PNG}/${icon}.png`;
      }
      return `${ICON_CDN_SVG}/${icon}.svg`;
    }
  }
  
  // Try the container name directly as icon name
  const kebabName = lowerName.replace(/[_\s]/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${ICON_CDN_SVG}/${kebabName}.svg`;
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [collapseState, setCollapseState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('atlasCollapseState')) || {};
    } catch {
      return {};
    }
  });
  const [tabs, setTabs] = useState([
    // Default tabs shown immediately - config will update if different
    { id: 'home', label: 'Home' },
    { id: 'infra', label: 'Infrastructure' },
    { id: 'ops', label: 'Operations' },
    { id: 'backups', label: 'Backups' },
    { id: 'alerts', label: 'Alerts' }
  ]);
  const [activeTab, setActiveTab] = useState('home');

  // Sync tab state with URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'home';
      setActiveTab(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Set initial state from URL
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tabId) => {
    window.location.hash = tabId;
    setActiveTab(tabId);
  };

  // Fetch tab config
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(config => {
        setTabs(config.tabs || []);
        if (!window.location.hash && config.defaultTab) {
          setActiveTab(config.defaultTab);
        }
      })
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/infrastructure');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show shell immediately - no blocking on data
  return (
    <CollapseContext.Provider value={{ collapseState, setCollapseState }}>
    <div className="app">
      <header className="header">
        <h1>🎛️ ATLAS UI</h1>
        <div className="header-right">
          <button onClick={fetchData} className="refresh-btn" disabled={loading}>
            {loading ? '⟳' : '↻'} Refresh
          </button>
          <span className="timestamp">{lastUpdate?.toLocaleTimeString() || '--:--:--'}</span>
        </div>
      </header>

      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="main">
        {error && <div className="error-banner">⚠️ {error}</div>}
        
        {/* Home Tab */}
        {activeTab === 'home' && (
          <HomeTab onNavigate={handleTabChange} />
        )}

        {/* Ops Tab */}
        {activeTab === 'ops' && (
          <OpsTab />
        )}

        {/* Infrastructure Tab */}
        {activeTab === 'infra' && (
          <>
            {/* Summary Bar - show skeleton if no data */}
            <div className="summary-bar">
              <SummaryItem label="Nodes" value={data?.summary?.nodes} loading={loading} />
              <SummaryItem label="LXCs" value={data?.summary?.lxcs} loading={loading} />
              {(data?.summary?.vms > 0 || loading) && (
                <SummaryItem label="VMs" value={data?.summary?.vms} loading={loading} />
              )}
              <SummaryItem label="Containers" value={data?.summary?.containers} loading={loading} />
              <SummaryItem label="Alerts" value={data?.summary?.alerts} loading={loading} isAlert />
            </div>

            {/* Cluster Box - show skeleton if loading */}
            {loading && !data ? (
              <SkeletonCluster />
            ) : data ? (
              <>
                <ClusterSection data={data} />
                <StandaloneSection hosts={data.standaloneHosts} />
              </>
            ) : null}
          </>
        )}

        {/* Backups Tab - placeholder */}
        {activeTab === 'backups' && (
          <div className="tab-content backups-tab">
            <h2>Backups</h2>
            <p>PBS backup status coming soon...</p>
            <a href="https://pbs:8007" target="_blank" rel="noopener noreferrer" className="external-link">
              Open PBS →
            </a>
          </div>
        )}

        {/* Alerts Tab - placeholder */}
        {activeTab === 'alerts' && (
          <div className="tab-content alerts-tab">
            <h2>Alerts</h2>
            <p>Uptime Kuma alerts coming soon...</p>
            <a href="http://atlas:3001" target="_blank" rel="noopener noreferrer" className="external-link">
              Open Uptime Kuma →
            </a>
          </div>
        )}
      </main>
    </div>
    </CollapseContext.Provider>
  );
}

// Cluster section with collapse persistence
function ClusterSection({ data }) {
  const [collapsed, setCollapsed] = useCollapseState('cluster', false);
  
  return (
    <div className={`cluster-box ${collapsed ? 'collapsed' : ''}`}>
      <div className="cluster-header clickable" onClick={() => setCollapsed(!collapsed)}>
        <Chevron collapsed={collapsed} />
        <img src="https://cdn.jsdelivr.net/gh/selfhst/icons/svg/proxmox.svg" alt="Proxmox" className="cluster-icon-img" />
        <span className="cluster-name">{data.cluster.name}</span>
        {collapsed && (
          <span className="collapse-summary">
            {data.summary.nodes} nodes · {data.summary.lxcs} LXCs · {data.summary.containers} containers
          </span>
        )}
      </div>
      {!collapsed && <NodesGrid nodes={data.cluster.nodes} />}
    </div>
  );
}

// Get icon URL for standalone host type
function getHostIcon(host) {
  const type = host.type;
  const name = (host.hostname || '').toLowerCase();
  
  if (type === 'network' || name.includes('gateway') || name.includes('pfsense')) return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/pfsense.svg';
  if (type === 'windows' || name === 'cleo') return 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Windows_logo_-_2012.svg';
  if (type === 'ai' || name.includes('ollama')) return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/ollama.svg';
  if (type === 'docker') return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/docker.svg';
  if (type === 'storage' || name.includes('nas') || name.includes('synology')) return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/synology.svg';
  if (type === 'dns' || name.includes('pihole')) return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/pi-hole.svg';
  return 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/linux.svg';
}

// Standalone hosts section with collapse persistence
function StandaloneSection({ hosts }) {
  const [collapsed, setCollapsed] = useCollapseState('standalone', false);
  
  if (!hosts || hosts.length === 0) return null;
  
  // Group by status
  const upHosts = hosts.filter(h => h.status === 'up');
  const downHosts = hosts.filter(h => h.status !== 'up');
  
  const renderHostBox = (host) => (
    <div key={host.ip} className={`node-box empty standalone-host-box status-${host.status}`}>
      <div className="node-header">
        <img src={getHostIcon(host)} alt={host.type} className="node-icon" />
        <div className="node-info">
          <span className="node-name">{host.hostname}</span>
          <div className="node-meta">
            <span className="node-ip">{host.ip}</span>
            <span className="node-stat">{host.type}</span>
          </div>
        </div>
        <span className={`node-uptime status-${host.status}`}>{host.uptime || '–'}</span>
      </div>
    </div>
  );
  
  return (
    <div className={`standalone-section ${collapsed ? 'collapsed' : ''}`}>
      <div className="standalone-header clickable" onClick={() => setCollapsed(!collapsed)}>
        <Chevron collapsed={collapsed} />
        <img src="https://cdn.simpleicons.org/serverless/c9d1d9" alt="Hosts" className="cluster-icon-img" />
        <span className="cluster-name">Standalone Hosts</span>
        {collapsed && (
          <span className="collapse-summary">
            {hosts.length} hosts · {upHosts.length} up
          </span>
        )}
      </div>
      {!collapsed && (
        <>
          {upHosts.length > 0 && (
            <div className="host-group">
              <div className="host-group-label online">Online ({upHosts.length})</div>
              <div className="standalone-grid">
                {upHosts.map(renderHostBox)}
              </div>
            </div>
          )}
          {downHosts.length > 0 && (
            <div className="host-group">
              <div className="host-group-label offline">Offline ({downHosts.length})</div>
              <div className="standalone-grid">
                {downHosts.map(renderHostBox)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Masonry grid - places items in shortest column for optimal packing
function NodesGrid({ nodes }) {
  // Sort by container count to help masonry algorithm
  const sortedNodes = [...nodes].sort((a, b) => {
    const aContainers = a.lxcs?.reduce((sum, lxc) => sum + (lxc.containers?.length || 0), 0) || 0;
    const bContainers = b.lxcs?.reduce((sum, lxc) => sum + (lxc.containers?.length || 0), 0) || 0;
    return bContainers - aContainers;
  });

  const breakpointColumns = {
    default: 3,
    1800: 3,
    1400: 2,
    900: 1
  };
  
  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="masonry-grid"
      columnClassName="masonry-column"
    >
      {sortedNodes.map(node => (
        <NodeBox key={node.name} node={node} />
      ))}
    </Masonry>
  );
}

function NodeBox({ node }) {
  const [collapsed, setCollapsed] = useCollapseState(`node:${node.name}`, false);
  const [iconError, setIconError] = useState(false);
  const hasLxcs = node.lxcs && node.lxcs.length > 0;
  const hasVms = node.vms && node.vms.length > 0;
  const hasChildren = hasLxcs || hasVms;
  const lxcCount = node.lxcs?.length || 0;
  const vmCount = node.vms?.length || 0;
  const containerCount = (node.lxcs?.reduce((sum, lxc) => sum + (lxc.containers?.length || 0), 0) || 0) +
                         (node.vms?.reduce((sum, vm) => sum + (vm.containers?.length || 0), 0) || 0);
  
  const iconName = NODE_ICON_MAP[node.name.toLowerCase()] || 'proxmox';
  const iconUrl = `${ICON_CDN_SVG}/${iconName}.svg`;

  return (
    <div className={`node-box ${!hasChildren ? 'empty' : ''} ${collapsed ? 'collapsed' : ''} status-${node.status}`}>
      <div className={`node-header ${hasChildren ? 'clickable' : ''}`} onClick={() => hasChildren && setCollapsed(!collapsed)}>
        {hasChildren && <Chevron collapsed={collapsed} />}
        {!iconError ? (
          <img src={iconUrl} alt="" className="node-icon" onError={() => setIconError(true)} />
        ) : (
          <StatusDot status={node.status} />
        )}
        <div className="node-info">
          <span className="node-name">{node.name}</span>
          <div className="node-meta">
            {node.ip ? <a href={`https://${node.ip}:8006`} target="_blank" rel="noopener noreferrer" className="node-ip clickable-link" onClick={(e) => e.stopPropagation()}>{node.ip}</a> : <span className="node-ip">No IP</span>}
            {collapsed ? (
              <span className="collapse-summary">
                {lxcCount > 0 && `${lxcCount} LXC${lxcCount !== 1 ? 's' : ''}`}
                {lxcCount > 0 && vmCount > 0 && ' · '}
                {vmCount > 0 && `${vmCount} VM${vmCount !== 1 ? 's' : ''}`}
                {(lxcCount > 0 || vmCount > 0) && containerCount > 0 && ' · '}
                {containerCount > 0 && `${containerCount} containers`}
              </span>
            ) : (
              <>
                {lxcCount > 0 && <span className="node-stat">{lxcCount} LXC{lxcCount !== 1 ? 's' : ''}</span>}
                {vmCount > 0 && <span className="node-stat">{vmCount} VM{vmCount !== 1 ? 's' : ''}</span>}
                {containerCount > 0 && <span className="node-stat">{containerCount} containers</span>}
              </>
            )}
          </div>
        </div>
        <span className={`node-uptime status-${node.status}`}>{node.uptime}</span>
      </div>

      {hasChildren && !collapsed && (
        <div className="lxcs-grid">
          {node.vms?.map(vm => (
            <VmBox key={vm.vmid} vm={vm} />
          ))}
          {node.lxcs?.map(lxc => (
            <LxcBox key={lxc.vmid} lxc={lxc} />
          ))}
        </div>
      )}
    </div>
  );
}

function VmBox({ vm }) {
  const [collapsed, setCollapsed] = useCollapseState(`vm:${vm.vmid}`, false);
  const [iconError, setIconError] = useState(false);
  const hasContainers = vm.containers && vm.containers.length > 0;
  const containerCount = vm.containers?.length || 0;
  const runningCount = vm.containers?.filter(c => c.state === 'running').length || 0;
  
  const vmNameLower = vm.name.toLowerCase();
  const iconName = VM_ICON_MAP[vmNameLower] || (vm.hasDocker ? 'docker' : 'virtual-machine');
  const isPngIcon = PNG_ONLY_ICONS.includes(iconName);
  const iconUrl = isPngIcon ? `${ICON_CDN_PNG}/${iconName}.png` : `${ICON_CDN_SVG}/${iconName}.svg`;

  return (
    <div className={`lxc-box vm-box ${vm.hasDocker ? 'has-docker' : ''} ${collapsed ? 'collapsed' : ''} status-${vm.status}`}>
      <div className={`lxc-header ${hasContainers ? 'clickable' : ''}`} onClick={() => hasContainers && setCollapsed(!collapsed)}>
        {hasContainers && <Chevron collapsed={collapsed} />}
        {!iconError ? (
          <img src={iconUrl} alt="" className="lxc-icon" onError={() => setIconError(true)} />
        ) : (
          <StatusDot status={vm.status} />
        )}
        <div className="lxc-info">
          <span className="lxc-name">
            {vm.name}
            <span className="vm-badge">VM</span>
          </span>
          {vm.ip && <a href={`http://${vm.ip}`} target="_blank" rel="noopener noreferrer" className="lxc-ip clickable-link" onClick={(e) => e.stopPropagation()}>{vm.ip}</a>}
          {collapsed && <span className="collapse-summary">{runningCount}/{containerCount} running</span>}
        </div>
        <span className={`lxc-uptime status-${vm.status}`}>{vm.uptime}</span>
      </div>

      {hasContainers && !collapsed && (
        <div className="containers-grid">
          {vm.containers.map(container => (
            <ContainerCard key={container.id} container={container} hostIp={vm.ip} />
          ))}
        </div>
      )}
    </div>
  );
}

function LxcBox({ lxc }) {
  const [collapsed, setCollapsed] = useCollapseState(`lxc:${lxc.vmid}`, false);
  const [iconError, setIconError] = useState(false);
  const hasContainers = lxc.containers && lxc.containers.length > 0;
  const containerCount = lxc.containers?.length || 0;
  const runningCount = lxc.containers?.filter(c => c.state === 'running').length || 0;
  
  const lxcNameLower = lxc.name.toLowerCase();
  const iconName = LXC_ICON_MAP[lxcNameLower] || (lxc.hasDocker ? 'docker' : 'ubuntu');
  const isPngIcon = PNG_ONLY_ICONS.includes(iconName);
  const iconUrl = isPngIcon ? `${ICON_CDN_PNG}/${iconName}.png` : `${ICON_CDN_SVG}/${iconName}.svg`;

  return (
    <div className={`lxc-box ${lxc.hasDocker ? 'has-docker' : ''} ${collapsed ? 'collapsed' : ''} status-${lxc.status}`}>
      <div className={`lxc-header ${hasContainers ? 'clickable' : ''}`} onClick={() => hasContainers && setCollapsed(!collapsed)}>
        {hasContainers && <Chevron collapsed={collapsed} />}
        {!iconError ? (
          <img src={iconUrl} alt="" className="lxc-icon" onError={() => setIconError(true)} />
        ) : (
          <StatusDot status={lxc.status} />
        )}
        <div className="lxc-info">
          <span className="lxc-name">
            {lxc.name}
          </span>
          {lxc.ip && <a href={`http://${lxc.ip}`} target="_blank" rel="noopener noreferrer" className="lxc-ip clickable-link" onClick={(e) => e.stopPropagation()}>{lxc.ip}</a>}
          {collapsed && <span className="collapse-summary">{runningCount}/{containerCount} running</span>}
        </div>
        <span className={`lxc-uptime status-${lxc.status}`}>{lxc.uptime}</span>
      </div>

      {hasContainers && !collapsed && (
        <div className="containers-grid">
          {lxc.containers.map(container => (
            <ContainerCard key={container.id} container={container} hostIp={lxc.ip} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerCard({ container, hostIp }) {
  const isRunning = container.state === 'running';
  const isHostNetwork = container.networkMode === 'host';
  const isVpn = container.networkMode === 'vpn';
  const [iconError, setIconError] = useState(false);
  
  // Build port links - limit to first 3
  const ports = container.ports || [];
  const extraPorts = ports.length > 3 ? ` +${ports.length - 3}` : '';
  
  const iconUrl = getIconUrl(container.name);

  return (
    <div className={`container-card ${isRunning ? 'running' : 'stopped'}`}>
      <div className="container-header">
        {!iconError ? (
          <img 
            src={iconUrl} 
            alt="" 
            className="container-icon"
            onError={() => setIconError(true)}
          />
        ) : (
          <StatusDot status={isRunning ? 'up' : 'down'} size="small" />
        )}
        <span className="container-name">{container.name}</span>
        <StatusDot status={isRunning ? 'up' : 'down'} size="small" />
      </div>
      {ports.length > 0 && (
        <div className="container-ports">
          {ports.slice(0, 3).map((p, i) => (
            <span key={p.host}>
              {i > 0 && ', '}
              <a href={`http://${hostIp}:${p.host}`} target="_blank" rel="noopener noreferrer" className="clickable-link">{hostIp}:{p.host}</a>
            </span>
          ))}
          {extraPorts && <span className="extra-ports">{extraPorts}</span>}
        </div>
      )}
      {container.ip && <div className="container-ip">{container.ip}</div>}
      {isHostNetwork && !container.ip && <div className="container-ip host-net">{hostIp} (host)</div>}
      {isVpn && !container.ip && ports.length === 0 && <div className="container-ip host-net">{hostIp} (vpn)</div>}
      <div className="container-image">{container.image}</div>
    </div>
  );
}

function StatusDot({ status, size = 'normal' }) {
  return (
    <span 
      className={`status-dot ${size}`}
      style={{ backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.unknown }}
      title={status}
    />
  );
}

export default App;
