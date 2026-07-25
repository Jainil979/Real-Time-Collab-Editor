// server/index.js
const WebSocket = require('ws');
const OTServer = require('./otServer');

const PORT = 3001;
const wss = new WebSocket.Server({ port: PORT });
const otServer = new OTServer();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substr(2, 9);
  console.log(`Client connected: ${clientId}`);

  otServer.addClient(clientId, ws);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      otServer.setClientName(clientId, msg.name);
      // Tell all other clients about the new user
      otServer.broadcastJoin(clientId, msg.name);
      // Send the new client the list of existing users
      otServer.sendPresenceTo(clientId);
    }
    else if (msg.type === 'operation') {
      const { operation, revision } = msg;
      operation.clientId = operation.clientId || clientId;
      otServer.handleOperation(clientId, operation, revision);
    }
    else if (msg.type === 'cursor') {
      otServer.broadcastCursor(clientId, msg.position);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    otServer.removeClient(clientId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error (${clientId}):`, err.message);
  });
});

console.log(`OT WebSocket server running on ws://localhost:${PORT}`);