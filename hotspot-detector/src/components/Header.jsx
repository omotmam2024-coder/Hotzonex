export default function Header({ interfaces }) {
  return (
    <header className="header">
      <div className="header-logo">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M1.5 8.5C5.5 4.5 10 2.5 12 2.5s6.5 2 10.5 6"
            stroke="#00e5c3" strokeWidth="2" strokeLinecap="round" />
          <path d="M4.5 11.5C7.5 8.5 10 7 12 7s4.5 1.5 7.5 4.5"
            stroke="#00e5c3" strokeWidth="2" strokeLinecap="round" />
          <path d="M7.5 14.5C9.5 12.5 10.8 11.5 12 11.5s2.5 1 4.5 3"
            stroke="#00e5c3" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="19" r="2.2" fill="#00e5c3" />
        </svg>
        <div>
          <div className="header-title">HotZone-X</div>
          <span className="header-subtitle">Device Detector</span>
        </div>
      </div>

      {interfaces.length > 0 && (
        <div className="interfaces">
          {interfaces.slice(0, 4).map((iface) => (
            <div key={iface.name} className="iface-badge">
              <span className={`iface-dot ${iface.state === 'UP' ? 'up' : 'down'}`} />
              <span className="iface-name">{iface.name}</span>
              <span className="iface-ip">{iface.ip}/{iface.prefix}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
