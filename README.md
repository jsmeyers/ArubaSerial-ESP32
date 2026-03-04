# ESP32 USB-C Serial Console Server

Complete firmware for ESP32-S2/S3 to create a USB-C serial console server with web interface.

## Features

- ✅ **WiFi Modes**: AP, STA, or AP+STA (dual mode)
- ✅ **Web Interface**: Modern responsive UI with terminal
- ✅ **Authentication**: Password-protected access
- ✅ **Static/DHCP IP**: Configure network settings
- ✅ **Configuration Storage**: Settings saved to LittleFS
- ✅ **Network Scanning**: Find WiFi networks
- ✅ **Factory Reset**: Restore defaults

## Hardware

### Supported Boards
| Board | USB-C | Notes |
|-------|-------|-------|
| ESP32-S2 | ✅ Native | Recommended |
| ESP32-S3 | ✅ Native | More GPIO pins |
| ESP32 | ❌ External | Needs USB-Serial adapter |

### Wiring
```
ESP32-S2/S3 USB-C ──► Device Console Port
                      (D+, D-, GND)
```

## Quick Start

### 1. Build & Flash
```bash
cd USBSerial-ESP32
pio run -e esp32-s2 -t upload
pio device monitor
```

### 2. Connect
- Connect to WiFi: `SerialConsole-XXXXXX`
- Password: `serial123`
- Open: `http://192.168.4.1`
- Login: `admin` / `admin`

### 3. Use
- Select WiFi mode (AP/STA/Dual)
- Configure network settings
- Connect USB-C to device console
- Open Terminal tab and interact

## Testing Without Hardware

Run the simulator:
```bash
cd test
npm install
node simulator.js 3000 3001
```

Open `http://localhost:3000` (or your network IP from other devices)

## Configuration

### WiFi Modes

| Mode | Description |
|------|-------------|
| **AP** | Creates hotspot for devices to connect |
| **STA** | Connects to existing WiFi network |
| **Dual** | Both AP and STA simultaneously |

### Static IP
1. Go to Network tab
2. Enable "Use Static IP"
3. Enter IP, Gateway, Subnet, DNS
4. Save & Restart

### Authentication
1. Go to Settings (⚙️)
2. Enable/disable authentication
3. Change username/password
4. Factory reset available

## Project Structure

```
USBSerial-ESP32/
├── src/
│   ├── main.cpp        # Main firmware
│   ├── config.h        # Config structure
│   └── config.cpp      # Config persistence
├── test/
│   ├── simulator.js    # Node.js simulator
│   └── package.json
├── platformio.ini      # Build config
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | Authenticate |
| `/api/config` | GET | Get all config |
| `/api/status` | GET | Device status |
| `/api/network` | POST | Save WiFi config |
| `/api/serial` | POST | Save serial config |
| `/api/device` | POST | Save device config |
| `/api/scan` | GET | Scan WiFi networks |
| `/api/baud` | POST | Change baud rate |
| `/api/reset` | POST | Factory reset |

## Default Settings

| Setting | Value |
|---------|-------|
| SSID | SerialConsole-XXXXXX |
| Password | serial123 |
| Username | admin |
| Password | admin |
| IP (AP mode) | 192.168.4.1 |
| Baud Rate | 9600 |

## Troubleshooting

### Can't Compile
```bash
# Install dependencies
pio lib install "ArduinoJson" "WebSockets"
```

### No WiFi Network
- Wait 30 seconds after power on
- Check LED is blinking
- Try factory reset (hold GPIO0 button 10 sec)

### Can't Login
- Defaults: admin/admin
- Factory reset if forgotten

### Upload Fails
1. Hold BOOT button
2. Press RESET button
3. Release RESET
4. Release BOOT
5. Upload starts

## License

MIT License