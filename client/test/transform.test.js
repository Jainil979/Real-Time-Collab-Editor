// client/tests/transform.test.js
import { describe, it, expect } from 'vitest';
import { applyOperation, transform, transformCursor } from '../src/transform';

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
const ins = (pos, text, clientId = 'a') => ({
  type: 'insert',
  position: pos,
  text,
  clientId,
});

const del = (pos, length, clientId = 'b') => ({
  type: 'delete',
  position: pos,
  length,
  clientId,
});

function applyAll(doc, ops) {
  let d = doc;
  for (const op of ops) {
    if (op) d = applyOperation(d, op);
  }
  return d;
}

function testTP1(initial, op1, op2) {
  const t1 = transform(op1, op2); // array
  const t2 = transform(op2, op1); // array
  const path1 = applyAll(applyAll(initial, [op1]), t1);
  const path2 = applyAll(applyAll(initial, [op2]), t2);
  expect(path1).toEqual(path2);
}

// ----------------------------------------------------------------------
// 1. applyOperation basics
// ----------------------------------------------------------------------
describe('applyOperation', () => {
  it('insert at beginning', () => {
    expect(applyOperation('world', ins(0, 'Hello '))).toBe('Hello world');
  });
  it('insert at end', () => {
    expect(applyOperation('abc', ins(3, 'd'))).toBe('abcd');
  });
  it('insert in middle', () => {
    expect(applyOperation('abc', ins(1, 'X'))).toBe('aXbc');
  });
  it('delete at beginning', () => {
    expect(applyOperation('abcdef', del(0, 3))).toBe('def');
  });
  it('delete at end', () => {
    expect(applyOperation('abcd', del(3, 1))).toBe('abc');
  });
  it('delete in middle', () => {
    expect(applyOperation('abcdef', del(2, 2))).toBe('abef');
  });
  it('delete whole string', () => {
    expect(applyOperation('abc', del(0, 3))).toBe('');
  });
  it('insert empty string is no-op', () => {
    expect(applyOperation('test', ins(0, ''))).toBe('test');
  });
  it('delete zero length is no-op', () => {
    expect(applyOperation('test', del(1, 0))).toBe('test');
  });
});

// ----------------------------------------------------------------------
// 2. transform – Insert vs Insert
// ----------------------------------------------------------------------
describe('transform – Insert vs Insert', () => {
  it('both insert at same position: tie-break by clientId (a < b)', () => {
    const t = transform(ins(0, 'A', 'a'), ins(0, 'B', 'b'));
    expect(t).toEqual([ins(1, 'B', 'b')]);
  });
  it('both insert at same position: tie-break (b < c)', () => {
    const t = transform(ins(0, 'X', 'b'), ins(0, 'Y', 'c'));
    expect(t).toEqual([ins(1, 'Y', 'c')]);
  });
  it('both insert at same position: reversed order', () => {
    const t = transform(ins(0, 'X', 'c'), ins(0, 'Y', 'b'));
    expect(t).toEqual([ins(0, 'Y', 'b')]);
  });
  it('op1 before op2: op2 shifts right', () => {
    const t = transform(ins(0, 'Hi'), ins(5, '!'));
    expect(t).toEqual([ins(7, '!')]);
  });
  it('op1 after op2: op2 unchanged', () => {
    const t = transform(ins(5, '!'), ins(0, 'Hi'));
    expect(t).toEqual([ins(0, 'Hi')]);
  });
  it('op1 at same position but longer (with explicit clientIds)', () => {
    const t = transform(ins(3, 'ABCD', 'a'), ins(3, 'X', 'b'));
    expect(t).toEqual([ins(7, 'X', 'b')]);
  });
  it('multi-char inserts at same position different lengths', () => {
    const t = transform(ins(0, 'Hello', 'a'), ins(0, 'World', 'b'));
    expect(t).toEqual([ins(5, 'World', 'b')]);
  });
  it('inserts adjacent (op1 ends exactly at op2 start)', () => {
    const t = transform(ins(0, 'AB'), ins(2, 'CD'));
    expect(t).toEqual([ins(4, 'CD')]);
  });
  it('inserts with empty text (no-op)', () => {
    const t = transform(ins(0, ''), ins(0, 'X'));
    expect(t).toEqual([ins(0, 'X')]);
  });
});

