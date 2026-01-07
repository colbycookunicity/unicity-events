# Unicity Events Print Bridge

A lightweight local service that allows the Unicity Events web app to print badges to Zebra printers on your local network.

## Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Events App     │ ──── │  Print Bridge   │ ──── │  Zebra Printer  │
│  (Cloud)        │ HTTP │  (This Service) │ TCP  │  (LAN)          │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

Web browsers cannot directly communicate with network printers. This bridge accepts HTTP requests from the Events app and forwards ZPL commands to Zebra printers over TCP port 9100.

## Requirements

- Node.js 18 or higher
- Network access to Zebra printers (same LAN or routable)
- Zebra printer with ZPL support (ZD421, ZD621, ZT411, etc.)

## Installation

```bash
cd print-bridge
npm install express cors
```

## Running the Service

```bash
# Default port 3100
node bridge.js

# Custom port
PORT=8080 node bridge.js
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║              UNICITY EVENTS PRINT BRIDGE                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running on http://0.0.0.0:3100                      ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /health           - Health check                   ║
║    POST /print            - Send ZPL to printer            ║
║    POST /printers/:id/test - Send test label               ║
╚════════════════════════════════════════════════════════════╝
```

## API Reference

### GET /health

Health check endpoint.

```bash
curl http://localhost:3100/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "print-bridge",
  "timestamp": "2025-01-07T18:30:00.000Z"
}
```

### POST /print

Send ZPL to a Zebra printer.

**Option 1 - Raw ZPL:**
```bash
curl -X POST http://localhost:3100/print \
  -H "Content-Type: application/json" \
  -d '{
    "printerIp": "192.168.1.50",
    "zpl": "^XA^FO50,50^A0N,50,50^FDHello World^FS^XZ"
  }'
```

**Option 2 - Events App Format (auto-generates ZPL):**
```bash
curl -X POST http://localhost:3100/print \
  -H "Content-Type: application/json" \
  -d '{
    "printer": { "ipAddress": "192.168.1.50", "port": 9100 },
    "badge": { "firstName": "Jane", "lastName": "Smith", "unicityId": "87654321" }
  }'
```

**Success Response:**
```json
{
  "success": true,
  "message": "Print job sent successfully"
}
```

**Error Response:**
```json
{
  "error": "Printer not responding at 192.168.1.50:9100 - connection refused"
}
```

### POST /printers/:id/test

Send a test label to verify printer connectivity.

```bash
curl -X POST http://localhost:3100/printers/test-1/test \
  -H "Content-Type: application/json" \
  -d '{ "ipAddress": "192.168.1.50", "port": 9100 }'
```

**Response:**
```json
{
  "success": true,
  "message": "Test label printed successfully"
}
```

## Testing Without a Real Printer

Use netcat to simulate a printer:

```bash
# Terminal 1: Start fake printer listener
nc -l 9100

# Terminal 2: Send print request
curl -X POST http://localhost:3100/print \
  -H "Content-Type: application/json" \
  -d '{ "printerIp": "127.0.0.1", "zpl": "^XA^FDTest^FS^XZ" }'
```

You should see the ZPL appear in Terminal 1.

## Network Setup

### Venue Configuration

1. **Print Bridge Host** - A computer running this service
   - Windows, Mac, Linux, or Raspberry Pi
   - Must be on the same network as the printers
   - Static IP recommended (e.g., 192.168.1.100)

2. **Zebra Printers** - Connected via Ethernet or WiFi
   - Configure each printer with a static IP
   - Default ZPL port is 9100
   - Find printer IP from: Settings → Network → IP Address

3. **Staff Devices** - Running the Events web app
   - Must be able to reach the Print Bridge host

### Example Network

```
Venue Network (192.168.1.0/24)
├── Print Bridge (192.168.1.100:3100)
├── Zebra Printer 1 (192.168.1.50:9100)
├── Zebra Printer 2 (192.168.1.51:9100)
└── Staff iPads/Laptops (DHCP)
```

### Find Your Local IP

**Mac:**
```bash
ipconfig getifaddr en0
```

**Windows:**
```cmd
ipconfig | findstr IPv4
```

**Linux:**
```bash
hostname -I
```

### Configure Events App

1. Go to **Printers** page in Events admin
2. Enter Print Bridge URL: `http://YOUR_LOCAL_IP:3100`
3. Click **Save** and verify connection status shows green
4. Add printers with their IP addresses
5. Test print from each printer

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "Connection refused" | Printer off or wrong IP | Verify printer is on and IP is correct |
| "Host unreachable" | Network routing issue | Check printer is on same network |
| "Connection timed out" | Printer not responding | Power cycle printer, check cables |
| Bridge not reachable | Firewall blocking port 3100 | Allow incoming connections on port 3100 |

### Test Direct Connection

```bash
# Ping the printer
ping 192.168.1.50

# Test port 9100
nc -zv 192.168.1.50 9100

# Send test label directly
echo '^XA^FO50,50^A0N,50,50^FDTest^FS^XZ' | nc 192.168.1.50 9100
```

## Running as a Background Service

### macOS

```bash
# Keep running after closing terminal
nohup node bridge.js > bridge.log 2>&1 &
```

### Windows

Use Task Scheduler to start `node bridge.js` at login.

### Linux

```bash
# Using systemd
sudo nano /etc/systemd/system/print-bridge.service
```

```ini
[Unit]
Description=Print Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/print-bridge
ExecStart=/usr/bin/node bridge.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable print-bridge
sudo systemctl start print-bridge
```

## Security Notes

- No authentication (local network only)
- **Do not expose to the internet**
- Use firewall rules to restrict access
- Consider isolated event network VLAN

## Venue Setup Checklist

- [ ] Laptop connected to venue network
- [ ] Node.js 18+ installed
- [ ] `npm install express cors` completed
- [ ] Bridge running (`node bridge.js`)
- [ ] Local IP address noted
- [ ] Bridge URL configured in Events app
- [ ] Printers added with correct IPs
- [ ] Test print verified from each printer
