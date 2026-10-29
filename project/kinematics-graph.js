// Shared idea graph for the kinematics unit. The student explorer and the teacher dependency page both read it.
// ids match IDEAS in Kinematics Explorer; `requires` mirrors the Ideas tab `requires` column.
(function () {
  const IDEAS = [
    { id: 'pos', t: 'Position', unit: 1, requires: [], col: .12 },
    { id: 'time', t: 'Time interval', unit: 1, requires: [], col: .4 },
    { id: 'vec', t: 'Sign convention', unit: 1, requires: [], col: .68 },
    { id: 'alg', t: 'Rearranging equations', unit: 2, requires: [], col: .95 },
    { id: 'dist', t: 'Distance', unit: 1, requires: ['pos'], col: .05 },
    { id: 'disp', t: 'Displacement', unit: 1, requires: ['pos', 'vec'], col: .38 },
    { id: 'xt', t: 'Position–time graph', unit: 2, requires: ['pos', 'time'], col: .7 },
    { id: 'speed', t: 'Speed', unit: 1, requires: ['dist', 'time'], col: .1 },
    { id: 'vel', t: 'Velocity', unit: 1, requires: ['disp', 'time'], col: .45 },
    { id: 'acc', t: 'Acceleration', unit: 2, requires: ['vel'], col: .42 },
    { id: 'comp', t: 'Components', unit: 3, requires: ['vec', 'vel'], col: .78 },
    { id: 'grav', t: 'Gravity', unit: 3, requires: ['acc'], col: .12 },
    { id: 'const', t: 'Constant acceleration', unit: 2, requires: ['acc'], col: .42 },
    { id: 'vt', t: 'Velocity–time graph', unit: 2, requires: ['xt', 'acc'], col: .75 },
    { id: 'suvat', t: 'SUVAT equations', unit: 2, requires: ['const', 'alg'], col: .5 },
    { id: 'fall', t: 'Free fall', unit: 3, requires: ['suvat', 'grav'], col: .18 },
    { id: 'brake', t: 'Stopping distance', unit: 3, requires: ['suvat'], col: .5 },
    { id: 'journey', t: 'Two-stage journey', unit: 3, requires: ['suvat', 'vt'], col: .82 },
    { id: 'proj', t: 'Projectile motion', unit: 3, requires: ['fall', 'comp'], col: .35 }
  ];
  // Sample class: 27 students [mastered, in progress, not started]. The preview student from the explorer is added live.
  const SAMPLE = {
    pos: [25, 2, 0], time: [25, 2, 0], vec: [18, 7, 2], alg: [10, 12, 5], dist: [24, 3, 0], disp: [20, 6, 1], xt: [17, 8, 2],
    speed: [22, 4, 1], vel: [17, 8, 2], acc: [14, 10, 3], comp: [5, 9, 13], grav: [12, 8, 7], const: [12, 9, 6], vt: [10, 10, 7],
    suvat: [6, 13, 8], fall: [3, 9, 15], brake: [3, 7, 17], journey: [1, 6, 20], proj: [0, 3, 24]
  };
  const SAMPLE_TRACES = [
    { from: 'suvat', root: 'alg', n: 9, where: 'rearranging the chosen equation' },
    { from: 'fall', root: 'alg', n: 4, where: 'solving for t' },
    { from: 'vel', root: 'vec', n: 4, where: 'signing the displacement' },
    { from: 'vt', root: 'xt', n: 3, where: 'reading slope' },
    { from: 'fall', root: 'vec', n: 2, where: 'sign of g' },
    { from: 'journey', root: 'vt', n: 2, where: 'splitting the stages' }
  ];
  const K_REQ = 'ideamap.kin.requires', K_PROG = 'ideamap.kin.progress', K_TR = 'ideamap.kin.traces';
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const base = () => Object.fromEntries(IDEAS.map(i => [i.id, [...i.requires]]));
  function requiresMap() { const o = read(K_REQ, null); return o ? { ...base(), ...o } : base(); }
  // Walk down the prerequisites to the weakest one the student hasn't mastered.
  function weakestRoot(id, mastered, exLv, R) {
    R = R || requiresMap(); const lvOf = x => (mastered.includes(x) ? 10 : 0) + (exLv[x] || 0);
    let cur = id, path = [id];
    for (;;) { const w = (R[cur] || []).filter(r => !mastered.includes(r)).sort((a, b) => lvOf(a) - lvOf(b))[0]; if (!w || path.includes(w)) break; path.push(w); cur = w; }
    return path.length > 1 ? path[path.length - 1] : null;
  }
  window.KinGraph = {
    IDEAS, SAMPLE, SAMPLE_TRACES, CLASS: 28, base, requiresMap, weakestRoot,
    saveRequires: R => write(K_REQ, R), resetRequires: () => { try { localStorage.removeItem(K_REQ); } catch (e) {} },
    progress: () => read(K_PROG, { mastered: [], exLv: {} }), saveProgress: p => write(K_PROG, p),
    traces: () => read(K_TR, []), addTrace: t => { const a = read(K_TR, []); a.push({ ...t, at: Date.now() }); write(K_TR, a.slice(-50)); },
    KEYS: [K_REQ, K_PROG, K_TR]
  };
})();
