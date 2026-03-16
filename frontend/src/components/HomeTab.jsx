import React, { useState, useEffect } from 'react';
import SummaryCard from './SummaryCard';

export function HomeTab({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/summary');
        if (!res.ok) throw new Error('Failed to fetch summary');
        const data = await res.json();
        setSummary(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Loading summary...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!summary) return null;

  const cards = [
    {
      title: 'Infrastructure',
      icon: '🖥️',
      stats: [
        { value: summary.infrastructure.nodes, label: 'Nodes' },
        { value: summary.infrastructure.lxcs + summary.infrastructure.vms, label: 'VMs/LXCs' },
        { value: summary.infrastructure.containers, label: 'Containers' }
      ],
      status: summary.infrastructure.status,
      linkTo: 'infra'
    },
    {
      title: 'Automation',
      icon: '⚙️',
      stats: [
        { value: summary.automation.schedules, label: 'Schedules' },
        { value: summary.automation.active, label: 'Active' },
        { value: summary.automation.lastStatus || '—', label: 'Last Run' }
      ],
      status: summary.automation.status,
      linkTo: 'http://atlas:3002',
      external: true
    },
    {
      title: 'Monitoring',
      icon: '📊',
      stats: [
        { value: summary.monitoring.total, label: 'Monitors' },
        { value: summary.monitoring.up, label: 'Up' },
        { value: summary.monitoring.down, label: 'Down' }
      ],
      status: summary.monitoring.status,
      linkTo: 'http://atlas:3001',
      external: true
    },
    {
      title: 'Backups',
      icon: '💾',
      stats: [
        { value: summary.backups.total, label: 'Total' },
        { value: summary.backups.ok, label: 'OK' },
        { value: summary.backups.stale || 0, label: 'Stale' }
      ],
      status: summary.backups.status,
      linkTo: 'backups'
    },
    {
      title: 'Metrics',
      icon: '📈',
      stats: [
        { value: summary.metrics.cpu || '—', label: 'CPU' },
        { value: summary.metrics.memory || '—', label: 'Memory' },
        { value: summary.metrics.disk || '—', label: 'Disk' }
      ],
      status: summary.metrics.status,
      linkTo: 'http://atlas:3001/d/homelab',
      external: true
    },
    {
      title: 'Network',
      icon: '🌐',
      stats: [
        { value: summary.network.subnets || '—', label: 'Subnets' },
        { value: summary.network.hosts || '—', label: 'Hosts' },
        { value: '—', label: '' }
      ],
      status: summary.network.status,
      linkTo: 'http://atlas:8080/index.php?page=subnets&section=3&subnetId=7',
      external: true
    }
  ];

  return (
    <div className="home-tab">
      <div className="cards-grid">
        {cards.map((card, i) => (
          <SummaryCard
            key={i}
            title={card.title}
            icon={card.icon}
            stats={card.stats}
            status={card.status}
            linkTo={card.linkTo}
            external={card.external}
            onClick={card.external ? undefined : () => onNavigate(card.linkTo)}
          />
        ))}
      </div>
    </div>
  );
}

export default HomeTab;
