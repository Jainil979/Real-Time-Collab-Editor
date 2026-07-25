// transform.js (shared – use in both server and client)

export function applyOperation(document, op) {
  if (op.type === 'insert') {
    return document.slice(0, op.position) + op.text + document.slice(op.position);
  }
  if (op.type === 'delete') {
    return document.slice(0, op.position) + document.slice(op.position + op.length);
  }
  return document;
}

/**
 * Transform op2 against op1 (op1 already applied).
 * Returns an array of operations – empty, one, or two.
 */
export function transform(op1, op2) {
  if (op1.type === 'insert' && op2.type === 'insert') {
    return transformInsertInsert(op1, op2);
  }
  if (op1.type === 'insert' && op2.type === 'delete') {
    return transformInsertDelete(op1, op2);
  }
  if (op1.type === 'delete' && op2.type === 'insert') {
    return transformDeleteInsert(op1, op2);
  }
  if (op1.type === 'delete' && op2.type === 'delete') {
    return transformDeleteDelete(op1, op2);
  }
  throw new Error(`Unknown combination: ${op1.type} vs ${op2.type}`);
}

// ----------------------------------------------------------------------
// Insert vs Insert (unchanged)
// ----------------------------------------------------------------------
function transformInsertInsert(op1, op2) {
  if (op1.position < op2.position) {
    return [{ ...op2, position: op2.position + op1.text.length }];
  }
  if (op1.position > op2.position) {
    return [op2];
  }
  // Same position – tie-break by clientId
  if (op1.clientId < op2.clientId) {
    return [{ ...op2, position: op2.position + op1.text.length }];
  }
  return [op2];
}

// ----------------------------------------------------------------------
// Insert vs Delete (FIXED)
// ----------------------------------------------------------------------
function transformInsertDelete(insertOp, deleteOp) {
  // Empty insert is a no‑op → delete unchanged
  if (insertOp.text.length === 0) {
    return [deleteOp];
  }

  const delStart = deleteOp.position;
  const delEnd = delStart + deleteOp.length;
  const insPos = insertOp.position;
  const insLen = insertOp.text.length;

  // Insert after the delete range → delete unchanged
  if (insPos >= delEnd) {
    return [deleteOp];
  }

  // Insert before or at the start → shift delete right
  if (insPos <= delStart) {
    return [{ ...deleteOp, position: delStart + insLen }];
  }

  // Insert inside the delete range → split the delete
  const firstLen = insPos - delStart;          // part before the insert
  const secondStart = insPos + insLen;         // start of part after insert (absolute, before adjustment)
  const secondLen = delEnd - insPos;           // length of part after insert

  const result = [];
  if (firstLen > 0) {
    result.push({ ...deleteOp, position: delStart, length: firstLen });
  }
  if (secondLen > 0) {
    result.push({ ...deleteOp, position: secondStart, length: secondLen });
  }

  // If we have two parts, the second part must be adjusted because the first
  // part will already have been applied and removed some characters.
  if (result.length === 2) {
    // Transform the second part against the first part
    const adjustedSecond = transform(result[0], result[1])[0];
    result[1] = adjustedSecond;
  }

  return result;
}

// ----------------------------------------------------------------------
// Delete vs Insert (unchanged)
// ----------------------------------------------------------------------
function transformDeleteInsert(deleteOp, insertOp) {
  const delStart = deleteOp.position;
  const delEnd = delStart + deleteOp.length;
  const insPos = insertOp.position;

  if (insPos <= delStart) {
    return [insertOp];
  }
  if (insPos >= delEnd) {
    return [{ ...insertOp, position: insPos - deleteOp.length }];
  }
  // Insert inside delete → place at start of delete
  return [{ ...insertOp, position: delStart }];
}

// ----------------------------------------------------------------------
// Delete vs Delete (unchanged)
// ----------------------------------------------------------------------
function transformDeleteDelete(op1, op2) {
  const op1End = op1.position + op1.length;
  const op2End = op2.position + op2.length;

  if (op1End <= op2.position) {
    return [{ ...op2, position: op2.position - op1.length }];
  }
  if (op1.position >= op2End) {
    return [op2];
  }
  if (op1.position <= op2.position && op1End >= op2End) {
    return [];   // op2 becomes no‑op
  }
  if (op2.position <= op1.position && op2End >= op1End) {
    return [{ ...op2, length: op2.length - op1.length }];
  }
  if (op1.position < op2.position) {
    const overlap = op1End - op2.position;
    return [{ ...op2, position: op1.position, length: op2.length - overlap }];
  }
  const overlap = op2End - op1.position;
  return [{ ...op2, length: op2.length - overlap }];
}

// ----------------------------------------------------------------------
// Cursor transformation (unchanged)
// ----------------------------------------------------------------------
export function transformCursor(position, op) {
  if (op.type === 'insert') {
    if (op.position <= position) return position + op.text.length;
    return position;
  }
  if (op.type === 'delete') {
    const deleteEnd = op.position + op.length;
    if (position <= op.position) return position;
    if (position >= deleteEnd) return position - op.length;
    return op.position;
  }
  return position;
}