#!/usr/bin/env node

const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3100;
const SOCKET_TIMEOUT = 10000; // 10 seconds

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'print-bridge', timestamp: new Date().toISOString() });
});

// Print endpoint - sends ZPL to Zebra printer via TCP
app.post('/print', async (req, res) => {
  const { printerIp, zpl, printer, badge } = req.body;

  // Support both direct format and Events app format
  const ip = printerIp || printer?.ipAddress;
  const port = printer?.port || 9100;
  let zplData = zpl;

  // If badge data provided instead of raw ZPL, generate basic ZPL
  if (!zplData && badge) {
    zplData = generateBadgeZPL(badge);
  }

  // Validate required fields
  if (!ip) {
    return res.status(400).json({ error: 'Missing required field: printerIp or printer.ipAddress' });
  }

  if (!zplData) {
    return res.status(400).json({ error: 'Missing required field: zpl or badge data' });
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }

  console.log(`[${new Date().toISOString()}] Print request: ${ip}:${port}`);

  try {
    await sendToPrinter(ip, port, zplData);
    console.log(`[${new Date().toISOString()}] Print success: ${ip}:${port}`);
    res.json({ success: true, message: 'Print job sent successfully' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Print failed: ${ip}:${port} - ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Test print endpoint for specific printer
app.post('/printers/:id/test', async (req, res) => {
  const { ipAddress, port = 9100 } = req.body;

  if (!ipAddress) {
    return res.status(400).json({ error: 'Missing required field: ipAddress' });
  }

  const testZPL = generateTestLabelZPL();

  console.log(`[${new Date().toISOString()}] Test print: ${ipAddress}:${port}`);

  try {
    await sendToPrinter(ipAddress, port, testZPL);
    console.log(`[${new Date().toISOString()}] Test print success: ${ipAddress}:${port}`);
    res.json({ success: true, message: 'Test label printed successfully' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Test print failed: ${ipAddress}:${port} - ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Send ZPL data to printer via TCP socket
function sendToPrinter(ip, port, zpl) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let resolved = false;

    // Set timeout
    client.setTimeout(SOCKET_TIMEOUT);

    client.connect(port, ip, () => {
      // Send ZPL with newline terminator as raw buffer
      const buffer = Buffer.from(zpl + '\n', 'utf8');
      
      client.write(buffer, (err) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            client.destroy();
            reject(new Error(`Failed to write to printer: ${err.message}`));
          }
        } else {
          // Wait for data to be flushed to the network
          client.once('drain', () => {
            // Give printer time to receive and process data before closing
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                client.end();
                resolve();
              }
            }, 500);
          });
          
          // If write buffer was empty, drain won't fire - use timeout fallback
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              client.end();
              resolve();
            }
          }, 500);
        }
      });
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        if (err.code === 'ECONNREFUSED') {
          reject(new Error(`Printer not responding at ${ip}:${port} - connection refused`));
        } else if (err.code === 'EHOSTUNREACH') {
          reject(new Error(`Printer unreachable at ${ip}:${port} - host unreachable`));
        } else if (err.code === 'ETIMEDOUT') {
          reject(new Error(`Printer connection timed out at ${ip}:${port}`));
        } else {
          reject(new Error(`Printer connection error: ${err.message}`));
        }
      }
    });

    client.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error(`Printer connection timed out at ${ip}:${port}`));
      }
    });

    client.on('close', () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
  });
}

// Generate basic badge ZPL from badge data
function generateBadgeZPL(badge) {
  const firstName = (badge.firstName || '').toUpperCase().substring(0, 20);
  const lastName = (badge.lastName || '').toUpperCase().substring(0, 20);
  const unicityId = badge.unicityId || '';

  // ZPL for 4" x 3" label (standard badge size)
  // Label width: 812 dots at 203 DPI = 4 inches
  // Label height: 609 dots at 203 DPI = 3 inches
  return `^XA
^CI28
^PW812
^LL609
^FO50,80^A0N,80,80^FD${firstName}^FS
^FO50,180^A0N,80,80^FD${lastName}^FS
^FO50,320^A0N,40,40^FDID: ${unicityId}^FS
^FO50,400^GB712,2,2^FS
^FO50,450^A0N,30,30^FDUnicity Events^FS
^XZ`;
}

// Generate test label ZPL
function generateTestLabelZPL() {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return `^XA
^CI28
^PW812
^LL406
^FO50,50^A0N,50,50^FDPRINT BRIDGE TEST^FS
^FO50,120^A0N,30,30^FDConnection successful!^FS
^FO50,180^A0N,25,25^FD${timestamp}^FS
^FO50,250^GB712,2,2^FS
^FO50,280^A0N,25,25^FDUnicity Events - Badge Printing^FS
^XZ`;
}

// Catch-all for undefined routes - always return JSON
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler - always return JSON
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Server error:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              UNICITY EVENTS PRINT BRIDGE                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running on http://0.0.0.0:${PORT}                      ║`);
  console.log('║                                                            ║');
  console.log('║  Endpoints:                                                ║');
  console.log('║    GET  /health           - Health check                   ║');
  console.log('║    POST /print            - Send ZPL to printer            ║');
  console.log('║    POST /printers/:id/test - Send test label               ║');
  console.log('║                                                            ║');
  console.log('║  Configure this URL in Events app Printers page            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});
