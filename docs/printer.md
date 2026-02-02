# Printer Setup & Configuration

This document describes the badge printing system for Unicity Events.

## Architecture Overview

The printing system uses a **three-tier architecture**:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Events App     │ ──── │  Print Bridge   │ ──── │  Zebra Printer  │
│  (Cloud)        │ HTTP │  (Local Network)│ TCP  │  (Network)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

1. **Events App** (this application) - Manages printer configuration and print jobs
2. **Print Bridge** - Local service that receives print requests and sends ZPL to printers
3. **Zebra Printer** - Network-connected label printer (ZPL compatible)

## Why a Print Bridge?

Web browsers cannot directly communicate with network printers (TCP port 9100). The Print Bridge is a lightweight local service that:
- Accepts HTTP requests from the Events app
- Sends ZPL commands to Zebra printers over TCP
- Provides health checks and test print functionality

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Printer Database | ✅ Complete | Printers stored per event with IP, port, location |
| Print Logs | ✅ Complete | Full print job tracking with status and retry count |
| Printers Page UI | ✅ Complete | Add/edit/delete printers, test print, bridge config |
| Check-In Page Print | ✅ Complete | Print button with printer selection |
| Record Print Endpoint | ✅ Complete | `POST /api/registrations/:id/record-print` |
| Print Bridge | ⏳ Not Yet Built | Needs separate Node.js service |

## Database Schema

### Printers Table
```sql
printers (
  id            VARCHAR PRIMARY KEY,
  event_id      VARCHAR REFERENCES events(id),
  name          TEXT NOT NULL,
  location      TEXT,
  ip_address    TEXT NOT NULL,
  port          INTEGER DEFAULT 9100,
  status        TEXT DEFAULT 'unknown',
  last_seen_at  TIMESTAMP,
  capabilities  JSONB,
  created_at    TIMESTAMP,
  last_modified TIMESTAMP
)
```

### Print Logs Table
```sql
print_logs (
  id              VARCHAR PRIMARY KEY,
  registration_id VARCHAR REFERENCES registrations(id),
  guest_id        VARCHAR REFERENCES guests(id),
  printer_id      VARCHAR REFERENCES printers(id),
  status          TEXT DEFAULT 'pending',  -- pending, sent, success, failed
  zpl_snapshot    TEXT,
  requested_by    VARCHAR REFERENCES users(id),
  requested_at    TIMESTAMP,
  sent_at         TIMESTAMP,
  completed_at    TIMESTAMP,
  error_message   TEXT,
  retry_count     INTEGER DEFAULT 0
)
```

### Badge Print Count (on Registrations)
```sql
registrations.badge_print_count  INTEGER DEFAULT 0
```

## API Endpoints

### Printers CRUD
- `GET /api/events/:eventId/printers` - List printers for event
- `POST /api/events/:eventId/printers` - Add printer to event
- `PATCH /api/printers/:id` - Update printer
- `DELETE /api/printers/:id` - Delete printer

### Print Operations
- `POST /api/registrations/:registrationId/record-print` - Record successful print
  - Body: `{ printerId: string }`
  - Creates print log, updates badge_print_count

## Print Bridge Configuration

The Print Bridge URL is stored in the browser's localStorage:

```javascript
localStorage.getItem("print-bridge-url")  // e.g., "http://192.168.1.100:3100"
```

Users configure this on the **Printers** page in the admin UI.

### Bridge API (Expected Endpoints)

The Print Bridge should implement:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Returns 200 if bridge is running |
| `/print` | POST | Send badge to printer |
| `/printers/:id/test` | POST | Send test label to printer |

#### POST /print Request Format
```json
{
  "printer": {
    "ipAddress": "192.168.1.50",
    "port": 9100
  },
  "badge": {
    "firstName": "John",
    "lastName": "Doe",
    "unicityId": "12345678",
    "registrationId": "uuid-here"
  }
}
```

#### POST /print Response
```json
{
  "success": true,
  "message": "Print job sent"
}
```

## Print Flow (Check-In Page)

1. Staff clicks **Print** button next to attendee
2. Frontend calls `fetch(${bridgeUrl}/print, { ... })` with badge data
3. Print Bridge sends ZPL to Zebra printer
4. On success, frontend calls `POST /api/registrations/:id/record-print`
5. Backend creates print log entry with status "success"
6. Backend increments `badge_print_count` on registration

## Next Steps to Complete Printing

### 1. Build the Print Bridge Service

A simple Node.js service running on the local network:

```javascript
// Example: print-bridge/index.js
const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/print', async (req, res) => {
  const { printer, badge } = req.body;
  
  const zpl = generateZPL(badge);  // Generate ZPL from badge data
  
  try {
    await sendToPrinter(printer.ipAddress, printer.port, zpl);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function sendToPrinter(ip, port, zpl) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(port, ip, () => {
      client.write(zpl);
      client.end();
      resolve();
    });
    client.on('error', reject);
  });
}

function generateZPL(badge) {
  // Basic 4x3 badge label
  return `^XA
^FO50,50^A0N,60,60^FD${badge.firstName}^FS
^FO50,120^A0N,60,60^FD${badge.lastName}^FS
^FO50,200^A0N,30,30^FDID: ${badge.unicityId}^FS
^XZ`;
}

app.listen(3100, () => {
  console.log('Print Bridge running on port 3100');
});
```

### 2. Deploy Print Bridge

Options:
- Run on event staff laptops
- Run on dedicated mini-PC at venue
- Run on Raspberry Pi connected to venue network

### 3. Configure Zebra Printers

1. Connect printers to venue WiFi or Ethernet
2. Note each printer's IP address (from printer settings menu)
3. Add printers in Events app under **Printers** page
4. Test print to verify connectivity

### Recommended Zebra Models

- **ZD421** - Desktop, 4" wide labels
- **ZD621** - Desktop, higher volume
- **ZT411** - Industrial, very high volume

## Troubleshooting

### "Print bridge not configured"
- Go to Printers page
- Enter the Print Bridge URL (e.g., `http://192.168.1.100:3100`)
- Click Save and verify connection status shows green

### "Unexpected token '<'" error
- Print Bridge is returning HTML instead of JSON
- Check if Bridge URL is correct
- Verify Print Bridge service is running

### Print job not reaching printer
1. Verify printer IP is correct
2. Check printer is on same network as Print Bridge
3. Try test print from Printers page
4. Check printer is online and has media loaded

## Badge Design

Currently using basic ZPL. Future enhancements:
- [ ] Custom ZPL templates per event
- [ ] QR code on badge
- [ ] Company logo
- [ ] Multiple badge sizes