// ----------------------------------------------------------------------
// 3. transform – Insert vs Delete
// ----------------------------------------------------------------------
describe('transform – Insert vs Delete', () => {
  it('insert before delete: delete shifts right', () => {
    const t = transform(ins(2, 'xx'), del(3, 2));
    expect(t).toEqual([del(5, 2)]);
  });
  it('insert at delete start: delete shifts right', () => {
    const t = transform(ins(3, 'xx'), del(3, 2));
    expect(t).toEqual([del(5, 2)]);
  });
  it('insert after delete range: delete unchanged', () => {
    const t = transform(ins(10, 'yy'), del(0, 3));
    expect(t).toEqual([del(0, 3)]);
  });
  it('insert inside delete range: delete splits into two', () => {
    const t = transform(ins(12, 'X'), del(10, 5));
    // Initial: delete(10,5), insert 'X' at 12 → split into del(10,2) and del(13,3)
    // After adjusting second part against first: del(13,3) → transform(del(10,2), del(13,3)) -> shift left by 2 → del(11,3)
    expect(t).toEqual([
      del(10, 2),
      del(11, 3),
    ]);
  });
  it('insert at beginning of delete range (firstLen=0)', () => {
    const t = transform(ins(10, 'X'), del(10, 5));
    // firstLen = 0, secondLen = 5, secondStart = 11
    expect(t).toEqual([del(11, 5)]);
  });
  it('insert at end of delete range (treated as after)', () => {
    const t = transform(ins(15, 'X'), del(10, 5));
    // insPos >= delEnd → delete unchanged
    expect(t).toEqual([del(10, 5)]);
  });
  it('insert with empty text does nothing', () => {
    const t = transform(ins(1, ''), del(0, 2));
    expect(t).toEqual([del(0, 2)]);
  });
  it('delete with length 0', () => {
    const t = transform(ins(1, 'x'), del(0, 0));
    expect(t).toEqual([del(0, 0)]);
  });
});

// ----------------------------------------------------------------------
// 4. transform – Delete vs Insert
// ----------------------------------------------------------------------
describe('transform – Delete vs Insert', () => {
  it('insert before delete: insert unchanged', () => {
    const t = transform(del(5, 3), ins(2, 'aa'));
    expect(t).toEqual([ins(2, 'aa')]);
  });
  it('insert after delete: insert shifts left by delete length', () => {
    const t = transform(del(0, 3), ins(5, 'bb'));
    expect(t).toEqual([ins(2, 'bb')]);
  });
  it('insert inside delete: insert placed at delete start', () => {
    const t = transform(del(2, 4), ins(3, 'cc'));
    expect(t).toEqual([ins(2, 'cc')]);
  });
  it('insert at delete start: insert moves to delete start (same)', () => {
    const t = transform(del(2, 4), ins(2, 'dd'));
    expect(t).toEqual([ins(2, 'dd')]);
  });
  it('insert at delete end: insert shifts left to start of delete', () => {
    const t = transform(del(2, 4), ins(6, 'ee'));
    expect(t).toEqual([ins(2, 'ee')]);
  });
  it('delete with length 0: insert unchanged', () => {
    const t = transform(del(3, 0), ins(4, 'x'));
    expect(t).toEqual([ins(4, 'x')]);
  });
  it('insert empty text', () => {
    const t = transform(del(0, 3), ins(5, ''));
    // position 5 > 3, so shifts left to 2
    expect(t).toEqual([ins(2, '')]);
  });
});

