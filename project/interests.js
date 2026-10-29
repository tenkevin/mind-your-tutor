// Student interests: what each one connects to on the kinematics map, and the hook Milo and Ms. Ivy can open with.
(function () {
  const LIST = [
    { label: 'Basketball', icon: 'basketball', links: ['proj', 'fall', 'vel'], hook: 'A jump shot follows a projectile path.' },
    { label: 'Soccer', icon: 'soccer-ball', links: ['proj', 'acc', 'vel'], hook: 'A long pass is projectile motion you control with your foot.' },
    { label: 'Track & running', icon: 'person-simple-run', links: ['speed', 'vel', 'acc'], hook: 'Your 100 m split is an average velocity.' },
    { label: 'Skateboarding', icon: 'sneaker-move', links: ['acc', 'const', 'brake'], hook: 'Rolling down a ramp is steady acceleration.' },
    { label: 'Swimming', icon: 'swimming-pool', links: ['disp', 'dist', 'speed'], hook: 'Two lengths of a 50 m pool: 100 m of distance, 0 m of displacement.' },
    { label: 'Video games', icon: 'game-controller', links: ['vec', 'xt', 'proj'], hook: 'Game physics engines run on these exact equations.' },
    { label: 'Music', icon: 'music-notes', links: ['time', 'xt'], hook: 'Tempo is beats per time interval, the same idea as a rate.' },
    { label: 'Dance', icon: 'person-arms-spread', links: ['pos', 'disp', 'vec'], hook: 'Every routine is a chain of positions and displacements on a stage.' },
    { label: 'Drawing & art', icon: 'paint-brush', links: ['xt', 'vt', 'comp'], hook: 'Motion graphs are drawings of how something moves.' },
    { label: 'Film & TV', icon: 'film-slate', links: ['fall', 'brake', 'vt'], hook: 'Stunt teams calculate every fall and every braking distance.' },
    { label: 'Cooking', icon: 'cooking-pot', links: ['time', 'alg'], hook: 'Scaling a recipe is rearranging an equation.' },
    { label: 'Cars & bikes', icon: 'car-profile', links: ['brake', 'acc', 'journey'], hook: 'Stopping distance decides how close you can safely follow.' },
    { label: 'Animals', icon: 'paw-print', links: ['speed', 'acc', 'fall'], hook: 'A cheetah reaches about 25 m/s in 3 seconds.' },
    { label: 'Space', icon: 'rocket-launch', links: ['grav', 'fall', 'proj'], hook: 'On the Moon, things fall with a much smaller g.' },
    { label: 'Coding', icon: 'code', links: ['alg', 'suvat', 'xt'], hook: 'Code that moves a sprite uses x = x₀ + vt every frame.' },
    { label: 'Roller coasters', icon: 'trend-up', links: ['acc', 'grav', 'vt'], hook: 'The first big drop is close to free fall.' },
    { label: 'Outdoors & hiking', icon: 'mountains', links: ['disp', 'dist', 'journey'], hook: 'A trail loop can be 8 km long with 0 km displacement.' },
    { label: 'Drones', icon: 'airplane-tilt', links: ['comp', 'vec', 'vel'], hook: 'Flying a drone means adding velocity components.' }
  ];
  const KEY = 'ideamap.student.profile';
  const byLabel = Object.fromEntries(LIST.map(i => [i.label, i]));
  function profile() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  // First chosen interest that connects to this idea, if any.
  function hookFor(ideaId, p) {
    p = p || profile(); if (!p || !p.interests) return null;
    for (const l of p.interests) { const it = byLabel[l]; if (it && it.links.includes(ideaId)) return it; }
    return null;
  }
  // Metacognition: goals, time blocks, reminders, reflection. Stored on profile.plan.
  const GOALS = [['understand', 'Really understand it', 'ph ph-lightbulb'], ['test', 'Do well on the test', 'ph ph-exam'], ['catchup', 'Catch up', 'ph ph-clock-counter-clockwise'], ['ahead', 'Get ahead', 'ph ph-rocket-launch'], ['use', 'Use it for something I care about', 'ph ph-target']];
  const CONFIDENCE = ['New to me', 'Heard of it', 'Mostly get it', 'Could teach it'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const SLOTS = [['am', 'Morning', '7:30 am'], ['lunch', 'Lunch', '12:15 pm'], ['after', 'After school', '3:30 pm'], ['eve', 'Evening', '7:00 pm']];
  const SESSIONS = [15, 25, 45];
  const LEADS = [5, 10, 15];
  const REFLECT = [['session', 'After each session'], ['week', 'End of the week'], ['off', 'Off']];
  const PROMPTS = [['clicked', 'What clicked today?'], ['fuzzy', 'What’s still fuzzy?'], ['next', 'What will I try next time?'], ['plan', 'Did I stick to my plan?'], ['focus', 'How focused was I, 1 to 5?'], ['sure', 'How sure am I now?']];
  const STUCK = [['reread', 'Re-read the idea', 'ph ph-book-open'], ['example', 'Try a worked example', 'ph ph-pencil-simple-line'], ['draw', 'Draw a diagram', 'ph ph-scribble-loop'], ['milo', 'Explain it to Milo', 'ph ph-chats-circle'], ['ivy', 'Ask Ms. Ivy for a hint', 'ph ph-chalkboard-teacher'], ['break', 'Take a 5 min break', 'ph ph-coffee']];
  const PLAN = { goalKind: 'understand', goal: '', why: '', confidence: 0, session: 25, blocks: [], remind: { start: true, lead: 10, missed: true, recap: true, quiet: true }, reflect: 'session', prompts: ['clicked', 'fuzzy', 'next'], stuck: [], deadline: 'none', barriers: [] };
  function normPlan(pl) { pl = pl || {}; return { ...PLAN, ...pl, remind: { ...PLAN.remind, ...(pl.remind || {}) } }; }
  function mins(m) { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; }
  function weekText(pl) { const n = pl.blocks.length; return n ? `${n} block${n > 1 ? 's' : ''} × ${pl.session} min = ${mins(n * pl.session)} a week` : 'No study blocks yet'; }
  function blockLabel(id) { const [d, k] = id.split('-'), s = SLOTS.find(x => x[0] === k); return s ? `${d} · ${s[1]} (${s[2]})` : id; }
  function firstBlock(pl) { const ord = id => DAYS.indexOf(id.split('-')[0]) * 10 + SLOTS.findIndex(x => x[0] === id.split('-')[1]); return pl.blocks.length ? [...pl.blocks].sort((a, b) => ord(a) - ord(b))[0] : null; }
  function grid(pl, toggle) {
    return SLOTS.map(([k, label, time]) => ({ label, time, cells: DAYS.map(d => { const id = d + '-' + k, on = pl.blocks.includes(id); return { id, on: String(on), tip: `${d} ${label.toLowerCase()}, ${time}`, bg: on ? 'var(--color-accent-800)' : 'transparent', bc: on ? 'var(--color-accent)' : 'var(--color-neutral-700)', ic: on ? 'ph ph-check' : '', toggle: () => toggle(id) }; }) }));
  }
  const META = { GOALS, CONFIDENCE, DAYS, SLOTS, SESSIONS, LEADS, REFLECT, PROMPTS, STUCK, PLAN, normPlan, mins, weekText, blockLabel, firstBlock, grid };
  window.IdeaInterests = { LIST, KEY, byLabel, profile, hookFor, META };
})();
