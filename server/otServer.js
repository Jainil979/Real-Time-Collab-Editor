// server/otServer.js
const { applyOperation, transform } = require('./transform');

const MAX_HISTORY = 200;            // keep at most 200 recent operations

class OTServer {
  constructor() {
    this.document = '';
    this.revision = 0;
    this.operationHistory = [];
    this.clients = new Map();         // clientId -> WebSocket
    this.clientNames = new Map();     // clientId -> name
  }

  addClient(clientId, socket) {
    this.clients.set(clientId, socket);
    // Send full document snapshot to the new client
    socket.send(JSON.stringify({
      type: 'sync',
      document: this.document,
      revision: this.revision,
    }));
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    this.clientNames.delete(clientId);
    this.broadcastLeave(clientId);
  }

  setClientName(clientId, name) {
    this.clientNames.set(clientId, name);
  }

  /**
   * Send a full sync (document + revision) to a specific client.
   * Used when a client is too far behind to be incrementally transformed.
   */
  sendSyncTo(clientId) {
    const socket = this.clients.get(clientId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'sync',
        document: this.document,
        revision: this.revision,
      }));
    }
  }

  handleOperation(clientId, operation, clientRevision) {
    // The oldest revision still present in our window.
    const minRevision = this.revision - this.operationHistory.length;

    // If the client is behind our oldest stored operation, we can't transform.
    // Send a full sync and ignore the operation.
    if (clientRevision < minRevision) {
      this.sendSyncTo(clientId);
      return;
    }

    // Start with the incoming op as an array of one.
    let pending = [operation];

    // Transform against each historical operation since the client's revision.
    for (let i = clientRevision - minRevision; i < this.operationHistory.length; i++) {
      const historicalOp = this.operationHistory[i];
      const newPending = [];
      for (const op of pending) {
        const transformed = transform(historicalOp, op);
        // transformed is an array; add all its elements
        newPending.push(...transformed);
      }
      pending = newPending;
    }

    // Apply each resulting operation, record, ack, and broadcast.
    for (const op of pending) {
      this.document = applyOperation(this.document, op);
      this.operationHistory.push(op);
      this.revision++;

      // Trim the history if it exceeds the maximum size
      while (this.operationHistory.length > MAX_HISTORY) {
        this.operationHistory.shift();
      }

      this._acknowledge(clientId, this.revision);
      this._broadcastOperation(clientId, op, this.revision);
    }
  }

  // ------- Presence / Cursor / Leave (unchanged) -------
  broadcastJoin(clientId, name) {
    this.clients.forEach((socket, otherId) => {
      if (otherId !== clientId && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'join', clientId, name }));
      }
    });
  }

  sendPresenceTo(clientId) {
    const socket = this.clients.get(clientId);
    if (!socket || socket.readyState !== 1) return;
    const others = [];
    for (const [id, name] of this.clientNames.entries()) {
      if (id !== clientId) others.push({ clientId: id, name });
    }
    socket.send(JSON.stringify({ type: 'presence', users: others }));
  }

  broadcastCursor(senderClientId, position) {
    const name = this.clientNames.get(senderClientId) || 'Unknown';
    this.clients.forEach((socket, clientId) => {
      if (clientId !== senderClientId && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'cursor',
          clientId: senderClientId,
          position,
          name,
        }));
      }
    });
  }

  broadcastLeave(clientId) {
    this.clients.forEach((socket, otherId) => {
      if (otherId !== clientId && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'leave', clientId }));
      }
    });
  }

  _acknowledge(clientId, revision) {
    const socket = this.clients.get(clientId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'ack', revision }));
    }
  }

  _broadcastOperation(excludeClientId, operation, revision) {
    this.clients.forEach((socket, clientId) => {
      if (clientId !== excludeClientId && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'operation',
          operation,
          revision,
        }));
      }
    });
  }
}

module.exports = OTServer;