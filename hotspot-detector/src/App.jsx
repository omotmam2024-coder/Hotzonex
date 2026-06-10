import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import NetworkStats from './components/NetworkStats';
import ScanControls from './components/ScanControls';
import DeviceCard from './components/DeviceCard';

export default function App() {
  const [devices, setDevices] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setDevices(data.devices ?? []);
      setLastScan(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInterfaces = useCallback(async () => {
    try {
      const res = await fetch('/api/interfaces');
      const data = await res.json();
      setInterfaces(data.interfaces ?? []);
    } catch {
      // silent — interface info is decorative
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchInterfaces();
  }, [fetchDevices, fetchInterfaces]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchDevices, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchDevices]);

  const filtered = devices.filter((d) => {
    if (filter === 'active') return d.state === 'active';
    if (filter === 'idle') return d.state === 'idle';
    return true;
  });

  const activeCount = devices.filter((d) => d.state === 'active').length;
  const idleCount = devices.filter((d) => d.state === 'idle').length;

  return (
    <div className="app">
      <Header interfaces={interfaces} />

      <main className="main">
        <NetworkStats
          total={devices.length}
          active={activeCount}
          idle={idleCount}
          lastScan={lastScan}
        />

        <ScanControls
          loading={loading}
          autoRefresh={autoRefresh}
          filter={filter}
          onScan={fetchDevices}
          onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
          onFilterChange={setFilter}
        />

        {error && (
          <div className="error-banner">
            <span className="error-icon">&#9888;</span>
            {error} — make sure the server has permission to read ARP/DHCP data.
          </div>
        )}

        {loading && devices.length === 0 ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Scanning network&hellip;</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128225;</div>
            <p>No {filter !== 'all' ? filter + ' ' : ''}devices found</p>
            <small>Connect devices to your hotspot, then click Scan Now</small>
          </div>
        ) : (
          <div className="device-grid">
            {filtered.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
