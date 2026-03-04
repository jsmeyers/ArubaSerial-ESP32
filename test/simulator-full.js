#!/usr/bin/env node
/**
 * ESP32 Serial Console Server - Full Simulator (Node.js)
 * 
 * This simulates the COMPLETE ESP32 interface including:
 * - User authentication
 * - WiFi configuration (AP/STA/Dual modes)
 * - Network scanning
 * - Device settings
 * - Serial console
 * 
 * Usage:
 *   node test/simulator-full.js [http_port] [ws_port]
 *   
 * Then open: http://localhost:<http_port>
 */

const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

// Configuration
const HTTP_PORT = parseInt(process.argv[2]) || 5000;
const WS_PORT = parseInt(process.argv[3]) || HTTP_PORT + 1;

// Get network IPs for display
const os = require('os');
function getNetworkIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

// Simulated device state
const deviceState = {
    deviceName: 'SerialConsole-A1B2C3',
    apSsid: 'SerialConsole-A1B2C3',
    apPassword: 'serial123',
    staSsid: '',
    staPassword: '',
    useStaticIp: false,
    staticIp: '192.168.1.100',
    gateway: '192.168.1.1',
    subnet: '255.255.255.0',
    dns1: '8.8.8.8',
    dns2: '8.8.4.4',
    wifiMode: 0, // 0=AP, 1=STA, 2=Dual
    staEnabled: false,
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'N',
    authEnabled: true,
    webUsername: 'admin',
    webPassword: 'admin'
};

// Simulated Aruba commands
const ARUBA_COMMANDS = {
    'help': `
Available commands:
  show version     - Show system version
  show interfaces  - Show interface status
  show vlan        - Show VLAN information
  show mac         - Show MAC address table
  show running     - Show running configuration
  ping <ip>        - Ping an IP address
  clear            - Clear screen
  exit             - Exit session
`,
    'show version': `
ArubaOS Version: 8.10.0.0
Build: 90732
Model: Aruba CX 6200F
Serial: AR01A2B3C4D5
MAC Address: 00:11:22:33:44:55
Uptime: 1 day, 2 hours, 30 minutes
CPU: 15%
Memory: 45% used
`,
    'show interfaces': `
Interface    Status    Protocol    Description
----------    ------    --------    -----------
1/1/1        up        up          Uplink-Core
1/1/2        up        up          AP-Floor1
1/1/3        down      down        Reserved
1/1/4        up        up          Server-Farm
1/1/5        up        up          User-VLAN
1/1/6        down      down        Not Connected
`,
    'show vlan': `
VLAN  Name                      Status    Ports  
----  ----                      ------    -----  
1     Default                   active    1/1/6  
10    Management                active    1/1/1  
20    Users                     active    1/1/2,1/1/5
30    Servers                   active    1/1/4  
100   Guest                     active    1/1/3  
`,
    'show mac': `
MAC Address       VLAN  Port          Type
----------------- ----  -----------   ------
00:11:22:33:44:55 10    1/1/1         Static
AA:BB:CC:DD:EE:FF 20    1/1/2         Dynamic
11:22:33:44:55:66 20    1/1/5         Dynamic
22:33:44:55:66:77 30    1/1/4         Dynamic
`,
    'show running': `
! Aruba CX Configuration
!
hostname Aruba-CX-Switch
!
vlan 1
   name "Default"
!
vlan 10
   name "Management"
!
vlan 20
   name "Users"
!
vlan 30
   name "Servers"
!
interface 1/1/1
   description "Uplink-Core"
   no shutdown
!
interface 1/1/2
   description "AP-Floor1"
   no shutdown
!
spanning-tree mode mstp
!
`
};

// Simulated networks for scanning
const SIMULATED_NETWORKS = [
    { ssid: 'HomeNetwork', rssi: -45, encryption: true, channel: 6 },
    { ssid: 'Office_Guest', rssi: -60, encryption: true, channel: 11 },
    { ssid: 'CoffeeShop', rssi: -75, encryption: false, channel: 1 },
    { ssid: 'Neighbor_5G', rssi: -82, encryption: true, channel: 36 },
    { ssid: 'ApartmentWiFi', rssi: -55, encryption: true, channel: 6 }
];

// Session storage
const sessions = new Map();
const wsClients = new Set();

