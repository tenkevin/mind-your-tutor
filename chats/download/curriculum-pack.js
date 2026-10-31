(function () {
  // One schema for every configurable field. edit: 'sheet' = source data only, 'app' = teacher settings only, 'both' = sheet seeds it, settings can override.
  const T = (tab, icon, desc, kind, cols, sample) => ({ tab, icon, desc, kind, cols, sample });
  const c = (name, type, req, edit, missing, example, note) => ({ name, type, req, edit, missing, example, note: note || '' });
  const TABS = [
    T('Course', 'graduation-cap', 'One row of key/value pairs that names the map and sets the reading level.', 'keyvalue', [
      c('subject', 'text', true, 'both', 'Blocks import', 'Science'),
      c('topic', 'text', true, 'both', 'Blocks import', 'The water cycle', 'Map title shown to students'),
      c('grade', 'K | 1–12', true, 'both', 'Blocks import', '6', 'Sets every persona\'s {age}, {style} and {length}'),
      c('framework', 'text', false, 'both', 'Custom', 'NGSS', 'Labels the standards codes'),
      c('map_objective', 'text', false, 'both', 'Hidden on the map', 'Explain how water moves around the Earth…'),
      c('pass_mark', 'percent', false, 'app', '70', '70', 'Quiz and teach-back threshold')
    ], [['subject', 'Science'], ['topic', 'The water cycle'], ['grade', '6'], ['framework', 'NGSS'], ['map_objective', 'Explain how water moves around the Earth in a never-ending cycle, and what powers it.'], ['pass_mark', '70']]),
    T('Units', 'stack', 'Groups ideas into missions. Each unit ends in a teach-back with Milo.', 'rows', [
      c('unit', 'integer', true, 'sheet', 'Blocks import', '1'),
      c('name', 'text', true, 'sheet', 'Shows “Unit n”', 'Water goes up'),
      c('objective', 'text', true, 'sheet', 'Flagged in data checks', 'Describe how heat from the Sun…'),
      c('standard_codes', 'list', false, 'sheet', 'No codes shown', 'MS-ESS2-4, MS-PS1-4'),
      c('due_date', 'date', false, 'both', 'No due date', '2026-10-30')
    ], [['1', 'Water goes up', 'Describe how heat from the Sun turns liquid water into water vapour.', 'MS-ESS2-4, MS-PS1-4', '2026-10-30']]),
    T('Ideas', 'circles-three', 'One row per node on the map. The most connected idea becomes the centre.', 'rows', [
      c('idea_id', 'slug', true, 'sheet', 'Blocks import', 'evap', 'Unique, lowercase, no spaces'),
      c('title', 'text', true, 'sheet', 'Blocks import', 'Evaporation'),
      c('category', 'Categories.category', true, 'sheet', 'Uses first category', 'Process'),
      c('unit', 'Units.unit', true, 'sheet', 'Blocks import', '1'),
      c('objective', 'text', false, 'sheet', 'Tutor writes one from links', 'Explain how heat turns water into vapour.'),
      c('standard_codes', 'list', false, 'sheet', 'Flagged in data checks', 'MS-ESS2-4, MS-PS1-4'),
      c('requires', 'list of idea_id', false, 'both', 'No trace-back for this idea', 'evap, cond', 'Teacher-only. Drawn as the dependency map; traces missed exercises to the weakest prerequisite'),
      c('media_url', 'url or file', false, 'sheet', 'Empty video frame', 'evaporation.mp4', 'Overview video at the top of the idea page'),
      c('rarity', 'auto | Common | Rare | Legendary', false, 'both', 'auto', 'Rare', 'Auto: most connected = Legendary, inner ring = Rare'),
      c('notes', 'text', false, 'sheet', '—', 'Lab on day 2', 'Teacher-only; Atlas can read it')
    ], [['evap', 'Evaporation', 'Process', '1', 'Explain how heat turns liquid water into vapour.', 'MS-ESS2-4, MS-PS1-4', '', 'evaporation.mp4', 'auto', '']]),
    T('Links', 'flow-arrow', 'Directed connections between ideas. Each idea shows its 3 strongest links in and out.', 'rows', [
      c('from_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped', 'sun'),
      c('to_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped', 'evap'),
      c('relation', 'short verb phrase', true, 'sheet', 'Row skipped', 'heats water for', 'Becomes quiz questions'),
      c('importance', '1–5', false, 'sheet', '3', '5', 'Ranks which links are shown'),
      c('media_url', 'url or file', false, 'sheet', 'Opens the AI tutor', 'sun-heats-sea.mp4')
    ], [['sun', 'evap', 'heats water for', '5', ''], ['evap', 'vap', 'turns liquid into', '5', '']]),
    T('Practice', 'pencil-simple', 'Standards-aligned exercises shown under “Practice for mastery” on each idea page. One row per problem; rows with the same exercise_id form one exercise.', 'rows', [
      c('exercise_id', 'slug', true, 'sheet', 'Row skipped', 'v4', 'Groups problems into one exercise'),
      c('idea_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped', 'vel'),
      c('group', 'text', true, 'sheet', 'Shows “Practice”', 'Velocity as a rate of change', 'Heading on the idea page'),
      c('standard_code', 'code', false, 'sheet', 'No code shown', 'HSF-IF.B.6', 'One code per group'),
      c('exercise_title', 'text', true, 'sheet', 'Uses exercise_id', 'Velocity from position–time graphs'),
      c('kind', 'exercise | quiz', false, 'sheet', 'exercise', 'exercise', 'Quiz rows list exercise_ids in quiz_from'),
      c('quiz_from', 'list of exercise_id', false, 'sheet', '—', 'v1, v2, v4'),
      c('problem_type', 'mc | number', true, 'sheet', 'Row skipped', 'number'),
      c('question', 'text', true, 'sheet', 'Row skipped', 'What is the velocity of this object?'),
      c('choices', 'list', false, 'sheet', 'Required for mc', 'At rest | 10 m/s | Speeding up', 'Pipe-separated; first is correct, app shuffles'),
      c('answer', 'number or text', true, 'sheet', 'Row skipped', '-5'),
      c('answer_unit', 'text', false, 'sheet', 'No unit shown', 'm/s'),
      c('explanation', 'text', true, 'sheet', 'Shows the answer only', 'Slope = (0 − 30) ÷ 6 = −5 m/s.'),
      c('visual', 'graph: x,y; x,y | table: t…; x…', false, 'sheet', 'Text-only problem', 'graph: 0,30; 6,0', 'Drawn by the app'),
      c('media_url', 'url or file', false, 'sheet', '—', 'v4-hint.mp4', 'Optional hint video'),
      c('demo_video_url', 'url or file', false, 'sheet', 'Empty video frame', 'v4-worked-example.mp4', 'Worked example video on the exercise’s “Worked example” tab. Read from the exercise’s first row'),
      c('demo_steps', 'list', false, 'sheet', 'First problem’s explanation', 'Velocity is the slope | Rise 20 m, run 4 s | 20 ÷ 4 | 5 m/s', 'Pipe-separated steps shown under the demo video')
    ], [['v4', 'vel', 'Velocity as a rate of change', 'HSF-IF.B.6', 'Velocity from position–time graphs', 'exercise', '', 'number', 'What is the velocity of this object?', '', '-5', 'm/s', 'Slope = (0 − 30) ÷ 6 = −5 m/s.', 'graph: 0,30; 6,0', '', 'v4-worked-example.mp4', 'Velocity is the slope of a position–time graph | Rise 20 m, run 4 s | 20 ÷ 4 | 5 m/s']]),
    T('Categories', 'shapes', 'Kinds of idea. Used for card icons, map labels and “what kind of idea is it?” questions.', 'rows', [
      c('category', 'text', true, 'sheet', 'One category “Idea”', 'Process'),
      c('icon', 'Phosphor icon name', false, 'sheet', 'circle', 'arrows-clockwise'),
      c('description', 'text', false, 'sheet', 'Quiz skips category questions', 'Something that happens or changes')
    ], [['Process', 'arrows-clockwise', 'Something that happens or changes']]),
    T('Assessment', 'student', 'Fixed teach-back questions. Milo asks one per lesson objective.', 'rows', [
      c('unit', 'Units.unit', true, 'sheet', 'Row skipped', '1'),
      c('idea_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped', 'evap'),
      c('question', 'text', true, 'sheet', 'Placeholder; Atlas can draft', 'Why does a puddle disappear on a sunny day?'),
      c('key_points', 'list', false, 'sheet', 'Milo checks against the objective', 'heat, liquid to gas, vapour rises')
    ], [['1', 'evap', 'Why does a puddle disappear on a sunny day?', 'heat, liquid to gas, vapour rises']]),
    T('Personas', 'chats-circle', 'AI prompt templates. Variables in braces are filled from the Course tab.', 'rows', [
      c('persona_id', 'tutor | peer | agent | custom', true, 'both', 'Built-in default', 'tutor'),
      c('name', 'text', true, 'both', 'Built-in default', 'Ms. Ivy'),
      c('role', 'text', false, 'both', 'Built-in default', 'AI tutor'),
      c('audience', 'Students | Teachers', false, 'both', 'Students', 'Students'),
      c('tone', 'warm | calm | playful | socratic', false, 'both', 'warm', 'warm'),
      c('prompt_template', 'text with {vars}', false, 'both', 'Built-in default', 'You are {name}, a {tone} {subject} tutor…', 'Vars: {name} {tone} {subject} {topic} {grade} {age} {peerAge} {style} {length}')
    ], [['tutor', 'Ms. Ivy', 'AI tutor', 'Students', 'warm', 'You are {name}, a {tone} {subject} tutor for {grade} students (ages {age}) studying "{topic}". {style} Answer in {length}.']]),
    T('Library', 'books', 'Documents Atlas indexes for retrieval: unit plans, standards, labs, pacing guides.', 'rows', [
      c('title', 'text', true, 'both', 'File name', 'Water cycle unit plan'),
      c('file_url', 'url or file', true, 'both', 'Row skipped', 'unit-plan.pdf'),
      c('use_for', 'agent | tutor | both', false, 'both', 'agent', 'both', 'Who can retrieve it')
    ], [['Water cycle unit plan', 'unit-plan.pdf', 'agent']])
  ];
  const csvCell = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
  function templateCSV(tab, withSample) {
    const t = TABS.find(x => x.tab === tab);
    if (t.kind === 'keyvalue') return csv([['key', 'value'], ...(withSample ? t.sample : t.cols.map(k => [k.name, '']))]);
    return csv([t.cols.map(k => k.name), ...(withSample ? t.sample : [])]);
  }
  function jsonSchema() {
    const typ = k => /integer|1–5/.test(k.type) ? { type: 'integer' } : k.type === 'percent' ? { type: 'number', minimum: 0, maximum: 100 } : /^list/.test(k.type) ? { type: 'array', items: { type: 'string' } } : k.type === 'date' ? { type: 'string', format: 'date' } : { type: 'string' };
    const obj = t => ({ type: 'object', description: t.desc, required: t.cols.filter(k => k.req).map(k => k.name), properties: Object.fromEntries(t.cols.map(k => [k.name, { ...typ(k), description: [k.type, k.note, 'If missing: ' + k.missing, 'Edited in: ' + k.edit].filter(Boolean).join(' · ') }])) });
    return { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Idea Map curriculum pack', type: 'object', required: ['version', 'course', 'units', 'ideas', 'links'],
      properties: Object.assign({ version: { const: 1 } }, Object.fromEntries(TABS.map(t => [t.tab.toLowerCase(), t.kind === 'keyvalue' ? obj(t) : { type: 'array', items: obj(t) }]))) };
  }
  function buildPack(C, cfg) {
    const S = C.SHEET, list = s => C.codes(s);
    return {
      version: 1,
      course: { subject: cfg.subject, topic: cfg.topic, grade: cfg.grade, framework: cfg.framework, map_objective: cfg.mapObjective, pass_mark: 70 },
      units: S.units.map(u => ({ unit: u.n, name: u.name, objective: u.objective, standard_codes: list(u.codes), due_date: cfg.due[u.n] || null })),
      ideas: S.ideas.map(r => ({ idea_id: r.id, title: r.title, category: r.category, unit: r.unit, standard_codes: list(r.codes), requires: list(r.requires), media_url: r.media || null, rarity: cfg.rarity[r.id] || 'auto' })),
      links: [{ from_id: 'sun', to_id: 'evap', relation: 'heats water for', importance: 5, media_url: null }, '… ' + (S.counts.Links - 1) + ' more rows read from the Links tab at sync'],
      practice: [{ exercise_id: 'evap1', idea_id: 'evap', group: 'Evaporation and heat', standard_code: 'MS-PS1-4', exercise_title: 'What speeds up evaporation?', kind: 'exercise', problem_type: 'mc', question: 'Which puddle dries fastest?', choices: ['A shallow puddle in the sun', 'A deep puddle in the shade', 'A puddle on a cold night'], answer: 'A shallow puddle in the sun', explanation: 'More heat and more surface area both speed up evaporation.', visual: null }, '… more rows read from the Practice tab at sync'],
      categories: S.categories.map(k => ({ category: k.name, icon: k.icon, description: k.description })),
      assessment: S.units.map(u => ({ unit: u.n, questions: S.assessment[u.n] || 0 })),
      personas: cfg.personas.map(p => ({ persona_id: p.id, name: p.name, role: p.role, audience: p.audience, tone: p.tone, prompt_template: p.template })),
      library: C.LIBRARY.map(d => ({ title: d.name, file_url: d.name, use_for: 'agent' }))
    };
  }
  window.IdeaMapPack = { TABS, templateCSV, jsonSchema, buildPack };
})();
