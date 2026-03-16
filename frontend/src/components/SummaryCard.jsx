import React from 'react';

const STATUS_COLORS = {
  healthy: '#3fb950',
  warning: '#d29922',
  degraded: '#f85149',
  unknown: '#8b949e',
  error: '#f85149'
};

export function SummaryCard({ title, icon, stats, status, linkTo, external, onClick }) {
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  
  const handleClick = () => {
    if (external && linkTo) {
      window.open(linkTo, '_blank', 'noopener,noreferrer');
    } else if (onClick) {
      onClick();
    } else if (linkTo) {
      window.location.hash = linkTo;
    }
  };

  return (
    <div className="summary-card" onClick={handleClick} style={{ cursor: 'pointer' }}>
      <div className="card-header">
        <span className="card-icon">{icon}</span>
        <span className="card-title">{title}</span>
        <span className="card-status" style={{ backgroundColor: statusColor }}></span>
      </div>
      <div className="card-stats">
        {stats.map((stat, i) => (
          <div key={i} className="card-stat">
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="card-footer">
        {external ? '↗ Open' : '→ View details'}
      </div>
    </div>
  );
}

export default SummaryCard;
