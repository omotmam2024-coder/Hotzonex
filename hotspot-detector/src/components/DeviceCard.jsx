function deviceIcon(vendor = '', hostname = '') {
  const v = vendor.toLowerCase();
  const h = hostname.toLowerCase();
  if (v.includes('apple') || h.includes('iphone') || h.includes('ipad') || h.includes('macbook'))
    return '🍎';
  if (v.includes('samsung') || v.includes('xiaomi') || v.includes('lg') ||
      v.includes('motorola') || h.includes('android') || h.includes('phone'))
    return '📱';
  if (v.includes('huawei') && (h.includes('phone') || h.includes('p2') || h.includes('mate')))
    return '📱';
  if (v.includes('cisco') || v.includes('tp-link') || v.includes('d-link') ||
      v.includes('netgear') || h.includes('router') || h.includes('ap-'))
    return '📡';
  if (v.includes('raspberry') || v.includes('arduino'))
    return '🖥️';
  if (v.includes('amazon') || h.includes('echo') || h.includes('alexa'))
    return '🔊';
  if (v.includes('google') || h.includes('chromecast'))
    return '📺';
  if (h.includes('laptop') || h.includes('desktop') || h.includes('pc') || h.includes('windows'))
    return '💻';
  return '🖥️';
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function truncate(str, n) {
  return str?.length > n ? str.slice(0, n) + '…' : str;
}

export default function DeviceCard({ device }) {
  const isActive = device.state === 'active';
  const icon = deviceIcon(device.vendor, device.hostname);

  return (
    <div className={`device-card ${isActive ? 'active' : 'idle'}`}>
      <div className="card-top">
        <span className="device-icon" role="img" aria-label={device.vendor}>{icon}</span>
        <span className={`status-badge ${isActive ? 'active' : 'idle'}`}>
          <span className={`s-dot ${isActive ? 'pulse' : ''}`} />
          {isActive ? 'Active' : 'Idle'}
        </span>
      </div>

      <div className="device-ip">{device.ip}</div>

      <div className="device-details">
        <div className="detail-row">
          <span className="dl">Hostname</span>
          <span className="dv" title={device.hostname}>{truncate(device.hostname, 22)}</span>
        </div>
        <div className="detail-row">
          <span className="dl">MAC</span>
          <span className="dv mono">{device.mac}</span>
        </div>
        <div className="detail-row">
          <span className="dl">Vendor</span>
          <span className="dv">{device.vendor}</span>
        </div>
        <div className="detail-row">
          <span className="dl">Source</span>
          <span className={`src-badge ${device.source}`}>{device.source.toUpperCase()}</span>
        </div>
      </div>

      <div className="card-footer">
        Seen {timeAgo(device.lastSeen)}
        {device.leaseExpiry && (
          <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>
            · lease {new Date(device.leaseExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
