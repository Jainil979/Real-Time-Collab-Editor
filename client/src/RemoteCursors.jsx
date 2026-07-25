import { useState, useLayoutEffect } from 'react';
import getCaretCoordinates from 'textarea-caret';

export default function RemoteCursors({ textareaElement, text, cursors }) {
  const [caretData, setCaretData] = useState([]);

  useLayoutEffect(() => {
    if (!textareaElement) return;

    const cursorEntries = Object.entries(cursors);
    if (cursorEntries.length === 0) {
      setCaretData([]);
      return;
    }

    const newData = [];
    for (const [clientId, data] of cursorEntries) {
      try {
        const coords = getCaretCoordinates(textareaElement, data.position);
        newData.push({
          clientId,
          name: data.name,
          color: data.color,
          top: coords.top - textareaElement.scrollTop,
          left: coords.left - textareaElement.scrollLeft,
          height: coords.height,
        });
      } catch (e) {
        // invalid position, ignore
      }
    }
    setCaretData(newData);
  }, [textareaElement, text, cursors]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'visible'
        // overflow: 'hidden',
      }}
    >
      {caretData.map((c) => (
        <div key={c.clientId} style={{ position: 'absolute', top: c.top, left: c.left }}>
          {/* The blinking caret */}
          <div
            className="remote-cursor"
            style={{
              position: 'absolute',
              top: 0,
              width: 2,
              height: c.height,
              backgroundColor: c.color,
            }}
          />
          {/* Name label */}
          <div
            style={{
              position: 'absolute',
              top: -18,
              left: 0,
              backgroundColor: c.color,
              color: 'white',
              fontSize: 11,
              padding: '1px 4px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              lineHeight: '14px',
              fontWeight: 500,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transform: 'translateX(-50%)',
              marginLeft: 1,
            }}
          >
            {c.name}
          </div>
        </div>
      ))}
    </div>
  );
}