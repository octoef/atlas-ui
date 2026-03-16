import { useState, useEffect } from 'react';

function cronToText(cron) {
  if (!cron) return '';
  const parts = cron.split(' ');
  if (parts.length < 5) return cron;
  const [min, hour, day, month, weekday] = parts;
  
  // Every X minutes
  if (min.startsWith('*/') && hour === '*') {
    return `Every ${min.slice(2)} min`;
  }
  // Every hour at minute X
  if (hour === '*' && !min.includes('*')) {
    return `Hourly at :${min.padStart(2, '0')}`;
  }
  // Daily at specific time
  if (day === '*' && month === '*' && weekday === '*' && !hour.includes('*')) {
    const h = parseInt(hour);
    const m = min === '0' ? '' : `:${min.padStart(2, '0')}`;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily ${h12}${m} ${ampm}`;
  }
  // Weekly
  if (weekday !== '*' && day === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = days[parseInt(weekday)] || weekday;
    return `Weekly (${d})`;
  }
  return cron;
}

export default function OpsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ops')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 20 }}>Failed to load</div>;

  const { schedules = [], tasks = [] } = data;
  const now = Date.now();
  const last24h = tasks.filter(t => (now - new Date(t.start).getTime()) < 86400000);
  const ok = last24h.filter(t => t.status === 'success').length;
  const fail = last24h.filter(t => t.status === 'error').length;
  const rate = last24h.length > 0 ? Math.round((ok / last24h.length) * 100) : 0;

  const semaphoreBase = 'http://10.0.60.120:3002';
  const taskUrl = (t) => `${semaphoreBase}/project/1/templates/${t.templateId}/tasks/${t.id}`;

  const styles = {
    page: { padding: '16px 24px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    h2: { margin: 0, fontSize: 20, fontWeight: 600, color: '#f0f6fc' },
    link: { color: '#58a6ff', textDecoration: 'none', fontSize: 14 },
    section: { marginBottom: 28 },
    sectionHeader: { fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 },
    schedGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
    sched: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    schedInfo: { flex: 1 },
    schedName: { fontSize: 14, fontWeight: 600, color: '#f0f6fc', marginBottom: 4 },
    schedCron: { fontSize: 12, color: '#8b949e', marginBottom: 6 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(63,185,80,0.15)', color: '#3fb950' },
    badgeInactive: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'rgba(139,148,158,0.15)', color: '#8b949e' },
    playBtn: { background: '#238636', border: 'none', borderRadius: 6, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
    card: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16, textAlign: 'center' },
    num: { fontSize: 28, fontWeight: 700, color: '#f0f6fc' },
    numGreen: { fontSize: 28, fontWeight: 700, color: '#3fb950' },
    numRed: { fontSize: 28, fontWeight: 700, color: '#f85149' },
    label: { fontSize: 11, fontWeight: 500, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 6 },
    strip: { display: 'flex', gap: 4, flexWrap: 'wrap', padding: 12, background: '#0d1117', borderRadius: 6, border: '1px solid #21262d' },
    dotGreen: { width: 10, height: 10, borderRadius: 2, background: '#3fb950' },
    dotRed: { width: 10, height: 10, borderRadius: 2, background: '#f85149' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #30363d', color: '#8b949e', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
    td: { padding: '10px 12px', borderBottom: '1px solid #21262d', color: '#c9d1d9' },
    taskLink: { color: '#58a6ff', textDecoration: 'none' },
    statusOk: { color: '#3fb950', fontWeight: 500 },
    statusErr: { color: '#f85149', fontWeight: 500 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.h2}>Operations</h2>
        <a href={semaphoreBase} target="_blank" rel="noopener noreferrer" style={styles.link}>Open Semaphore →</a>
      </div>

      {/* Schedules first */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Schedules</div>
        <div style={styles.schedGrid}>
          {schedules.map(s => (
            <div key={s.id} style={styles.sched}>
              <div style={styles.schedInfo}>
                <div style={styles.schedName}>{s.name}</div>
                <div style={styles.schedCron}>{cronToText(s.cron)}</div>
                <span style={s.active ? styles.badge : styles.badgeInactive}>{s.active ? 'Active' : 'Inactive'}</span>
              </div>
              <button style={styles.playBtn} title="Run Now">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>24 Hour Summary</div>
        <div style={styles.grid}>
          <div style={styles.card}><div style={styles.num}>{last24h.length}</div><div style={styles.label}>Total Runs</div></div>
          <div style={styles.card}><div style={styles.numGreen}>{ok}</div><div style={styles.label}>Successful</div></div>
          <div style={styles.card}><div style={styles.numRed}>{fail}</div><div style={styles.label}>Failed</div></div>
          <div style={styles.card}><div style={styles.num}>{rate}%</div><div style={styles.label}>Success Rate</div></div>
        </div>
        <div style={styles.strip}>
          {tasks.slice(0, 50).map((t, i) => (
            <div key={i} style={t.status === 'success' ? styles.dotGreen : styles.dotRed} title={t.name} />
          ))}
        </div>
      </div>

      {/* Recent Tasks */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Recent Tasks</div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Task</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Started</th>
              <th style={styles.th}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, 15).map(t => {
              const dur = t.start && t.end ? Math.round((new Date(t.end) - new Date(t.start)) / 1000) : null;
              return (
                <tr key={t.id}>
                  <td style={styles.td}>
                    <a href={taskUrl(t)} target="_blank" rel="noopener noreferrer" style={styles.taskLink}>
                      {t.name || `Task #${t.id}`}
                    </a>
                  </td>
                  <td style={styles.td}><span style={t.status === 'success' ? styles.statusOk : styles.statusErr}>{t.status}</span></td>
                  <td style={styles.td}>{new Date(t.start).toLocaleString()}</td>
                  <td style={styles.td}>{dur !== null ? `${dur}s` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
