// client/src/diffUtils.js
import { diffChars } from 'diff';

/**
 * Generate insert/delete operations that convert oldText into newText.
 * Operations are ordered so that applying them sequentially yields newText.
 */
export function diffToOperations(oldText, newText, clientId) {
  const changes = diffChars(oldText, newText);
  const ops = [];
  let index = 0;

  for (const part of changes) {
    const value = part.value;
    const len = value.length;

    if (part.added && part.removed) {
      // Replacement: delete the old characters then insert the new ones at the same spot.
      ops.push({ type: 'delete', position: index, length: len, clientId });
      ops.push({ type: 'insert', position: index, text: value, clientId });
      // index does not change because delete+insert at same position leaves the following text unchanged.
    } else if (part.added) {
      ops.push({ type: 'insert', position: index, text: value, clientId });
      index += len;
    } else if (part.removed) {
      ops.push({ type: 'delete', position: index, length: len, clientId });
      // index stays because characters are removed
    } else {
      // unchanged text – advance index
      index += len;
    }
  }

  return ops;
}