// Study plan: Ms. Ivy's interview script, a rule-based planner (cognitive-load capped), and an AI path that uses skills/study-plan.md.
(function () {
  const KEY = 'ideamap.student.profile';
  const DEADLINES = [['week', 'Test this week', 7], ['2weeks', 'In about 2 weeks', 14], ['month', 'In a month', 30], ['none', 'No date', 0]];
  const BARRIERS = [['phone', 'My phone', 'Phone in another room for the block.'], ['tired', 'Too tired', 'Pick an earlier block, even a short one.'], ['busy', 'Too busy', 'Keep blocks at 15 min. Small still counts.'], ['forget', 'I forget', 'Reminders stay on before each block.'], ['hard', 'It feels too hard', 'One idea a day, with a worked example first.'], ['none', 'Nothing yet', '']];
  const BUDGET = { 15: 4, 25: 5, 45: 8 };
  const LOAD = { 1: 2, 2: 3, 3: 4 };
  // Ms. Ivy's interview. type: one (single chip), many (multi chips), text. field: where the answer lives on profile.plan.
  const INTERVIEW = [
    { field: 'goalKind', type: 'one', ask: n => `Hi ${n}, I'm Ms. Ivy. I'll build your study plan, so I have a few questions. First: what do you most want out of this unit?` },
    { field: 'goal', type: 'text', ask: () => 'Say it in your own words. By the end of the unit, I want to be able to…', ph: 'e.g. explain how a free kick curves and dips' },
    { field: 'why', type: 'text', ask: () => 'Why does that matter to you?', ph: 'Optional' },
    { field: 'deadline', type: 'one', ask: () => 'Is there a test or deadline coming up?' },
    { field: 'confidence', type: 'one', ask: () => 'How sure do you feel about kinematics right now?' },
    { field: 'barriers', type: 'many', ask: () => 'What usually gets in the way when you study? Pick any.' },
    { field: 'stuck', type: 'many', ask: () => 'Last one. When you get stuck, what will you try first?' }
  ];
  let SKILL = null;
  function loadSkill() { if (SKILL) return Promise.resolve(SKILL); return fetch('skills/study-plan.md').then(r => r.ok ? r.text() : '').then(t => (SKILL = t)).catch(() => ''); }
  function order(IDEAS, mastered) {
    const left = IDEAS.filter(n => !mastered.includes(n.id)), done = new Set(mastered), out = [];
    while (left.length) {
      const ready = left.filter(n => n.requires.every(r => done.has(r))).sort((a, b) => a.unit - b.unit);
      const n = ready[0] || left[0]; out.push(n); done.add(n.id); left.splice(left.indexOf(n), 1);
    }
    return out;
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  // Rule-based planner. Mirrors the rules in skills/study-plan.md.
  function generate(p, opts) {
    opts = opts || {};
    const M = window.IdeaInterests.META, IDEAS = window.KinGraph.IDEAS, pl = M.normPlan(p.plan);
    const mastered = opts.mastered || [], seq = order(IDEAS, mastered);
    const conf = pl.confidence || 0, low = conf > 0 && conf <= 2;
    const budget = (BUDGET[pl.session] || 5) - (low ? 1 : 0);
    const slotOrder = M.SLOTS.map(s => s[0]);
    const byDay = {}; pl.blocks.forEach(b => { const [d, k] = b.split('-'); if (!byDay[d] || slotOrder.indexOf(k) < slotOrder.indexOf(byDay[d])) byDay[d] = k; });
    const useDefault = !pl.blocks.length; if (useDefault) ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(d => { byDay[d] = 'after'; });
    const start = opts.today ? new Date(opts.today) : new Date(); start.setHours(12, 0, 0, 0);
    const studyDates = []; for (let i = 1; studyDates.length < 80 && i < 200; i++) { const d = new Date(start); d.setDate(d.getDate() + i); const dn = M.DAYS[(d.getDay() + 6) % 7]; if (byDay[dn]) studyDates.push({ d, dn, k: byDay[dn] }); }
    const dl = (DEADLINES.find(x => x[0] === pl.deadline) || DEADLINES[3])[2];
    const before = dl ? studyDates.filter(x => (x.d - start) / 864e5 <= dl).length : 0;
    let pace = 1;
    if ((pl.goalKind === 'test' || pl.goalKind === 'catchup') && dl && before && seq.length > before) pace = 2;
    if (pl.goalKind === 'ahead') pace = 2;
    if (low) pace = 1;
    const prompts = pl.reflect === 'off' ? [] : pl.prompts.map(id => (M.PROMPTS.find(x => x[0] === id) || [, id])[1]);
    const goalText = pl.goal.trim() || M.GOALS.find(g => g[0] === pl.goalKind)[1].toLowerCase();
    const reviews = []; const days = []; let i = 0, di = 0;
    while ((i < seq.length || reviews.length) && di < studyDates.length) {
      const sd = studyDates[di], items = []; let used = 0;
      const due = reviews.filter(r => r.at <= di);
      let learned = 0;
      while (learned < pace && i < seq.length) {
        const n = seq[i], l = LOAD[n.unit] || 3;
        if (learned && used + l > budget) break;
        items.push({ kind: 'learn', id: n.id, title: n.t, load: l, extra: pl.goalKind === 'understand' || pl.goalKind === 'use' ? 'with a worked example' : '' }); used += l; learned++;
        reviews.push({ id: n.id, title: n.t, at: di + 1 }, { id: n.id, title: n.t, at: di + 3 }); i++;
      }
      due.forEach(r => { if (used + 1 <= budget) { items.push({ kind: 'review', id: r.id, title: r.title, load: 1 }); used += 1; reviews.splice(reviews.indexOf(r), 1); } else r.at = di + 1; });
      if (pl.reflect === 'session' || (pl.reflect === 'week' && (di === studyDates.length - 1 || studyDates[di + 1].d.getDay() < sd.d.getDay() || sd.dn === 'Sun'))) items.push({ kind: 'reflect', prompts, load: 0 });
      if (days.length % 5 === 4) items.push({ kind: 'goal', text: `Does this still get you closer to: ${goalText}?`, load: 0 });
      days.push({ date: iso(sd.d), dow: sd.dn, block: sd.dn + '-' + sd.k, used, items }); di++;
    }
    const finishIdx = days.reduce((a, d, j) => d.items.some(x => x.kind === 'learn') ? j : a, 0);
    const finish = days[finishIdx] ? days[finishIdx].date : null;
    const late = dl && finish && (new Date(finish) - start) / 864e5 > dl;
    const tactics = pl.barriers.filter(b => b !== 'none').map(b => { const x = BARRIERS.find(y => y[0] === b); return x ? { barrier: x[1], tactic: x[2] } : null; }).filter(Boolean);
    const note = late ? `That's more than fits before your deadline. Start with ${seq.slice(0, 3).map(n => n.t).join(', ')}, and we'll trim the rest together.`
      : pace > 1 ? `Two ideas on some days to fit your timeline, still under your load limit.` : `One idea a day, with reviews spaced out so it sticks.`;
    return { source: 'rules', created: new Date().toISOString(), pace, budget, finish, late: !!late, note, tactics, useDefault, days };
  }
  async function generateAI(p, opts) {
    const fallback = generate(p, opts);
    if (!window.claude || !window.claude.complete) return fallback;
    const skill = await loadSkill(); if (!skill) return fallback;
    const M = window.IdeaInterests.META, pl = M.normPlan(p.plan);
    const input = { student: { name: p.name, grade: p.grade, interests: p.interests, confidence: pl.confidence, goalKind: pl.goalKind, goal: pl.goal, why: pl.why, deadline: pl.deadline, barriers: pl.barriers, stuck: pl.stuck },
      schedule: { session: pl.session, blocks: pl.blocks, remind: pl.remind, reflect: pl.reflect, prompts: pl.prompts.map(id => (M.PROMPTS.find(x => x[0] === id) || [, id])[1]) },
      ideas: order(window.KinGraph.IDEAS, []).map(n => ({ id: n.id, title: n.t, unit: n.unit, requires: n.requires })), mastered: (opts && opts.mastered) || [], today: iso(new Date()) };
    try {
      const r = await window.claude.complete({ system: skill, messages: [{ role: 'user', content: JSON.stringify(input) }], max_tokens: 4000 });
      const j = JSON.parse((r.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      if (!Array.isArray(j.days) || !j.days.length) return fallback;
      const T = Object.fromEntries(window.KinGraph.IDEAS.map(n => [n.id, n.t]));
      j.days.forEach(d => { d.dow = d.dow || M.DAYS[(new Date(d.date + 'T12:00').getDay() + 6) % 7]; (d.items || []).forEach(x => { if (x.id) x.title = T[x.id] || x.id; }); d.used = (d.items || []).reduce((a, x) => a + (x.load || 0), 0); });
      return { ...fallback, ...j, source: 'ai', created: new Date().toISOString() };
    } catch (e) { return fallback; }
  }
  function saved() { try { const p = JSON.parse(localStorage.getItem(KEY)); return p && p.studyPlan ? p : null; } catch (e) { return null; } }
  function today(p) { p = p || saved(); if (!p) return null; const t = iso(new Date()); return p.studyPlan.days.find(d => d.date >= t) || null; }
  function describe(day) { return day.items.map(x => x.kind === 'learn' ? `learn ${x.title}${x.extra ? ' ' + x.extra : ''}` : x.kind === 'review' ? `review ${x.title}` : x.kind === 'reflect' ? `reflection (${(x.prompts || []).join(' ')})` : x.text).join('; '); }
  // Short note appended to Ms. Ivy / Milo system prompts so they can refer to the plan.
  function context(who) {
    const p = saved(); if (!p) return '';
    const pl = p.plan || {}, sp = p.studyPlan, d = today(p);
    const parts = [' Study plan: ' + sp.pace + ' new idea(s) per study day, load budget ' + sp.budget + ' units per session.'];
    if (pl.goal) parts.push('Goal in their words: "' + pl.goal + '".');
    if (d) parts.push('Next session ' + d.date + ': ' + describe(d) + '. Load ' + d.used + '/' + sp.budget + '.');
    if (who === 'tutor') parts.push('If the student seems overloaded, suggest stopping after the current idea and moving the rest to the next session. End sessions by asking their reflection questions.');
    return parts.join(' ');
  }
  window.StudyPlan = { KEY, DEADLINES, BARRIERS, BUDGET, INTERVIEW, generate, generateAI, loadSkill, saved, today, describe, context };
})();
