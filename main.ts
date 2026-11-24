// Tiny stack VM, ISA v1 (see kit generator/subject/ISA.md).
// Faithful port of the reference VM: 32-bit wrapping ints, 256-value
// stack, 64-deep call stack, 256 words of memory, traps 2-11, 1,000,000
// steps, 65,536 output bytes. Runs every instance in /input/<id>/ and
// writes /output/<id>/stdout.bin + exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [immediate bytes, pops, pushes] per opcode, undefined = unknown opcode.
const T: any = {};
T[0x00] = [0, 0, 0]; T[0x01] = [1, 0, 1]; T[0x02] = [4, 0, 1];
T[0x03] = [0, 1, 0]; T[0x04] = [0, 1, 2]; T[0x05] = [0, 2, 2];
T[0x06] = [0, 2, 3]; T[0x07] = [0, 3, 3];
T[0x10] = [0, 2, 1]; T[0x11] = [0, 2, 1]; T[0x12] = [0, 2, 1];
T[0x13] = [0, 2, 1]; T[0x14] = [0, 2, 1]; T[0x15] = [0, 2, 1];
T[0x16] = [0, 2, 1]; T[0x17] = [0, 1, 1]; T[0x18] = [0, 2, 1];
T[0x19] = [0, 2, 1]; T[0x1a] = [0, 2, 1]; T[0x1b] = [0, 1, 1];
T[0x1c] = [0, 2, 1]; T[0x1d] = [0, 2, 1]; T[0x1e] = [0, 2, 1];
T[0x20] = [0, 2, 1]; T[0x21] = [0, 2, 1]; T[0x22] = [0, 2, 1];
T[0x30] = [2, 0, 0]; T[0x31] = [2, 1, 0]; T[0x32] = [2, 1, 0];
T[0x33] = [2, 0, 0]; T[0x34] = [0, 0, 0];
T[0x40] = [0, 1, 1]; T[0x41] = [0, 2, 0];
T[0x50] = [0, 1, 0]; T[0x51] = [0, 1, 0]; T[0x52] = [0, 0, 1];
T[0x53] = [0, 1, 0];

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const n = p.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let olen = 0;
  let ip = 0;
  let pc = 0;
  let steps = 0;
  const done = (code: number) => ({ out: out.slice(0, olen), code });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const t = T[p[pc]];
    if (t === undefined) return done(5);
    const imm = t[0], pops = t[1], pushes = t[2];
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + pushes > 256) return done(3);
    const op = p[pc];
    pc = next;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const x = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = x; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const x = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = x; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : a % b | 0; }
        else if (op === 0x15) { if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return done(4); r = (a >>> 0) % (b >>> 0) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return done(7);
        C[cp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return done(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) return done(6);
        D[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = D[sp - 1], v = D[sp - 2];
        if (addr < 0 || addr >= 256) return done(6);
        sp -= 2; M[addr] = v;
        break;
      }
      case 0x50: {
        // PRINT: decimal ASCII without a TextEncoder allocation per print.
        const v = D[sp - 1];
        const neg = v < 0;
        let u = neg ? -v : v; // JS number: 2147483648 for INT_MIN
        const buf = new Uint8Array(12);
        let d = 0;
        if (u === 0) buf[d++] = 48;
        while (u > 0) { buf[d++] = 48 + (u % 10); u = Math.floor(u / 10); }
        const len = d + (neg ? 1 : 0);
        if (olen + len > 65536) return done(11);
        sp--;
        let w = olen;
        if (neg) out[w++] = 45;
        while (d > 0) out[w++] = buf[--d];
        olen += len;
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return done(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return done(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