// Helper functions
function getTimestamp() {
    return new Date().toTimeString().split(' ')[0];
}

function generateToken() {
    return crypto.randomBytes(16).toString('hex');
}

function isValidToken(token) {
    return sessions.has(token);
}

function simulatePing(ip) {
    return `
PING ${ip}: 64 bytes
Reply from ${ip}: bytes=64 time<1ms TTL=64
Reply from ${ip}: bytes=64 time<1ms TTL=64
Reply from ${ip}: bytes=64 time<1ms TTL=64
Reply from ${ip}: bytes=64 time<1ms TTL=64

--- ${ip} ping statistics ---
4 packets transmitted, 4 packets received, 0% packet loss
round-trip min/avg/max = 0/0/1 ms
`;
}

// Web interface HTML (matches the ESP32 firmware exactly)
const INDEX_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serial Console Simulator</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background: #1a1a2e; color: #eee; }
        .container { max-width: 1400px; margin: 0 auto; padding: 15px; }
        
        .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 20px; border-radius: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .header h1 { font-size: 24px; }
        .sim-badge { background: #f39c12; color: #000; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .header-actions { display: flex; gap: 10px; }
        .btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .btn:hover { transform: translateY(-1px); }
        .btn-primary { background: #4CAF50; color: white; }
        .btn-secondary { background: #2196F3; color: white; }
        .btn-danger { background: #f44336; color: white; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        
        .status-bar { display: flex; gap: 20px; background: #16213e; padding: 15px; border-radius: 8px; margin-bottom: 15px; flex-wrap: wrap; }
        .status-item { display: flex; flex-direction: column; }
        .status-label { font-size: 12px; color: #888; }
        .status-value { font-weight: bold; font-size: 14px; }
        .status-bad { color: #f44336; }
        .status-good { color: #4CAF50; }
        
        .tabs { display: flex; gap: 5px; margin-bottom: 15px; flex-wrap: wrap; }
        .tab { padding: 10px 20px; background: #16213e; border: none; color: #888; cursor: pointer; border-radius: 8px 8px 0 0; }
        .tab.active { background: #0f3460; color: white; }
        
        .panel { background: #16213e; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
        .panel h3 { margin-bottom: 15px; color: #667eea; }
        
        .terminal { background: #000; padding: 15px; border-radius: 8px; height: 350px; overflow-y: auto; font-family: 'Consolas','Monaco',monospace; font-size: 13px; }
        .terminal pre { white-space: pre-wrap; word-wrap: break-word; color: #0f0; }
        .terminal-controls { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
        .terminal-input { display: flex; gap: 10px; margin-top: 10px; }
        .terminal-input input { flex: 1; padding: 10px; background: #000; border: 1px solid #333; color: #0f0; font-family: monospace; border-radius: 4px; }
        
        .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
        .form-group input, .form-group select { width: 100%; padding: 10px; background: #0f3460; border: 1px solid #333; color: white; border-radius: 4px; }
        .form-group small { color: #888; font-size: 12px; }
        .checkbox-label { display: flex; align-items: center; gap: 8px; }
        .checkbox-label input { width: auto; }
        
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; z-index: 1000; }
        .modal.active { display: flex; }
        .modal-content { background: #16213e; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; }
        .modal-content h2 { margin-bottom: 20px; }
        
        .network-list { max-height: 200px; overflow-y: auto; margin-top: 10px; border: 1px solid #333; border-radius: 4px; }
        .network-item { padding: 10px; border-bottom: 1px solid #333; cursor: pointer; }
        .network-item:hover { background: #0f3460; }
        .network-item:last-child { border-bottom: none; }
        .network-ssid { font-weight: bold; }
        .network-details { font-size: 12px; color: #888; }
        
        @media (max-width: 768px) {
            .header { flex-direction: column; text-align: center; }
            .status-bar { flex-direction: column; }
        }
    </style>
</head>
<body>
    <!-- Auth Modal -->
    <div id="authModal" class="modal active">
        <div class="modal-content">
            <h2>🔐 Login Required</h2>
            <p style="margin-bottom:15px;color:#888">This is a SIMULATOR. Defaults shown.</p>
            <form id="authForm">
                <div class="form-group">
                    <label>Username:</label>
                    <input type="text" id="username" value="admin" required>
                </div>
                <div class="form-group">
                    <label>Password:</label>
                    <input type="password" id="password" value="admin" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%">Login</button>
            </form>
            <div id="authError" style="color:#f44336;margin-top:10px;text-align:center"></div>
        </div>
    </div>

    <div id="app" class="container" style="display:none">
        <!-- Header -->
        <div class="header">
            <div>
                <h1>🔌 Serial Console</h1>
                <small id="deviceName" style="opacity:0.7">Loading...</small>
                <span class="sim-badge">SIMULATOR</span>
            </div>
            <div class="header-actions">
                <button class="btn btn-secondary" onclick="showSettings()">⚙️ Settings</button>
                <button class="btn btn-danger" onclick="logout()">Logout</button>
            </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <div class="status-item"><span class="status-label">Serial</span><span id="serialStatus" class="status-value status-good">Connected</span></div>
            <div class="status-item"><span class="status-label">WebSocket</span><span id="wsStatus" class="status-value status-bad">Disconnected</span></div>
            <div class="status-item"><span class="status-label">WiFi Mode</span><span id="wifiMode" class="status-value">-</span></div>
            <div class="status-item"><span class="status-label">IP Address</span><span id="ipAddress" class="status-value">-</span></div>
            <div class="status-item"><span class="status-label">Clients</span><span id="clients" class="status-value">0</span></div>
            <div class="status-item"><span class="status-label">TX/RX</span><span id="traffic" class="status-value">0 / 0</span></div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
            <button class="tab active" onclick="showTab('terminal')">Terminal</button>
            <button class="tab" onclick="showTab('network')">Network</button>
            <button class="tab" onclick="showTab('serial')">Serial</button>
        </div>

        <!-- Terminal Tab -->
        <div id="terminalTab" class="panel">
            <div class="terminal-controls">
                <label>Baud: 
                    <select id="baudRate">
                        <option value="1200">1200</option>
                        <option value="2400">2400</option>
                        <option value="4800">4800</option>
                        <option value="9600" selected>9600</option>
                        <option value="19200">19200</option>
                        <option value="38400">38400</option>
                        <option value="57600">57600</option>
                        <option value="115200">115200</option>
                    </select>
                </label>
                <button class="btn btn-sm btn-primary" onclick="applyBaud()">Apply</button>
                <button class="btn btn-sm btn-secondary" onclick="clearTerminal()">Clear</button>
                <button class="btn btn-sm btn-primary" id="wsBtn" onclick="toggleWebSocket()">Connect</button>
            </div>
            <div class="terminal" id="terminal"><pre id="output">ArubaOS (CN) Version 8.10.0.0
Copyright (c) Aruba Networks, Inc.

Type 'help' for commands.

# </pre></div>
            <div class="terminal-input">
                <input type="text" id="terminalInput" placeholder="Enter command..." disabled>
                <button class="btn btn-primary" id="sendBtn" onclick="sendData()" disabled>Send</button>
            </div>
        </div>

        <!-- Network Tab -->
        <div id="networkTab" class="panel" style="display:none">
            <h3>WiFi Configuration</h3>
            <p style="margin-bottom:15px;color:#888">This is SIMULATED. Changes show UI behavior only.</p>
            <div class="settings-grid">
                <div>
                    <div class="form-group">
                        <label>WiFi Mode:</label>
                        <select id="wifiModeSelect" onchange="updateWifiMode()">
                            <option value="0">Access Point (AP)</option>
                            <option value="1">Station (STA)</option>
                            <option value="2">AP + Station (Dual)</option>
                        </select>
                    </div>
                    <h4 style="margin:20px 0 10px;color:#667eea">AP Settings (Hotspot)</h4>
                    <div class="form-group">
                        <label>SSID:</label>
                        <input type="text" id="apSsid" maxlength="32">
                    </div>
                    <div class="form-group">
                        <label>Password (min 8 chars):</label>
                        <input type="password" id="apPassword" minlength="8" maxlength="63">
                    </div>
                </div>
                <div>
                    <h4 style="margin:0 0 10px;color:#667eea">STA Settings (Connect to WiFi)</h4>
                    <div class="form-group">
                        <label>Network SSID:</label>
                        <input type="text" id="staSsid">
                        <button class="btn btn-sm btn-secondary" onclick="scanNetworks()" style="margin-top:5px">🔍 Scan</button>
                    </div>
                    <div id="networkScan" class="network-list" style="display:none"></div>
                    <div class="form-group">
                        <label>Password:</label>
                        <input type="password" id="staPassword">
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="useStaticIp" onchange="toggleStaticIp()">
                            Use Static IP
                        </label>
                    </div>
                    <div id="staticIpFields" style="display:none">
                        <div class="form-group"><label>IP:</label><input type="text" id="staticIp" placeholder="192.168.1.100"></div>
                        <div class="form-group"><label>Gateway:</label><input type="text" id="gateway" placeholder="192.168.1.1"></div>
                        <div class="form-group"><label>Subnet:</label><input type="text" id="subnet" placeholder="255.255.255.0"></div>
                        <div class="form-group"><label>DNS 1:</label><input type="text" id="dns1" placeholder="8.8.8.8"></div>
                        <div class="form-group"><label>DNS 2:</label><input type="text" id="dns2" placeholder="8.8.4.4"></div>
                    </div>
                </div>
            </div>
            <div style="margin-top:15px"><button class="btn btn-primary" onclick="saveNetwork()">Save & Restart (Simulated)</button></div>
        </div>

        <!-- Serial Tab -->
        <div id="serialTab" class="panel" style="display:none">
            <h3>Serial Port Settings</h3>
            <div class="settings-grid">
                <div>
                    <div class="form-group"><label>Baud Rate:</label><select id="serialBaud"><option value="1200">1200</option><option value="2400">2400</option><option value="4800">4800</option><option value="9600" selected>9600</option><option value="19200">19200</option><option value="38400">38400</option><option value="57600">57600</option><option value="115200">115200</option></select></div>
                    <div class="form-group"><label>Data Bits:</label><select id="dataBits"><option value="7">7</option><option value="8" selected>8</option></select></div>
                </div>
                <div>
                    <div class="form-group"><label>Parity:</label><select id="parity"><option value="N" selected>None</option><option value="E">Even</option><option value="O">Odd</option></select></div>
                    <div class="form-group"><label>Stop Bits:</label><select id="stopBits"><option value="1" selected>1</option><option value="2">2</option></select></div>
                </div>
            </div>
            <div style="margin-top:15px"><button class="btn btn-primary" onclick="saveSerial()">Save (Simulated)</button></div>
        </div>

        <!-- Settings Modal -->
        <div id="settingsModal" class="modal">
            <div class="modal-content" style="max-width:500px">
                <h2>⚙️ Device Settings</h2>
                <div class="form-group"><label>Device Name:</label><input type="text" id="deviceNameInput"></div>
                <div class="form-group"><label class="checkbox-label"><input type="checkbox" id="authEnabled"> Enable Authentication</label></div>
                <div id="authFields">
                    <div class="form-group"><label>Username:</label><input type="text" id="webUsername"></div>
                    <div class="form-group"><label>New Password:</label><input type="password" id="webPassword" placeholder="Leave blank to keep current"></div>
                </div>
                <div style="margin-top:15px;display:flex;gap:10px">
                    <button class="btn btn-primary" onclick="saveDevice()">Save</button>
                    <button class="btn btn-secondary" onclick="hideSettings()">Cancel</button>
                    <button class="btn btn-danger" onclick="factoryReset()" style="margin-left:auto">Factory Reset</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let connected = false;
        let token = localStorage.getItem('simToken') || '';
        const wsPort = WS_PORT;
        let txBytes = 0, rxBytes = 0;

        // Init
        document.addEventListener('DOMContentLoaded', () => {
            if (token) checkAuth();
        });

        // Auth
        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value;
            const pass = document.getElementById('password').value;
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: user, password: pass})
                });
                const data = await res.json();
                if (data.success) {
                    token = data.token;
                    localStorage.setItem('simToken', token);
                    document.getElementById('authModal').classList.remove('active');
                    document.getElementById('app').style.display = 'block';
                    loadConfig();
                    connectWebSocket();
                } else {
                    document.getElementById('authError').textContent = data.error || 'Invalid credentials';
                }
            } catch (err) {
                document.getElementById('authError').textContent = 'Connection error';
            }
        });

        async function checkAuth() {
            try {
                const res = await fetch('/api/config', {headers: {'Authorization': token}});
                if (res.status === 401) { localStorage.removeItem('simToken'); token = ''; return; }
                const data = await res.json();
                applyConfig(data);
                document.getElementById('authModal').classList.remove('active');
                document.getElementById('app').style.display = 'block';
                connectWebSocket();
            } catch (err) {
                document.getElementById('authModal').classList.remove('active');
                document.getElementById('app').style.display = 'block';
                loadConfig();
                connectWebSocket();
            }
        }

        function logout() { localStorage.removeItem('simToken'); token = ''; location.reload(); }

        // WebSocket
        function connectWebSocket() {
            if (ws) ws.close();
            const wsUrl = 'ws://' + window.location.hostname + ':' + wsPort + '/?token=' + token;
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                connected = true;
                document.getElementById('wsStatus').textContent = 'Connected';
                document.getElementById('wsStatus').className = 'status-value status-good';
                document.getElementById('terminalInput').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                document.getElementById('wsBtn').textContent = 'Disconnect';
                document.getElementById('wsBtn').className = 'btn btn-sm btn-danger';
                appendOutput('[WebSocket connected - Simulator]\\n# ');
            };
            ws.onmessage = (e) => {
                const text = e.data;
                appendOutput(text);
            };
            ws.onclose = () => {
                connected = false;
                document.getElementById('wsStatus').textContent = 'Disconnected';
                document.getElementById('wsStatus').className = 'status-value status-bad';
                document.getElementById('terminalInput').disabled = true;
                document.getElementById('sendBtn').disabled = true;
                document.getElementById('wsBtn').textContent = 'Connect';
                document.getElementById('wsBtn').className = 'btn btn-sm btn-primary';
            };
        }

        function toggleWebSocket() { if (connected) { ws.close(); } else { connectWebSocket(); } }

        document.getElementById('terminalInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendData(); });

        function sendData() {
            const input = document.getElementById('terminalInput');
            const cmd = input.value;
            if (ws && connected) {
                ws.send(cmd);
                appendOutput(cmd + '\\n');
                txBytes += cmd.length;
                document.getElementById('traffic').textContent = txBytes + ' / ' + rxBytes;
                input.value = '';
            }
        }

        function appendOutput(text) {
            const output = document.getElementById('output');
            output.textContent += text;
            rxBytes += text.length;
            document.getElementById('traffic').textContent = txBytes + ' / ' + rxBytes;
            document.getElementById('terminal').scrollTop = document.getElementById('terminal').scrollHeight;
        }

        function clearTerminal() { document.getElementById('output').textContent = '# '; txBytes = 0; rxBytes = 0; document.getElementById('traffic').textContent = '0 / 0'; }

        async function applyBaud() {
            const baud = document.getElementById('baudRate').value;
            await fetch('/api/baud', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': token},
                body: JSON.stringify({baudRate: parseInt(baud)})
            });
            appendOutput('[Baud rate set to ' + baud + ']\\n');
        }

        function showTab(name) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
            document.querySelector('.tab[onclick="showTab(\\''+name+'\\')"]').classList.add('active');
            document.getElementById(name + 'Tab').style.display = 'block';
        }

        async function loadConfig() {
            try {
                const res = await fetch('/api/config', {headers: {'Authorization': token}});
                const data = await res.json();
                applyConfig(data);
            } catch (err) { console.error('Failed to load config:', err); }
        }

        function applyConfig(data) {
            document.getElementById('deviceName').textContent = data.deviceName || 'SerialConsole';
            document.getElementById('wifiMode').textContent = ['AP', 'STA', 'AP+STA'][data.wifiMode || 0];
            document.getElementById('ipAddress').textContent = data.ip || '192.168.4.1';
            document.getElementById('wifiModeSelect').value = data.wifiMode || 0;
            document.getElementById('apSsid').value = data.apSsid || 'SerialConsole';
            document.getElementById('apPassword').value = '';
            document.getElementById('staSsid').value = data.staSsid || '';
            document.getElementById('staPassword').value = '';
            document.getElementById('useStaticIp').checked = data.useStaticIp || false;
            toggleStaticIp();
            document.getElementById('staticIp').value = data.staticIp || '192.168.1.100';
            document.getElementById('gateway').value = data.gateway || '192.168.1.1';
            document.getElementById('subnet').value = data.subnet || '255.255.255.0';
            document.getElementById('dns1').value = data.dns1 || '8.8.8.8';
            document.getElementById('dns2').value = data.dns2 || '8.8.4.4';
            document.getElementById('serialBaud').value = data.baudRate || 9600;
            document.getElementById('dataBits').value = data.dataBits || 8;
            document.getElementById('parity').value = data.parity || 'N';
            document.getElementById('stopBits').value = data.stopBits || 1;
            document.getElementById('deviceNameInput').value = data.deviceName || 'SerialConsole';
            document.getElementById('authEnabled').checked = data.authEnabled !== false;
            document.getElementById('webUsername').value = data.webUsername || 'admin';
        }

        function toggleStaticIp() {
            document.getElementById('staticIpFields').style.display = document.getElementById('useStaticIp').checked ? 'block' : 'none';
        }

        function updateWifiMode() {
            // Just update UI
        }

        async function scanNetworks() {
            const div = document.getElementById('networkScan');
            div.innerHTML = 'Scanning...';
            div.style.display = 'block';
            try {
                const res = await fetch('/api/scan', {headers: {'Authorization': token}});
                const networks = await res.json();
                div.innerHTML = '<strong>Available Networks:</strong><br>';
                networks.forEach(n => {
                    const signal = n.rssi > -50 ? '🟢 Excellent' : n.rssi > -60 ? '🟡 Good' : '🔴 Weak';
                    div.innerHTML += '<div class="network-item" onclick="selectNetwork(\\''+n.ssid+'\\')"><span class="network-ssid">'+n.ssid+'</span> <span class="network-details">'+signal+' ('+n.rssi+' dBm) '+(n.encryption?'🔒':'📶')+'</span></div>';
                });
            } catch (err) { div.innerHTML = 'Scan failed'; }
        }

        function selectNetwork(ssid) {
            document.getElementById('staSsid').value = ssid;
            document.getElementById('networkScan').style.display = 'none';
        }

        async function saveNetwork() {
            const data = {
                wifiMode: parseInt(document.getElementById('wifiModeSelect').value),
                apSsid: document.getElementById('apSsid').value,
                apPassword: document.getElementById('apPassword').value,
                staSsid: document.getElementById('staSsid').value,
                staPassword: document.getElementById('staPassword').value,
                useStaticIp: document.getElementById('useStaticIp').checked
            };
            if (data.useStaticIp) {
                data.staticIp = document.getElementById('staticIp').value;
                data.gateway = document.getElementById('gateway').value;
                data.subnet = document.getElementById('subnet').value;
                data.dns1 = document.getElementById('dns1').value;
                data.dns2 = document.getElementById('dns2').value;
            }
            try {
                const res = await fetch('/api/network', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': token},
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert('SIMULATOR: Settings would be saved on real device.\\nMode: ' + ['AP', 'STA', 'AP+STA'][data.wifiMode]);
                } else {
                    alert('Error: ' + (result.error || 'Unknown'));
                }
            } catch (err) { alert('Failed'); }
        }

        async function saveSerial() {
            alert('SIMULATOR: Serial settings would be saved on real device.');
        }

        function showSettings() { document.getElementById('settingsModal').classList.add('active'); }
        function hideSettings() { document.getElementById('settingsModal').classList.remove('active'); }

        async function saveDevice() {
            alert('SIMULATOR: Device settings would be saved on real device.');
            hideSettings();
        }

        async function factoryReset() {
            if (confirm('Reset all settings? This SIMULATOR will just reload.')) {
                location.reload();
            }
        }

        setInterval(async () => {
            try {
                const res = await fetch('/api/status', {headers: {'Authorization': token}});
                const data = await res.json();
                document.getElementById('serialStatus').textContent = data.serial ? 'Connected' : 'Disconnected';
                document.getElementById('serialStatus').className = 'status-value ' + (data.serial ? 'status-good' : 'status-bad');
                document.getElementById('clients').textContent = data.clients || 0;
            } catch (err) {}
        }, 2000);
    </script>
</body>
</html>
`.replace(/WS_PORT/g, WS_PORT);

// HTTP Server
const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Routes
    if (url.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(INDEX_HTML);
    }
    else if (url.pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const {username, password} = JSON.parse(body);
                if (username === deviceState.webUsername && password === deviceState.webPassword) {
                    const token = generateToken();
                    sessions.set(token, {username, created: Date.now()});
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({success: true, token}));
                } else {
                    res.writeHead(401, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({success: false, error: 'Invalid credentials'}));
                }
            } catch (e) {
                res.writeHead(400, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: 'Invalid JSON'}));
            }
        });
    }
    else if (url.pathname === '/api/config') {
        if (!isValidToken(req.headers.authorization)) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Unauthorized'}));
            return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            ...deviceState,
            ip: '192.168.4.1',
            password: undefined // Don't send password
        }));
    }
    else if (url.pathname === '/api/status') {
        if (!isValidToken(req.headers.authorization)) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Unauthorized'}));
            return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            serial: true,
            clients: wsClients.size,
            tx: txBytes,
            rx: rxBytes
        }));
    }
    else if (url.pathname === '/api/scan') {
        if (!isValidToken(req.headers.authorization)) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Unauthorized'}));
            return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(SIMULATED_NETWORKS));
    }
    else if (url.pathname === '/api/network' && req.method === 'POST') {
        if (!isValidToken(req.headers.authorization)) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Unauthorized'}));
            return;
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                Object.assign(deviceState, data);
                console.log(`[${getTimestamp()}] Network settings updated: Mode=${['AP', 'STA', 'AP+STA'][data.wifiMode]}`);
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({success: true, message: 'Settings saved (simulated)'}));
            } catch (e) {
                res.writeHead(400, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: 'Invalid JSON'}));
            }
        });
    }
    else if (url.pathname === '/api/baud' && req.method === 'POST') {
        if (!isValidToken(req.headers.authorization)) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Unauthorized'}));
            return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({success: true}));
    }
    else {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Not found'}));
    }
});

// WebSocket Server
const wsServer = new WebSocket.Server({host: '0.0.0.0', port: WS_PORT});

let txBytes = 0;
let rxBytes = 0;

wsServer.on('connection', (ws, req) => {
    // Check auth
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get('token');
    
    if (!isValidToken(token)) {
        ws.close();
        return;
    }
    
    wsClients.add(ws);
    ws.token = token;
    console.log(`[${getTimestamp()}] WebSocket client connected. Total: ${wsClients.size}`);
    
    ws.on('message', (data) => {
        const command = data.toString().trim().toLowerCase();
        rxBytes += data.length;
        console.log(`[${getTimestamp()}] Command: ${command}`);
        
        let response;
        if (command in ARUBA_COMMANDS) {
            response = ARUBA_COMMANDS[command];
        } else if (command.startsWith('ping ')) {
            const parts = command.split(' ');
            response = parts.length > 1 ? simulatePing(parts[1]) : 'Usage: ping <ip>\n';
        } else if (command === 'exit') {
            response = 'Session closed.\n';
            ws.send(response);
            ws.close();
            return;
        } else if (command === '') {
            response = '';
        } else {
            response = `Unknown command: ${command}\nType 'help' for commands.\n`;
        }
        
        txBytes += response.length + 2;
        ws.send(response + '\n# ');
    });
    
    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`[${getTimestamp()}] WebSocket client disconnected. Total: ${wsClients.size}`);
    });
});

// Start servers
httpServer.listen(HTTP_PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error(`Failed to start HTTP server: ${err.message}`);
        process.exit(1);
    }
    
    const networkIPs = getNetworkIPs();
    
    console.log('='.repeat(60));
    console.log('ESP32 Serial Console Server - FULL SIMULATOR');
    console.log('='.repeat(60));
    console.log(`[${getTimestamp()}] HTTP server started on port ${HTTP_PORT}`);
    console.log(`[${getTimestamp()}] WebSocket server started on port ${WS_PORT}`);
    console.log('');
    console.log('This simulates the COMPLETE ESP32 interface including:');
    console.log('  - Authentication (admin/admin)');
    console.log('  - WiFi configuration');
    console.log('  - Network scanning');
    console.log('  - Serial console (Aruba commands)');
    console.log('');
    console.log('Access from:');
    console.log(`  Local:   http://localhost:${HTTP_PORT}`);
    networkIPs.forEach(ip => {
        console.log(`  Network: http://${ip}:${HTTP_PORT}`);
    });
    console.log('');
    console.log('Default login: admin / admin');
    console.log('='.repeat(60));
});