// ----------------------------------------------------------------------
// 5. transform – Delete vs Delete
// ----------------------------------------------------------------------
describe('transform – Delete vs Delete', () => {
  it('no overlap, op1 before op2: op2 shifts left', () => {
    const t = transform(del(0, 3), del(5, 2));
    expect(t).toEqual([del(2, 2)]);
  });
  it('no overlap, op1 after op2: op2 unchanged', () => {
    const t = transform(del(10, 2), del(0, 3));
    expect(t).toEqual([del(0, 3)]);
  });
  it('adjacent, op1 ends at op2 start', () => {
    const t = transform(del(0, 3), del(3, 2));
    expect(t).toEqual([del(0, 2)]);
  });
  it('adjacent, op2 ends at op1 start', () => {
    const t = transform(del(3, 2), del(0, 3));
    expect(t).toEqual([del(0, 3)]);
  });
  it('op1 completely contains op2: op2 becomes null (empty array)', () => {
    const t = transform(del(2, 6), del(3, 2));
    expect(t).toEqual([]);
  });
  it('op1 contains op2 exactly', () => {
    const t = transform(del(2, 4), del(2, 4));
    expect(t).toEqual([]);
  });
  it('op2 completely contains op1: op2 shrinks', () => {
    const t = transform(del(3, 2), del(1, 6));
    expect(t).toEqual([del(1, 4)]);
  });
  it('partial overlap: op1 starts before op2', () => {
    const t = transform(del(2, 4), del(4, 4));
    expect(t).toEqual([del(2, 2)]);
  });
  it('partial overlap: op2 starts before op1', () => {
    const t = transform(del(4, 4), del(2, 4));
    expect(t).toEqual([del(2, 2)]);
  });
  it('partial overlap with one char', () => {
    const t = transform(del(3, 1), del(2, 2));
    expect(t).toEqual([del(2, 1)]);
  });
  it('delete with length 0 has no effect', () => {
    const t = transform(del(3, 0), del(2, 2));
    expect(t).toEqual([del(2, 2)]);
  });
  it('both deletes with length 0', () => {
    const t = transform(del(1, 0), del(2, 0));
    expect(t).toEqual([del(2, 0)]);
  });
});

// ----------------------------------------------------------------------
// 6. transformCursor
// ----------------------------------------------------------------------
describe('transformCursor', () => {
  it('cursor before insert: unchanged', () => {
    expect(transformCursor(2, ins(5, 'x'))).toBe(2);
  });
  it('cursor at insert position: shifts right', () => {
    expect(transformCursor(5, ins(5, 'abc'))).toBe(8);
  });
  it('cursor after insert: shifts right', () => {
    expect(transformCursor(7, ins(5, 'x'))).toBe(8);
  });
  it('cursor at 0 with insert at 0', () => {
    expect(transformCursor(0, ins(0, 'Hi'))).toBe(2);
  });
  it('cursor before delete: unchanged', () => {
    expect(transformCursor(2, del(5, 3))).toBe(2);
  });
  it('cursor at delete start: unchanged', () => {
    expect(transformCursor(5, del(5, 3))).toBe(5);
  });
  it('cursor inside delete: placed at start of delete', () => {
    expect(transformCursor(6, del(5, 3))).toBe(5);
  });
  it('cursor at delete end: stays at start of delete', () => {
    expect(transformCursor(8, del(5, 3))).toBe(5);
  });
  it('cursor after delete: shifts left', () => {
    expect(transformCursor(10, del(5, 3))).toBe(7);
  });
  it('cursor at end of document after delete', () => {
    expect(transformCursor(9, del(5, 3))).toBe(6);
  });
  it('chain: insert then delete on cursor', () => {
    const pos = transformCursor(5, ins(5, 'abc')); // 8
    const final = transformCursor(pos, del(3, 2)); // 8-2=6
    expect(final).toBe(6);
  });
});

