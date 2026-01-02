# Print Bridge Service

Local HTTP-to-ZPL bridge service for Zebra badge printing. Runs on a venue laptop and accepts print requests from the Events app, rendering ZPL and sending it directly to Zebra printers over TCP port 9100.

## Architecture

```
┌─────────────┐     HTTPS      ┌────────────────────┐
│   iPad      │ ──────────────▶│  events.unicity.com │
│ (Check-in)  │                │   (Cloud App)       │
└─────────────┘                └────────────────────┘
       │                                 
       │ HTTP (local network)            
       ▼                                 
┌─────────────────────────────────────────────────────┐
│              Print Bridge (this service)            │
│              Venue Laptop - Port 3100               │
└─────────────────────────────────────────────────────┘
       │                                 
       │ TCP Port 9100 (ZPL raw)         
       ▼                                 
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Zebra 1   │  │   Zebra 2   │  │   Zebra 3   │
│  (VIP Desk) │  │ (General 1) │  │ (General 2) │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Requirements

- **Node.js 18+** (LTS recommended)
- **Network access** to Zebra printers on port 9100
- **Same network** as iPads and printers

## Quick Start (Mac)

### 1. Install Node.js

If you don't have Node.js installed:

```bash
# Using Homebrew (recommended)
brew install node@20

# Or download from https://nodejs.org/
```

Verify installation:

```bash
node --version  # Should show v18+ or v20+
npm --version   # Should show 9+
```

### 2. Setup the Print Bridge

```bash
# Navigate to the print-bridge directory
cd print-bridge

# Install dependencies
npm install

# Copy environment config
cp .env.example .env
```

### 3. Configure Environment

Edit `.env` with your settings:

```env
PORT=3100
ALLOWED_ORIGINS=https://events.unicity.com,http://localhost:5000
PRINTER_TIMEOUT_MS=5000
MAX_RETRIES=3
LOG_LEVEL=info
```

### 4. Start the Service

```bash
# Development mode (auto-reload on changes)
npm run dev

# Or production mode
npm run build
npm start
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║                    PRINT BRIDGE SERVICE                    ║
╠════════════════════════════════════════════════════════════╣
║  Version: 1.0.0                                            ║
║  Port: 3100                                                ║
║  Status: Running                                           ║
╚════════════════════════════════════════════════════════════╝
```

### 5. Get Your Local IP

Find your Mac's local IP address:

```bash
# Show local network IP
ipconfig getifaddr en0

# Or for all interfaces
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Example output: `192.168.1.50`

Your bridge URL will be: `http://192.168.1.50:3100`

## API Reference

### Health Check

```bash
GET /health

# Response
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "printers": 2
}
```

### Register a Printer

```bash
POST /printers
Content-Type: application/json

{
  "name": "VIP Check-in",
  "ipAddress": "192.168.1.101",
  "port": 9100
}

# Response
{
  "id": "printer-a1b2c3d4",
  "name": "VIP Check-in",
  "ipAddress": "192.168.1.101",
  "port": 9100,
  "status": "unknown"
}
```

### List Printers

```bash
GET /printers

# Response (checks connectivity to each)
[
  {
    "id": "printer-a1b2c3d4",
    "name": "VIP Check-in",
    "ipAddress": "192.168.1.101",
    "port": 9100,
    "status": "online",
    "lastSeen": "2026-01-02T15:30:00Z"
  }
]
```

### Print a Badge

```bash
POST /print
Content-Type: application/json

{
  "printerId": "printer-a1b2c3d4",
  "badge": {
    "firstName": "John",
    "lastName": "Smith",
    "eventName": "Rise 2026",
    "registrationId": "uuid-here",
    "eventId": "event-uuid",
    "unicityId": "12345678",
    "role": "Distributor"
  }
}

# Response
{
  "jobId": "job-uuid",
  "status": "success",
  "sentAt": "2026-01-02T15:30:00Z"
}
```

### Test Print

```bash
POST /printers/printer-a1b2c3d4/test

# Response
{
  "success": true,
  "message": "Test label printed successfully"
}
```

### Get Job Status

```bash
GET /jobs/job-uuid

# Response
{
  "jobId": "job-uuid",
  "status": "success",
  "sentAt": "2026-01-02T15:30:00Z",
  "completedAt": "2026-01-02T15:30:02Z",
  "errorMessage": null
}
```

### Remove a Printer

```bash
DELETE /printers/printer-a1b2c3d4

# Response
{
  "success": true,
  "message": "Printer VIP Check-in removed"
}
```

## Zebra Printer Setup

### Finding Printer IP Address

1. **On the printer**: Print a configuration label (usually by holding a button on the printer)
2. **On the network**: Use a network scanner app or check your router's DHCP client list
3. **Using Zebra Setup Utilities**: Connect via USB first, then view network settings

### Recommended Zebra Models

- **Zebra ZD421** (4" desktop)
- **Zebra ZD621** (4" desktop, higher speed)
- **Zebra ZT411** (industrial, high volume)

### Network Configuration

Ensure the printer is configured for:

- **Port 9100** (ZPL raw socket - usually default)
- **Static IP** or **DHCP reservation** (prevents IP changes)
- **Same subnet** as the bridge laptop

### Testing Direct Connection

Test printer connectivity without the bridge:

```bash
# Send a test label directly
echo '^XA^FO50,50^A0N,50,50^FDTest^FS^XZ' | nc 192.168.1.101 9100
```

## Troubleshooting

### Bridge Won't Start

```bash
# Check if port is in use
lsof -i :3100

# Kill existing process
kill -9 $(lsof -t -i :3100)

# Or use a different port in .env
PORT=3101
```

### Can't Connect to Printer

1. **Verify network**: Can you ping the printer?
   ```bash
   ping 192.168.1.101
   ```

2. **Check port 9100**: Is the printer listening?
   ```bash
   nc -zv 192.168.1.101 9100
   ```

3. **Firewall**: Is your Mac firewall blocking outbound connections?
   - System Settings → Network → Firewall → Options → Allow incoming connections

### CORS Errors

If the Events app can't reach the bridge:

1. Verify `ALLOWED_ORIGINS` in `.env` includes your app URL
2. Check that the bridge URL in the app matches your local IP
3. Ensure the laptop's firewall allows incoming connections on port 3100

### Badge Not Printing Correctly

1. **Wrong size**: Check printer is set for 4"x6" labels
2. **Garbled text**: Verify printer DPI is 203 (adjust ZPL if using 300 DPI)
3. **Misaligned**: Calibrate the printer using built-in calibration

## Venue Setup Checklist

- [ ] Laptop connected to venue WiFi
- [ ] Node.js 18+ installed
- [ ] Print Bridge dependencies installed
- [ ] `.env` configured with correct origins
- [ ] Bridge service running
- [ ] Local IP address noted
- [ ] Each Zebra printer registered via API
- [ ] Test print verified from each printer
- [ ] Bridge URL shared with check-in staff
- [ ] Staff trained on fallback procedures

## Security Notes

- The bridge runs on HTTP (not HTTPS) for local network simplicity
- `ALLOWED_ORIGINS` restricts which web apps can make requests
- The bridge stores printer data in memory only (lost on restart)
- No authentication is implemented - rely on network isolation
- Consider using a VPN or dedicated check-in network for added security

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## License

Internal use only - Unicity Events
