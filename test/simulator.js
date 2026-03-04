#!/usr/bin/env node
/**
 * ESP32 Serial Console Server - Hardware Simulator (Node.js)
 * 
 * This simulates an Aruba CX switch console for testing the web interface
 * without real hardware.
 * 
 * Usage:
 *   node test/simulator.js [http_port] [ws_port]
 *   node test/simulator.js 34567 34568
 * 
 * Then open: http://localhost:<http_port>
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Configuration - use command line args or defaults
const HTTP_PORT = parseInt(process.argv[2]) || 3000;
const WS_PORT = parseInt(process.argv[3]) || HTTP_PORT + 1;

// Get all network interfaces for display
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

// State
const connectedClients = new Set();
let bytesReceived = 0;
let bytesSent = 0;

// Aruba switch responses
const ARUBA_PROMPT = `
ArubaOS (CN) Version 8.10.0.0 (BUILD-8.10.0.0_90732)
Copyright (c) Aruba Networks, Inc. All rights reserved.

Switch IP: 192.168.1.1

`;

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
Uptime: 15 days, 23 hours, 45 minutes
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

function getTimestamp() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
}

// HTML page
const INDEX_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serial Console (Simulated)</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #3498db; margin-bottom: 20px; }
        .sim-notice { background: #f39c12; color: #000; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }
        .status { background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .status span { margin-right: 20px; }
        .connected { color: #27ae60; }
        .disconnected { color: #e74c3c; }
        .controls { margin-bottom: 15px; }
        select, button { padding: 8px 16px; margin-right: 10px; border-radius: 4px; border: 1px solid #555; background: #333; color: #fff; }
        button { cursor: pointer; background: #3498db; }
        button:hover { background: #2980b9; }
        #terminal { background: #000; padding: 15px; height: 400px; overflow-y: auto; border-radius: 8px; margin-bottom: 15px; font-size: 14px; }
        #terminal pre { white-space: pre-wrap; word-wrap: break-word; }
        .input-row { display: flex; gap: 10px; }
        #input { flex: 1; padding: 10px; border-radius: 4px; border: 1px solid #555; background: #2d2d2d; color: #0f0; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔌 Serial Console</h1>
        <div class="sim-notice">
            ⚠️ SIMULATION MODE - Not connected to real hardware.
            Commands simulate an Aruba CX switch console.
        </div>
        <div class="status">
            <span>Serial: <span id="serialStatus" class="connected">Connected</span></span>
            <span>WebSocket: <span id="wsStatus" class="disconnected">Disconnected</span></span>
            <span>Clients: <span id="clientCount">0</span></span>
            <span>RX: <span id="rxBytes">0</span></span>
            <span>TX: <span id="txBytes">0</span></span>
        </div>
        <div class="controls">
            <label>Baud: 
                <select id="baudRate">
                    <option value="9600" selected>9600</option>
                    <option value="19200">19200</option>
                    <option value="38400">38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                </select>
            </label>
            <button onclick="connectWebSocket()">Connect</button>
            <button onclick="disconnectWebSocket()">Disconnect</button>
            <button onclick="clearTerminal()">Clear</button>
        </div>
        <div id="terminal">
            <pre id="output">ArubaOS (CN) Version 8.10.0.0
Copyright (c) Aruba Networks, Inc.

Type 'help' for commands.

# </pre>
        </div>
        <div class="input-row">
            <input type="text" id="input" placeholder="Enter command..." disabled>
            <button onclick="sendData()" id="sendBtn" disabled>Send</button>
        </div>
        <div style="margin-top:20px; padding:15px; background:#2d2d2d; border-radius:8px;">
            <strong>Simulated Commands:</strong><br>
            <code style="color:#0f0;">help, show version, show interfaces, show vlan, show mac, show running, ping &lt;ip&gt;</code>
        </div>
    </div>
    <script>
        let ws = null;
        let connected = false;
        let rxBytes = 0;
        let txBytes = 0;

        function connectWebSocket() {
            if (ws) ws.close();
            // Use the same port as WS_PORT (HTTP port + 1 by default)
            const wsPort = 81;  // Will be replaced dynamically
            const wsUrl = 'ws://' + window.location.hostname + ':' + wsPort + '/';
            appendOutput('\\n[Connecting...]\\n');
            ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';
            ws.onopen = function() {
                connected = true;
                document.getElementById('wsStatus').textContent = 'Connected';
                document.getElementById('wsStatus').className = 'connected';
                document.getElementById('input').disabled = false;
                document.getElementById('sendBtn').disabled = false;
                appendOutput('[WebSocket connected]\\n# ');
            };
            ws.onmessage = function(event) {
                const text = event.data instanceof ArrayBuffer 
                    ? new TextDecoder().decode(event.data) 
                    : event.data;
                appendOutput(text);
            };
            ws.onclose = function() {
                connected = false;
                document.getElementById('wsStatus').textContent = 'Disconnected';
                document.getElementById('wsStatus').className = 'disconnected';
                document.getElementById('input').disabled = true;
                document.getElementById('sendBtn').disabled = true;
                appendOutput('\\n[WebSocket disconnected]\\n');
            };
            ws.onerror = function() {
                appendOutput('\\n[WebSocket error]\\n');
            };
        }

        function disconnectWebSocket() {
            if (ws) { ws.close(); ws = null; }
        }

        function sendData() {
            const input = document.getElementById('input');
            const cmd = input.value.trim();
            if (ws && connected && cmd) {
                ws.send(cmd + '\\n');
                appendOutput(cmd + '\\n');
                txBytes += cmd.length + 1;
                document.getElementById('txBytes').textContent = txBytes;
                input.value = '';
            }
        }

        document.getElementById('input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendData();
        });

        function appendOutput(text) {
            const output = document.getElementById('output');
            output.textContent += text;
            document.getElementById('terminal').scrollTop = document.getElementById('terminal').scrollHeight;
            rxBytes += text.length;
            document.getElementById('rxBytes').textContent = rxBytes;
        }

        function clearTerminal() {
            document.getElementById('output').textContent = '# ';
            rxBytes = 0; txBytes = 0;
            document.getElementById('rxBytes').textContent = '0';
            document.getElementById('txBytes').textContent = '0';
        }

        setInterval(function() {
            fetch('/api/status')
                .then(r => r.json())
                .then(d => document.getElementById('clientCount').textContent = d.clients)
                .catch(() => {});
        }, 1000);

        window.onload = function() { setTimeout(connectWebSocket, 500); };
    </script>
</body>
</html>
`;

// HTTP Server
const httpServer = http.createServer((req, res) => {
    if (req.url === '/') {
        // Inject WebSocket port into HTML dynamically
        const html = INDEX_HTML.replace(/const wsPort = 81;/g, `const wsPort = ${WS_PORT};`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } else if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            serial: true,
            clients: connectedClients.size,
            tx: bytesSent,
            rx: bytesReceived
        }));
    } else if (req.url === '/api/baud' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success":true}');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// WebSocket Server - listen on all interfaces
const wsServer = new WebSocket.Server({ 
    host: '0.0.0.0',
    port: WS_PORT 
});

wsServer.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log(`[${getTimestamp()}] Client connected. Total: ${connectedClients.size}`);
    
    // Send initial prompt
    ws.send('\n# ');
    
    ws.on('message', (data) => {
        const command = data.toString().trim().toLowerCase();
        bytesReceived += data.length;
        console.log(`[${getTimestamp()}] Received: ${command}`);
        
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
        
        bytesSent += response.length + 2;
        ws.send(response + '\n# ');
    });
    
    ws.on('close', () => {
        connectedClients.delete(ws);
        console.log(`[${getTimestamp()}] Client disconnected. Total: ${connectedClients.size}`);
    });
});

// Start servers - listen on all interfaces (0.0.0.0)
httpServer.listen(HTTP_PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error(`Failed to start HTTP server on port ${HTTP_PORT}: ${err.message}`);
        console.error('Port is in use. Try: node simulator.js <http_port> <ws_port>');
        console.error('Example: node simulator.js 3000 3001');
        process.exit(1);
    }
    
    const networkIPs = getNetworkIPs();
    
    console.log('='.repeat(60));
    console.log('ESP32 Serial Console Server - SIMULATOR');
    console.log('='.repeat(60));
    console.log(`[${getTimestamp()}] HTTP server started on port ${HTTP_PORT}`);
    console.log(`[${getTimestamp()}] WebSocket server started on port ${WS_PORT}`);
    console.log('');
    console.log('Access from:');
    console.log(`  Local:   http://localhost:${HTTP_PORT}`);
    
    if (networkIPs.length > 0) {
        networkIPs.forEach(ip => {
            console.log(`  Network: http://${ip}:${HTTP_PORT}`);
        });
    }
    
    console.log('');
    console.log('This simulates an Aruba CX switch console.');
    console.log('Commands: help, show version, show interfaces, etc.');
    console.log('='.repeat(60));
});