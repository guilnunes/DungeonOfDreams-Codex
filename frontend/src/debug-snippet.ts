export const overlaySnippet = `// Generic room inspector · dependency-free diagnostic overlay
// Call update(currentRoom, floorId, debugEnabled) on player movement.
// A room is { id, primaryChallenge, secondaryChallenges }.
export function createRoomChallengeDebugLabel(durationMs = 2000) {
  let previousKey = null;
  let timer;
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed', top: '24px', left: '50%',
    transform: 'translateX(-50%)', zIndex: '9999',
    pointerEvents: 'none', padding: '12px 18px',
    background: '#172112ee', color: '#d4e7b5',
    border: '1px solid #91ac71', borderRadius: '4px',
    font: '12px monospace', display: 'none'
  });
  document.body.append(el);
  const hide = () => { el.style.display = 'none'; };
  return {
    update(room, floorId, debugEnabled) {
      const key = room ? floorId + ':' + room.id : null;
      if (!debugEnabled || !room) hide();
      if (key !== previousKey && room && debugEnabled) {
        el.textContent = 'DEV / ' + [room.primaryChallenge || 'none',
          ...(room.secondaryChallenges || [])].join(' · ').toUpperCase();
        el.style.display = 'block';
        clearTimeout(timer);
        timer = setTimeout(hide, durationMs);
      }
      previousKey = key;
    },
    reset() { previousKey = null; clearTimeout(timer); hide(); },
    dispose() { clearTimeout(timer); el.remove(); }
  };
}
// Invoke reset() on run load. Invoke dispose() on unmount.
// No combat, movement, or challenge state is modified.\n`;
