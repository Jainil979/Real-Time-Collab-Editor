// client/src/useCollabEditor.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { applyOperation, transform, transformCursor } from './transform';
import { diffToOperations } from './diffUtils';
import { getClientColor } from './utils';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

export function useCollabEditor({ name, active, textareaRef }) {
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Connecting...');
  const [remoteCursors, setRemoteCursors] = useState({});
  const [syncNotice, setSyncNotice] = useState(null);

  const clientId = useRef(generateId());
  const documentRef = useRef('');
  const revisionRef = useRef(0);
  const pendingRef = useRef([]);
  const sentRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeout = useRef(null);
  const retryCountRef = useRef(0);

  // ---------- Network helpers ----------
  const sendOp = useCallback((op) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sentRef.current = op;
      wsRef.current.send(JSON.stringify({
        type: 'operation',
        operation: { ...op, clientId: clientId.current },
        revision: revisionRef.current,
      }));
    } else {
      // Socket not open – re-queue the operation at the front
      pendingRef.current.unshift(op);
      sentRef.current = null;
    }
  }, []);

  const sendCursor = useCallback((position) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cursor', position }));
    }
  }, []);

  // ---------- Transform pair helper ----------
  const transformPair = useCallback((remoteOp, localOp) => {
    const newRemoteArr = transform(localOp, remoteOp);   // array
    const newLocalArr = transform(remoteOp, localOp);     // array
    return [newRemoteArr, newLocalArr];
  }, []);

  // ---------- Apply a remote operation ----------
  const applyRemoteOp = useCallback((remoteOp, serverRev) => {
    let ops = [remoteOp];

    // Transform against the in‑flight sent operation (if any)
    if (sentRef.current) {
      const newOps = [];
      for (const op of ops) {
        const [newRemoteArr, newSentArr] = transformPair(op, sentRef.current);
        newOps.push(...newRemoteArr);
        sentRef.current = newSentArr.length > 0 ? newSentArr[0] : null;
      }
      ops = newOps;
    }

    // Transform against pending operations
    const newPending = [];
    for (const pending of pendingRef.current) {
      const newOps = [];
      for (const op of ops) {
        const [newRemoteArr, newPendArr] = transformPair(op, pending);
        newOps.push(...newRemoteArr);
        newPending.push(...newPendArr);
      }
      ops = newOps;
    }
    pendingRef.current = newPending.filter(p => p !== null);

    // Apply all resulting operations to the document
    for (const op of ops) {
      if (op) {
        documentRef.current = applyOperation(documentRef.current, op);
        setText(documentRef.current);
      }
    }
    revisionRef.current = serverRev;

    // Transform remote cursor positions
    setRemoteCursors(prev => {
      const updated = {};
      for (const [cid, data] of Object.entries(prev)) {
        if (data.position != null) {
          let pos = data.position;
          for (const op of ops) {
            if (op) pos = transformCursor(pos, op);
          }
          updated[cid] = { ...data, position: pos };
        } else {
          updated[cid] = data;
        }
      }
      return updated;
    });
  }, [transformPair]);

  const sendNextPending = useCallback(() => {
    if (pendingRef.current.length > 0) {
      const nextOp = pendingRef.current.shift();
      sendOp(nextOp);
    }
  }, [sendOp]);

  // ---------- WebSocket connection ----------
  const connect = useCallback(() => {
    if (!active) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('Connecting...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus('Connected');
      retryCountRef.current = 0;
      ws.send(JSON.stringify({ type: 'join', name }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'sync': {
          documentRef.current = msg.document;
          revisionRef.current = msg.revision;
          pendingRef.current = [];
          sentRef.current = null;
          setText(msg.document);
          // Show "Synced" for 2 seconds
          setSyncNotice('Synced');
          setTimeout(() => setSyncNotice(null), 2000);
          break;
        }
        case 'ack': {
          sentRef.current = null;
          revisionRef.current = msg.revision;
          sendNextPending();
          break;
        }
        case 'operation': {
          applyRemoteOp(msg.operation, msg.revision);
          break;
        }
        case 'join': {
          const { clientId: remoteId, name: remoteName } = msg;
          if (remoteId === clientId.current) return;
          setRemoteCursors(prev => ({
            ...prev,
            [remoteId]: { name: remoteName, color: getClientColor(remoteId), position: undefined },
          }));
          break;
        }
        case 'presence': {
          const { users } = msg;
          setRemoteCursors(prev => {
            const next = { ...prev };
            for (const user of users) {
              if (user.clientId !== clientId.current) {
                next[user.clientId] = { name: user.name, color: getClientColor(user.clientId), position: undefined };
              }
            }
            return next;
          });
          break;
        }
        case 'cursor': {
          const { clientId: remoteId, position, name: remoteName } = msg;
          if (remoteId === clientId.current) return;
          setRemoteCursors(prev => ({
            ...prev,
            [remoteId]: { position, name: remoteName, color: getClientColor(remoteId) },
          }));
          break;
        }
        case 'leave': {
          const { clientId: leftId } = msg;
          setRemoteCursors(prev => {
            const next = { ...prev };
            delete next[leftId];
            return next;
          });
          break;
        }
        default: break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      setRemoteCursors({});
      retryCountRef.current += 1;
      if (retryCountRef.current > MAX_RETRIES) {
        setStatus('Connection lost. Please refresh the page.');
        return;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
      setStatus(`Disconnected. Retrying in ${Math.round(delay / 1000)}s…`);
      reconnectTimeout.current = setTimeout(connect, delay);
    };

    ws.onerror = () => { ws.close(); };
  }, [active, name, applyRemoteOp, sendNextPending]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ---------- Local cursor updates ----------
  useEffect(() => {
    if (!active || !connected) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handler = () => {
      if (document.activeElement !== textarea) return;
      const pos = textarea.selectionStart;
      if (pos !== null) sendCursor(pos);
    };

    document.addEventListener('selectionchange', handler);
    window.addEventListener('keyup', handler);
    window.addEventListener('mouseup', handler);
    window.addEventListener('click', handler);
    return () => {
      document.removeEventListener('selectionchange', handler);
      window.removeEventListener('keyup', handler);
      window.removeEventListener('mouseup', handler);
      window.removeEventListener('click', handler);
    };
  }, [active, connected, textareaRef, sendCursor]);

  // ---------- Local text change ----------
  const onChange = useCallback((newText) => {
    const oldText = documentRef.current;
    if (newText === oldText) return;

    const ops = diffToOperations(oldText, newText, clientId.current);
    let localDoc = oldText;
    for (const op of ops) {
      localDoc = applyOperation(localDoc, op);
    }
    documentRef.current = localDoc;
    setText(localDoc);

    for (const op of ops) {
      if (sentRef.current === null) {
        sendOp(op);
      } else {
        pendingRef.current.push(op);
      }
    }
  }, [sendOp]);

  return { text, connected, status, syncNotice, onChange, remoteCursors };
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}