// client/src/UserAvatars.jsx
export default function UserAvatars({ remoteCursors }) {
  const users = Object.entries(remoteCursors).map(([clientId, data]) => ({
    clientId,
    name: data.name || '?',
    color: data.color || '#888',
  }));

  if (users.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {users.map((user) => {
        const initial = user.name.charAt(0).toUpperCase();
        return (
          <div
            key={user.clientId}
            title={user.name}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${user.color}, ${adjustColor(user.color, -30)})`,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              border: '2px solid white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s',
              cursor: 'default',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {initial}
          </div>
        );
      })}
    </div>
  );
}

// Helper to darken/lighten a HSL color (simple)
function adjustColor(hsl, amount) {
  // hsl string like "hsl(120, 70%, 50%)"
  const parts = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!parts) return hsl;
  let lightness = parseInt(parts[3], 10) + amount;
  lightness = Math.max(0, Math.min(100, lightness));
  return `hsl(${parts[1]}, ${parts[2]}%, ${lightness}%)`;
}