// ----------------------------------------------------------------------
// 7. Convergence – TP1
// ----------------------------------------------------------------------
describe('Convergence – TP1 property', () => {
  it('two inserts at same position', () => testTP1('Hello', ins(5, '!', 'a'), ins(5, ' World', 'b')));
  it('insert and delete at same start', () => testTP1('abcde', ins(2, 'X'), del(2, 3)));
  it('two overlapping deletes', () => testTP1('abcdefgh', del(2, 4), del(3, 3)));
  it('insert before delete', () => testTP1('abc', ins(0, '123'), del(1, 2)));
  it('delete then insert far apart', () => testTP1('document', del(0, 4), ins(4, 'X')));
  it('multi-char insert and delete at edge', () => testTP1('end', ins(3, '!'), del(0, 3)));
  it('empty document', () => testTP1('', ins(0, 'A', 'a'), ins(0, 'B', 'b')));
  it('insert at same position, tie-break different', () => testTP1('', ins(0, 'ABCD', 'x'), ins(0, '123', 'y')));
  it('delete overlapping completely', () => testTP1('abcdef', del(0, 6), del(3, 2)));
  it('insert inside delete range (split case)', () => testTP1('abcdef', ins(2, 'XYZ'), del(1, 4)));
  it('delete and insert at same start', () => testTP1('hello', del(2, 1), ins(2, 'x')));
  it('large multi-character edits', () => {
    const doc = 'This is a long document for testing purposes.';
    testTP1(doc, ins(10, 'very very long insertion'), del(5, 20));
  });
  it('insert at start, delete entire document', () => testTP1('abc', ins(0, 'x'), del(0, 3)));
  it('delete at start, insert at end', () => testTP1('abc', del(0, 1), ins(3, 'd')));
  it('both insert empty text', () => testTP1('test', ins(0, ''), ins(0, '')));
  it('both delete zero length', () => testTP1('test', del(0, 0), del(2, 0)));

  // Random fuzzing – 200 iterations
  it('random concurrent operations (200 iterations)', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randString = (len) => Array.from({ length: len }, () => chars[randInt(0, chars.length - 1)]).join('');
    const randClient = () => randString(3);

    for (let i = 0; i < 200; i++) {
      const initialLen = randInt(0, 15);
      const initialDoc = randString(initialLen);
      const opType = Math.random();
      let op1, op2;
      const c1 = randClient(), c2 = randClient();
      if (opType < 0.5) {
        const pos = randInt(0, initialLen);
        op1 = ins(pos, randString(randInt(0, 4)), c1);
        op2 = ins(pos, randString(randInt(0, 4)), c2);
      } else if (opType < 0.75) {
        const pos = randInt(0, initialLen);
        op1 = ins(pos, randString(randInt(0, 3)), c1);
        const delStart = randInt(0, Math.max(0, initialLen - 1));
        const delLen = randInt(0, Math.min(3, initialLen - delStart));
        op2 = del(delStart, delLen, c2);
      } else {
        if (initialLen === 0) continue;
        const del1Start = randInt(0, initialLen - 1);
        const del1Len = randInt(0, Math.min(3, initialLen - del1Start));
        const del2Start = randInt(0, Math.max(0, initialLen - 1));
        const del2Len = randInt(0, Math.min(3, initialLen - del2Start));
        op1 = del(del1Start, del1Len, c1);
        op2 = del(del2Start, del2Len, c2);
      }
      testTP1(initialDoc, op1, op2);
    }
  });
});

