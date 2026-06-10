export default function ScanControls({
  loading, autoRefresh, filter,
  onScan, onToggleAutoRefresh, onFilterChange,
}) {
  return (
    <div className="controls">
      <div className="filter-tabs">
        {['all', 'active', 'idle'].map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="control-right">
        <button
          className={`auto-btn ${autoRefresh ? 'on' : ''}`}
          onClick={onToggleAutoRefresh}
          title="Toggle auto-refresh every 10 s"
        >
          <span className={`pulse-dot ${autoRefresh ? 'on' : ''}`} />
          Auto&nbsp;{autoRefresh ? 'ON' : 'OFF'}
        </button>

        <button className="scan-btn" onClick={onScan} disabled={loading}>
          {loading ? (
            <><span className="btn-spin" /> Scanning&hellip;</>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Scan Now
            </>
          )}
        </button>
      </div>
    </div>
  );
}
