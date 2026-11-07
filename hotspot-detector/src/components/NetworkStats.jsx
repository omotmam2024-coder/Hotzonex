function fmt(date) {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function NetworkStats({ total, active, idle, lastScan }) {
  return (
    <div className="stats-bar">
      <div className="stat-card">
        <span className="stat-value">{total}</span>
        <span className="stat-label">Total Devices</span>
      </div>
      <div className="stat-card s-active">
        <span className="stat-value">{active}</span>
        <span className="stat-label">Active</span>
      </div>
      <div className="stat-card s-idle">
        <span className="stat-value">{idle}</span>
        <span className="stat-label">Idle</span>
      </div>
      <div className="stat-card s-time">
        <span className="stat-value">{fmt(lastScan)}</span>
        <span className="stat-label">Last Scan</span>
      </div>
    </div>
  );
}