// ----------------------------------------------------------------------
// 8. Multi-operation scenarios (server serialization)
// ----------------------------------------------------------------------
describe('Three concurrent operations (server-serialized)', () => {
  it('three inserts at same position converge', () => {
    const opA = ins(0, 'A', 'a');
    const opB = ins(0, 'B', 'b');
    const opC = ins(0, 'C', 'c');

    // Server applies them in order A, B, C, transforming subsequent ops
    let doc = '';
    const ops = [opA, opB, opC];
    for (let i = 0; i < ops.length; i++) {
      doc = applyOperation(doc, ops[i]);
      for (let j = i + 1; j < ops.length; j++) {
        const t = transform(ops[i], ops[j]);
        ops[j] = t.length > 0 ? t[0] : null;
      }
    }
    expect(doc).toMatch(/^[ABC]{3}$/);
  });

  it('insert, delete, insert at same region – server serialization works', () => {
    const initial = 'abcdef';
    const op1 = ins(2, 'X');
    const op2 = del(2, 2);
    const op3 = ins(3, 'YY');

    // Simulate server processing in order: op1, op2, op3
    let doc = initial;
    doc = applyOperation(doc, op1);                // abXcdef
    let t_op2 = transform(op1, op2);               // [del(3,2)]
    let t_op3 = transform(op1, op3);               // [ins(4,'YY')]
    doc = applyOperation(doc, t_op2[0]);           // abXef
    let t_op3_2 = transform(t_op2[0], t_op3[0]);   // [ins(3,'YY')]
    doc = applyOperation(doc, t_op3_2[0]);         // ✅ abXYYef
    expect(doc).toBe('abXYYef');
  });
});

// ----------------------------------------------------------------------
// 9. No silent data loss – complex mixed scenarios
// ----------------------------------------------------------------------
describe('No silent data loss', () => {
  it('concurrent insert and delete preserve all characters', () => {
    const doc = 'abcdef';
    const insOp = ins(2, 'XYZ');
    const delOp = del(2, 3);
    const path1 = applyAll(doc, [insOp, ...transform(insOp, delOp)]);
    const path2 = applyAll(doc, [delOp, ...transform(delOp, insOp)]);
    expect(path1).toEqual(path2);
    expect(path1).toBe('abXYZf');
  });

  it('two deletes that together cover whole document', () => {
    const doc = 'abcde';
    const op1 = del(0, 2);
    const op2 = del(2, 3);
    const t1 = transform(op1, op2);
    const t2 = transform(op2, op1);
    const final1 = applyAll(doc, [op1, ...t1]);
    const final2 = applyAll(doc, [op2, ...t2]);
    expect(final1).toBe('');
    expect(final2).toBe('');
  });

  it('insert exactly at deleted range boundary', () => {
    const doc = 'Hello';
    const op1 = del(0, 5);
    const op2 = ins(5, '!');
    const t2 = transform(op1, op2);
    const final = applyAll(doc, [op1, ...t2]);
    expect(final).toBe('!');
  });

  it('rapid fire of many small edits (sanity check)', () => {
    let doc = 'start';
    const ops = [
      ins(0, 'A'), del(1,1), ins(2, 'B'), del(0,2), ins(4, 'C'),
    ];
    let serverDoc = doc;
    for (let i = 0; i < ops.length; i++) {
      serverDoc = applyOperation(serverDoc, ops[i]);
      for (let j = i + 1; j < ops.length; j++) {
        const tf = transform(ops[i], ops[j]);
        ops[j] = tf.length > 0 ? tf[0] : null;
      }
    }
    expect(serverDoc).toBeDefined();
    expect(typeof serverDoc).toBe('string');
  });
});

// ----------------------------------------------------------------------
// 10. Additional edge cases
// ----------------------------------------------------------------------
describe('Additional edge cases', () => {
  it('transform when op2 becomes null (delete covered) and we apply empty', () => {
    const initial = 'abc';
    const op1 = del(0, 3);
    const op2 = del(1, 1);
    const t2 = transform(op1, op2); // []
    const final = applyAll(applyAll(initial, [op1]), t2);
    expect(final).toBe('');
  });
  it('insert at position beyond length (valid - extends string)', () => {
    const doc = 'ab';
    const op = ins(5, 'c');
    expect(applyOperation(doc, op)).toBe('abc');
  });
  it('delete beyond length is handled by slice', () => {
    const doc = 'ab';
    const op = del(0, 10);
    expect(applyOperation(doc, op)).toBe('');
  });
});