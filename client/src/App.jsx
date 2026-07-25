import { useState, useRef, useEffect } from 'react';
import { useCollabEditor } from './useCollabEditor';
import RemoteCursors from './RemoteCursors';
import UserAvatars from './UserAvatars';
import { validateName } from './validation';
import './App.css';

const STORAGE_KEY = 'collab-editor-name';

export default function App() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  // On mount, check if a name is already saved in sessionStorage (this tab only)
  useEffect(() => {
    const savedName = sessionStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setName(savedName);
      setJoined(true);
    }
  }, []);

  const { text, connected, status, syncNotice, onChange, remoteCursors } = useCollabEditor({
    name,
    active: joined,
    textareaRef,
  });

  const handleJoin = () => {
    const trimmed = name.trim();
    const errorMsg = validateName(trimmed);
    if (errorMsg) {
      setError(errorMsg);
      return;
    }
    setError('');
    setName(trimmed);
    // Persist the valid name for the current tab only
    sessionStorage.setItem(STORAGE_KEY, trimmed);
    setJoined(true);
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-card">
          <h2>✏️ Join Editor</h2>
          <p>Enter your name to start collaborating</p>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            style={{ borderColor: error ? '#e74c3c' : undefined }}
          />
          {error && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 6 }}>{error}</div>}
          <button className="join-btn" onClick={handleJoin}>
            Join Document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-wrapper">
      <div className="editor-card">
        <div className="editor-header">
          <h1>📄 {name}'s Editor</h1>
          {connected && <UserAvatars remoteCursors={remoteCursors} />}
        </div>
        <div className={`status-bar ${connected ? 'connected' : 'disconnected'}`}>
          <span className={`status-dot ${connected ? 'green' : 'red'}`}></span>
          {status}
          {syncNotice && <span className="sync-notice">● {syncNotice}</span>}
        </div>
        <div style={{ position: 'relative', width: '100%' }}>
          <textarea
            ref={textareaRef}
            id="collab-textarea"
            className="editor-textarea"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Start typing..."
            disabled={!connected}
          />
          {connected && (
            <RemoteCursors
              textareaElement={textareaRef.current}
              text={text}
              cursors={remoteCursors}
            />
          )}
        </div>
        <div className="editor-footer">
          Open in multiple tabs or browsers to collaborate in real time.
        </div>
      </div>
    </div>
  );
}