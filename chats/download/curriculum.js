(function () {
  const KEY = 'ideamap.curriculum.v2';
  // Rows as synced from the curriculum spreadsheet (read-only in the app)
  const SHEET = {
    source: { kind: 'Google Sheets', name: 'Water cycle · Grade 6 curriculum', lastSync: '2026-10-22T08:14:00' },
    headers: {
      Ideas: ['idea_id', 'title', 'category', 'unit', 'objective', 'standard_codes', 'requires', 'media_url', 'notes'],
      Links: ['from_id', 'to_id', 'relation', 'importance', 'media_url'],
      Units: ['unit', 'name', 'objective', 'standard_codes'],
      Categories: ['category', 'icon', 'description'],
      Assessment: ['unit', 'idea_id', 'question', 'key_points']
    },
    ideas: [
      ['cycle', 'Water cycle', 'Process', 3, 'MS-ESS2-4', 'evap, cond, prec, coll', 'water-cycle-overview.mp4'],
      ['evap', 'Evaporation', 'Process', 1, 'MS-ESS2-4, MS-PS1-4', '', 'evaporation.mp4'],
      ['cond', 'Condensation', 'Process', 2, 'MS-ESS2-4, MS-PS1-4', 'evap', ''],
      ['prec', 'Precipitation', 'Process', 2, 'MS-ESS2-4', 'cond', 'precipitation.mp4'],
      ['coll', 'Collection', 'Process', 3, 'MS-ESS2-4', 'prec', ''],
      ['trans', 'Transpiration', 'Process', 1, 'MS-ESS2-4', 'plants', ''],
      ['ice', 'Freezing', 'Process', 3, 'MS-PS1-4', 'temp', ''],
      ['sun', 'The Sun', 'Force', 1, 'MS-ESS2-4', '', 'sun-energy.mp4'],
      ['temp', 'Temperature', 'Force', 1, 'MS-PS1-4', 'sun', ''],
      ['climate', 'Climate', 'Force', 2, 'MS-ESS2-6', 'temp, prec', ''],
      ['vap', 'Water vapour', 'Thing', 1, 'MS-ESS2-4', 'evap', 'water-vapour.png'],
      ['clouds', 'Clouds', 'Thing', 2, 'MS-ESS2-5', 'cond', 'clouds.mp4'],
      ['rain', 'Rain & snow', 'Thing', 2, '', 'prec', ''],
      ['ocean', 'Oceans', 'Thing', 1, 'MS-ESS2-6', '', 'oceans.jpg'],
      ['rivers', 'Rivers', 'Thing', 3, 'MS-ESS2-4', 'rain', ''],
      ['plants', 'Plants', 'Thing', 1, 'MS-LS1-6', '', ''],
      ['glacier', 'Glaciers', 'Thing', 3, 'MS-ESS2-4', 'ice', ''],
      ['ground', 'Groundwater', 'Thing', 3, 'MS-ESS3-1', 'coll, aquifer', '']
    ].map(r => ({ id: r[0], title: r[1], category: r[2], unit: r[3], codes: r[4], requires: r[5], media: r[6] })),
    units: [
      { n: 1, name: 'Water goes up', objective: 'Describe how heat from the Sun turns liquid water into water vapour.', codes: 'MS-ESS2-4, MS-PS1-4' },
      { n: 2, name: 'Water in the sky', objective: 'Explain how water vapour becomes clouds and falls back as rain or snow.', codes: 'MS-ESS2-4, MS-ESS2-5' },
      { n: 3, name: 'Water comes back', objective: 'Trace where water goes after it falls and how it returns to the sea.', codes: 'MS-ESS2-4' }
    ],
    categories: [
      { name: 'Process', icon: 'arrows-clockwise', description: 'Something that happens or changes' },
      { name: 'Force', icon: 'lightning', description: 'What causes or drives a change' },
      { name: 'Thing', icon: 'drop', description: 'An object, place or material' }
    ],
    assessment: { 1: 7, 2: 5, 3: 6 },
    counts: { Ideas: 18, Links: 31, Units: 3, Categories: 3, Assessment: 18 }
  };
  const FIELDS = [
    { tab: 'Ideas', key: 'id', label: 'Idea ID' }, { tab: 'Ideas', key: 'category', label: 'Category' },
    { tab: 'Ideas', key: 'codes', label: 'Standards codes' }, { tab: 'Ideas', key: 'requires', label: 'Prerequisites' },
    { tab: 'Ideas', key: 'media', label: 'Idea media' }, { tab: 'Links', key: 'linkMedia', label: 'Link media' },
    { tab: 'Categories', key: 'catIcon', label: 'Category icon' }, { tab: 'Assessment', key: 'question', label: 'Assessment question' }
  ];
  const MAPPING = { id: 'idea_id', category: 'category', codes: 'standard_codes', requires: 'requires', media: 'media_url', linkMedia: 'media_url', catIcon: 'icon', question: 'question' };
  const TONES = { warm: 'warm, friendly and encouraging', calm: 'calm, clear and precise', playful: 'playful, upbeat and funny', socratic: 'patient and Socratic, guiding with questions' };
  const VARS = ['name', 'tone', 'subject', 'topic', 'grade', 'age', 'peerAge', 'style', 'length'];
  const PERSONAS = [
    { id: 'tutor', name: 'Ms. Ivy', role: 'AI tutor', audience: 'Students', where: 'Idea pages, link explanations, quiz review', tone: 'warm', builtin: true,
      template: 'You are {name}, a {tone} {subject} tutor for {grade} students (ages {age}) studying "{topic}". {style} Praise effort and never make the student feel bad. Answer in {length}. No markdown, no lists, no headings.' },
    { id: 'peer', name: 'Milo', role: 'Virtual classmate', audience: 'Students', where: 'Study buddy on the map, summative teach-back', tone: 'playful', builtin: true,
      template: 'You are {name}, a {peerAge}-year-old {grade} classmate who is curious, friendly and still learning {subject}. You talk like a real {peerAge}-year-old, never like a teacher. Ask simple questions, react with enthusiasm, and now and then repeat an idea back with a small, believable mistake so the student can correct you. Reply in 1 to 3 short sentences. No markdown. Never say you are an AI.' },
    { id: 'agent', name: 'Atlas', role: 'Logistics agent', audience: 'Teachers', where: 'All teacher pages', tone: 'calm', builtin: true,
      template: 'You are {name}, the logistics agent for Idea Map. You talk with a {subject} teacher setting up "{topic}" for {grade}. You build and maintain the mind map from the curriculum spreadsheet and the shared resource library, and you answer questions about how the application works. Be {tone}. Keep answers short and practical. When a fix belongs in the spreadsheet, name the tab and column.' }
  ];
  const LIBRARY = [
    { name: 'Water cycle unit plan.pdf', kind: 'file-pdf' }, { name: 'NGSS MS-ESS2 standards.pdf', kind: 'file-pdf' },
    { name: 'Lab: evaporation in a jar.docx', kind: 'file-doc' }, { name: 'Weather vocabulary list.xlsx', kind: 'file-xls' },
    { name: 'District pacing guide 2026.pdf', kind: 'file-pdf' }
  ];
  const DEFAULT = {
    subject: 'Science', topic: 'The water cycle', grade: 6, framework: 'NGSS',
    mapObjective: 'Explain how water moves around the Earth in a never-ending cycle, and what powers it.',
    due: { 1: '2026-10-30', 2: '2026-11-06', 3: '2026-11-13' },
    rarity: {}, personas: PERSONAS, mapping: MAPPING, sourceKind: 'Google Sheets', lastSync: SHEET.source.lastSync
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    const d = clone(DEFAULT);
    if (!s) return d;
    const out = { ...d, ...s, due: { ...d.due, ...(s.due || {}) }, rarity: { ...(s.rarity || {}) }, mapping: { ...d.mapping, ...(s.mapping || {}) } };
    out.personas = (s.personas && s.personas.length ? s.personas : d.personas).map(p => ({ ...(d.personas.find(x => x.id === p.id) || {}), ...p }));
    return out;
  }
  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
    window.dispatchEvent(new CustomEvent('ideamap-config'));
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} window.dispatchEvent(new CustomEvent('ideamap-config')); return clone(DEFAULT); }
  const gradeLabel = g => (+g === 0 ? 'Kindergarten' : 'Grade ' + g);
  function band(g) {
    g = +g;
    if (g <= 2) return { level: 'Early reader', style: 'Use very short sentences and simple, everyday words. Explain one thing at a time with a familiar example from home or school.', length: '2 to 3 sentences' };
    if (g <= 5) return { level: 'Elementary', style: 'Use short sentences and plain words. Give one everyday example.', length: '3 to 4 sentences' };
    if (g <= 8) return { level: 'Middle school', style: 'Use clear sentences. Introduce the correct subject vocabulary with a quick definition, and give one real-world example.', length: '3 to 5 sentences' };
    return { level: 'High school', style: 'Use precise academic vocabulary. Focus on reasoning, cause and effect, and evidence, and connect ideas to real-world applications.', length: '4 to 6 sentences' };
  }
  function vars(cfg, p) {
    const b = band(cfg.grade), age = +cfg.grade + 5;
    return { name: p.name, tone: TONES[p.tone] || p.tone || TONES.warm, subject: String(cfg.subject || '').toLowerCase(), topic: cfg.topic,
      grade: gradeLabel(cfg.grade), age: age + ' to ' + (age + 1), peerAge: String(+cfg.grade + 6), style: b.style, length: b.length };
  }
  function fill(cfg, p) {
    const v = vars(cfg, p);
    return String(p.template || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  }
  function persona(cfg, id) { return (cfg.personas || []).find(p => p.id === id); }
  const codes = s => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
  function issues(cfg) {
    const ids = new Set(SHEET.ideas.map(r => r.id)), out = [];
    const noMedia = SHEET.ideas.filter(r => !r.media);
    if (noMedia.length) out.push({ kind: 'media', level: 'info', text: noMedia.length + ' ideas have no media_url and will show a placeholder', items: noMedia.map(r => r.title) });
    const noCodes = SHEET.ideas.filter(r => !codes(r.codes).length);
    if (noCodes.length) out.push({ kind: 'codes', level: 'warn', text: noCodes.length + ' idea has no standard_codes, so it is missing from alignment reports', items: noCodes.map(r => r.title) });
    SHEET.ideas.forEach(r => codes(r.requires).forEach(x => { if (!ids.has(x)) out.push({ kind: 'prereq', level: 'error', text: r.title + ' requires "' + x + '", which is not an idea_id in the Ideas tab', items: [r.title] }); }));
    const req = {}; SHEET.ideas.forEach(r => { req[r.id] = codes(r.requires).filter(x => ids.has(x)); });
    const seen = {}, stack = {};
    const dfs = id => { if (stack[id]) return true; if (seen[id]) return false; seen[id] = stack[id] = true; const c = req[id].some(dfs); stack[id] = false; return c; };
    if (Object.keys(req).some(dfs)) out.push({ kind: 'cycle', level: 'error', text: 'Prerequisites form a loop, so some ideas can never unlock', items: [] });
    return out;
  }
  window.IdeaMapCurriculum = { KEY, SHEET, FIELDS, TONES, VARS, PERSONAS, LIBRARY, DEFAULT, load, save, reset, gradeLabel, band, vars, fill, persona, codes, issues };
})();
