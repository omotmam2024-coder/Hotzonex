// Run: npm install && npm run dev
// Production: npm run build && npm start
// Note: DHCP lease files and /proc/net/arp may require root/sudo on the host.

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const dnsReverse = (ip) =>
  new Promise((res) => dns.reverse(ip, (err, h) => res(err ? null : h?.[0] ?? null)));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); next(); });

// OUI prefix → vendor name (first 6 hex chars of MAC, no colons, uppercase)
const OUI = {
  'F45C89': 'Apple',   'D89EF3': 'Apple',   'A4C361': 'Apple',   'BC9FEF': 'Apple',
  '001A2F': 'Cisco',   '00270E': 'Cisco',   'C4B301': 'Cisco',   '001122': 'Cisco',
  '00155D': 'Microsoft','0050F2': 'Microsoft','28187D': 'Microsoft',
  'B827EB': 'Raspberry Pi','DC4A9E': 'Raspberry Pi','E45F01': 'Raspberry Pi',
  '40B034': 'Huawei',  '000B46': 'Huawei',  '94DBD1': 'Huawei',  'C8144B': 'Huawei',
  'AC83F3': 'Samsung', '002339': 'Samsung', '8C7712': 'Samsung', '30CD45': 'Samsung',
  '48A415': 'Xiaomi',  'FC641A': 'Xiaomi',  '64B473': 'Xiaomi',  '58447A': 'Xiaomi',
  '6C4008': 'TP-Link', '50BD5F': 'TP-Link', 'B025AA': 'TP-Link', 'C046D0': 'TP-Link',
  'C80E14': 'D-Link',  '1CBF15': 'D-Link',  '14D64D': 'D-Link',
  '4CEE0B': 'Amazon',  '74C24A': 'Amazon',  '44650D': 'Amazon',  'F081AF': 'Amazon',
  'AC3743': 'Google',  'F488E2': 'Google',  '54607E': 'Google',  '1C873B': 'Google',
  '1C69F5': 'Intel',   '8045DD': 'Intel',   '1007B4': 'Intel',   'F8341F': 'Intel',
  '9C5C8E': 'LG Electronics', '001E75': 'LG Electronics',
  '8C8D28': 'Motorola','000A28': 'Motorola','007047': 'Motorola',
  '00E04C': 'Realtek', '001CF0': 'Realtek', '788CB5': 'Realtek',
};

function getVendor(mac) {
  if (!mac) return 'Unknown';
  const oui = mac.replace(/[:\-]/g, '').substring(0, 6).toUpperCase();
  return OUI[oui] ?? 'Unknown';
}

// Strategy A: dnsmasq DHCP lease file
async function readDhcpLeases() {
  const candidates = [
    '/var/lib/misc/dnsmasq.leases',
    '/var/lib/dnsmasq/dnsmasq.leases',
    '/tmp/dnsmasq.leases',
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      const devices = [];
      for (const line of raw.split('\n').filter(Boolean)) {
        const [expiry, mac, ip, hostname] = line.split(/\s+/);
        if (mac && ip) {
          devices.push({
            ip,
            mac: mac.toUpperCase(),
            hostname: hostname === '*' ? null : hostname,
            leaseExpiry: new Date(parseInt(expiry, 10) * 1000).toISOString(),
            source: 'dhcp',
          });
        }
      }
      if (devices.length) return devices;
    } catch {
      continue;
    }
  }
  return null;
}

// Strategy B: ARP / neighbor table
async function readArpTable() {
  try {
    const { stdout } = await execAsync('ip neigh show');
    const devices = [];
    const seen = new Set();
    for (const line of stdout.split('\n').filter(Boolean)) {
      const parts = line.split(/\s+/);
      const ip = parts[0];
      const llidx = parts.indexOf('lladdr');
      const mac = llidx >= 0 ? parts[llidx + 1] : null;
      const state = parts[parts.length - 1];
      if (!mac || ip.includes(':') || seen.has(ip)) continue;
      if (state === 'FAILED' || state === 'INCOMPLETE') continue;
      seen.add(ip);
      devices.push({ ip, mac: mac.toUpperCase(), arpState: state, source: 'arp' });
    }
    return devices;
  } catch {
    // fallback: /proc/net/arp
    try {
      const raw = await fs.readFile('/proc/net/arp', 'utf8');
      return raw.split('\n').slice(1).filter(Boolean).map((line) => {
        const p = line.split(/\s+/);
        return { ip: p[0], mac: p[3]?.toUpperCase(), arpState: 'STALE', source: 'arp' };
      }).filter((d) => d.mac && d.mac !== '00:00:00:00:00:00');
    } catch {
      return [];
    }
  }
}

const ACTIVE_STATES = new Set(['REACHABLE', 'DELAY', 'PROBE']);

async function getDevices() {
  const [dhcp, arp] = await Promise.all([readDhcpLeases(), readArpTable()]);

  const map = new Map();

  // Seed from DHCP (most complete for a hotspot)
  if (dhcp) {
    for (const d of dhcp) map.set(d.ip, { ...d, state: 'idle' });
  }

  // Overlay ARP data (adds reachability state + devices not in DHCP)
  for (const d of arp) {
    const state = ACTIVE_STATES.has(d.arpState) ? 'active' : 'idle';
    if (map.has(d.ip)) {
      map.set(d.ip, { ...map.get(d.ip), state });
    } else {
      map.set(d.ip, { ...d, state });
    }
  }

  const now = new Date().toISOString();
  return Promise.all(
    [...map.values()].map(async (d) => {
      const hostname = d.hostname ?? (await dnsReverse(d.ip));
      return {
        id: d.mac ?? d.ip,
        ip: d.ip,
        mac: d.mac ?? 'Unknown',
        hostname: hostname ?? d.ip,
        vendor: getVendor(d.mac),
        state: d.state ?? 'idle',
        source: d.source ?? 'arp',
        leaseExpiry: d.leaseExpiry ?? null,
        lastSeen: now,
      };
    })
  );
}

async function getInterfaces() {
  try {
    const { stdout } = await execAsync('ip addr show');
    const ifaces = [];
    for (const block of stdout.split(/\n(?=\d+:)/)) {
      const name = block.match(/\d+:\s+(\S+):/)?.[1];
      const ip = block.match(/inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
      const mac = block.match(/link\/ether\s+([0-9a-f:]+)/i);
      const state = block.match(/state\s+(\w+)/)?.[1] ?? 'UNKNOWN';
      if (name && ip) {
        ifaces.push({ name, ip: ip[1], prefix: ip[2], mac: mac?.[1].toUpperCase() ?? null, state });
      }
    }
    return ifaces;
  } catch {
    return [];
  }
}

app.get('/api/devices', async (req, res) => {
  try {
    const devices = await getDevices();
    res.json({ devices, count: devices.length, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interfaces', async (req, res) => {
  try {
    const interfaces = await getInterfaces();
    res.json({ interfaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built React app in production
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`\n  HotZone-X Device Detector → http://localhost:${PORT}\n`);
});
