#!/usr/bin/env node
/**
 * QuizWing — Full content migration: HTML/JSON → App JSON
 *
 * Supports THREE source formats:
 *   1. JS array:   `var xxxData = [{q, options, correct, explanation}, ...]`
 *   2. HTML markup: `<div class="np-qcard">…<button class="np-opt np-correct">…</button></div>`
 *   3. Math JSON:  flat `[{y, q, opts, ci, ans}, ...]` files at <subject>/_<topic>_data.json
 *
 * Covers One Paper + Entry Tests.
 *
 * Usage:
 *   node scripts/migrate.js               # migrate everything
 *   node scripts/migrate.js --subject=X   # one subject only
 *
 * Idempotent — re-running bumps version numbers.
 */

const fs   = require('fs');
const path = require('path');

const PAGES_ROOT   = path.resolve(__dirname, '../../../pages');
const CONTENT_ROOT = path.resolve(__dirname, '../content');

// ───────────────────────── Subject taxonomy ─────────────────────────
//   folder      : path under PAGES_ROOT (relative)
//   extractor   : 'js' (default), 'html', or 'math-json'
//   placeholder : true → write _meta only, skip topic extraction
const SUBJECTS = {
  // ───── One Paper ─────
  'everyday-science': {
    folder: 'one-paper-mcqs/everyday-science',
    id: 'everyday-science',
    name: 'Everyday Science',
    icon: '🔬',
    order: 1, category: 'one-paper', color: '#0d4a28',
    description: 'Physics, Chemistry, Biology, Astronomy, Human Body, Diseases & Inventions for PPSC, FPSC, NTS, CSS, PMS, MDCAT.',
  },
  'computer-science': {
    folder: 'one-paper-mcqs/computer-science-mcqs',
    id: 'computer-science',
    name: 'Computer Science',
    icon: '💻',
    order: 2, category: 'one-paper', color: '#1e40af',
    description: 'Computer fundamentals, CPU, networks, internet, AI, databases & famous scientists.',
  },
  'current-affairs': {
    folder: 'one-paper-mcqs/current-affairs-mcqs',
    id: 'current-affairs',
    name: 'Current Affairs',
    icon: '📰',
    order: 3, category: 'one-paper', color: '#b91c1c',
    description: 'Pakistan + International current affairs 2024–2026 — elections, conflicts, treaties, awards, sports.',
  },
  'general-knowledge': {
    folder: 'one-paper-mcqs/general-knowledge-mcqs',
    id: 'general-knowledge',
    name: 'General Knowledge',
    icon: '🌍',
    order: 4, category: 'one-paper', color: '#7c3aed',
    description: 'World history, geography, countries & capitals, wars, empires and exploration.',
  },
  'pakistan-studies': {
    folder: 'one-paper-mcqs/pak-study-mcqs',
    id: 'pakistan-studies',
    name: 'Pakistan Studies',
    icon: '🇵🇰',
    order: 5, category: 'one-paper', color: '#15803d',
    description: 'Pakistan movement, Quaid-e-Azam, constitution, history & political development.',
  },
  'islamic-studies': {
    folder: 'one-paper-mcqs/islamic-studies-mcqs',
    id: 'islamic-studies',
    name: 'Islamic Studies',
    icon: '🕌',
    order: 6, category: 'one-paper', color: '#0e7490',
    description: 'Quran, Hadith, Prophet (PBUH), Caliphs, Islamic history & jurisprudence.',
  },
  'mathematics': {
    folder: 'one-paper-mcqs/mathematics',
    id: 'mathematics',
    name: 'Mathematics',
    icon: '📐',
    order: 7, category: 'one-paper', color: '#c2410c',
    extractor: 'math-json',
    description: 'Arithmetic, algebra, geometry, percentages, ratios, averages & word problems.',
  },
  'english': {
    folder: 'one-paper-mcqs/english-mcqs',
    id: 'english',
    name: 'English',
    icon: '📖',
    order: 8, category: 'one-paper', color: '#be185d',
    placeholder: true,
    description: 'Grammar, vocabulary, synonyms, antonyms, idioms, prepositions & comprehension.',
  },
  'geography': {
    folder: 'one-paper-mcqs/geography-mcqs',
    id: 'geography',
    name: 'Geography',
    icon: '🗺️',
    order: 9, category: 'one-paper', color: '#0f766e',
    placeholder: true,
    description: 'Physical, political & economic geography of Pakistan and the world.',
  },
  'urdu': {
    folder: 'one-paper-mcqs/urdu-mcqs',
    id: 'urdu',
    name: 'Urdu',
    icon: '✍️',
    order: 10, category: 'one-paper', color: '#7e22ce',
    placeholder: true,
    description: 'Urdu grammar, idioms, poets, prose, literature & sentence construction.',
  },

  // ───── Entry Tests ─────
  'nts': {
    folder: 'entry-test/nts-gat-nat',
    id: 'nts',
    name: 'NTS (GAT / NAT)',
    icon: '📝',
    order: 11, category: 'entry-tests', color: '#15803d',
    description: 'NAT-ICOM, NAT-ICS, NAT-IE, NAT-IM mock tests with verified answers.',
  },
  'mdcat': {
    folder: 'entry-test/mdcat',
    id: 'mdcat',
    name: 'MDCAT',
    icon: '🩺',
    order: 12, category: 'entry-tests', color: '#0e7490',
    placeholder: true,
    description: 'Biology, Chemistry, Physics, English, Logic for medical entry.',
  },
  'ecat': {
    folder: 'entry-test/ecat',
    id: 'ecat',
    name: 'ECAT',
    icon: '⚙️',
    order: 13, category: 'entry-tests', color: '#b45309',
    placeholder: true,
    description: 'UET ECAT — Mathematics, Physics, Chemistry, Computer, English.',
  },
  'nust': {
    folder: 'entry-test/nust-net',
    id: 'nust',
    name: 'NUST NET',
    icon: '🎓',
    order: 14, category: 'entry-tests', color: '#7c3aed',
    placeholder: true,
    description: 'NUST NET-1, NET-2, NET-3 — engineering, computing, biosciences.',
  },
  'fastnu': {
    folder: 'entry-test/fast-nu',
    id: 'fastnu',
    name: 'FAST NU',
    icon: '🖥️',
    order: 15, category: 'entry-tests', color: '#1e40af',
    placeholder: true,
    description: 'FAST National University admission test prep.',
  },
  'issb': {
    folder: 'entry-test/issb-forces',
    id: 'issb',
    name: 'ISSB',
    icon: '🎖️',
    order: 16, category: 'entry-tests', color: '#92400e',
    placeholder: true,
    description: 'ISSB Inter-Services Selection Board — verbal, non-verbal, psych, math.',
  },
};

// ───────────────────────── Helpers ─────────────────────────
function prettify(slug) {
  return slug
    .replace(/^_/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAnd\b/g, '&')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bIn\b/g, 'in')
    .replace(/\bA\b/g, 'a')
    .replace(/^./, c => c.toUpperCase());
}

/* Decode common HTML entities + strip leftover tags */
function htmlClean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Strip "A. ", "B) ", "1) " prefixes off option labels */
function stripOptPrefix(s) {
  return htmlClean(s).replace(/^[A-Da-d1-4]\s*[\.\):\-]\s*/, '').trim();
}

// ───────────────────── Extractor 1 — JS array ─────────────────────
function extractFromJSArray(html) {
  const re = /var\s+([a-zA-Z_]+)Data\s*=\s*(\[[\s\S]*?\n\]);/;
  const m  = html.match(re);
  if (!m) return null;
  try {
    const data = new Function('return ' + m[2])();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map(item => ({
      q:        item.q || item.question || '',
      options:  item.options || item.opts || [],
      correct:  typeof item.correct === 'number' ? item.correct : (item.c ?? 0),
      explanation: item.rationale || item.explanation || '',
    }));
  } catch { return null; }
}

// ───────────────────── Extractor 2 — HTML np-qcard ─────────────────────
function extractFromHTMLCards(html) {
  const cardRe = /<div class="np-qcard"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="np-qcard"|<\/div>\s*<\/section)/g;
  // Simpler approach: split into chunks at np-qcard openings
  const chunks = html.split(/<div class="np-qcard"/);
  if (chunks.length < 2) return null;

  const mcqs = [];
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Question can be <p|h2|h3|h4|div class="np-qtext">…</…>
    const qm = chunk.match(/<(?:p|h[1-6]|div)\s+class="np-qtext"[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|div)>/);
    if (!qm) continue;
    const question = htmlClean(qm[1]);
    if (!question) continue;

    // Buttons — allow any class containing np-opt (np-correct may appear before or after)
    const optRe = /<button[^>]*class="([^"]*\bnp-opt\b[^"]*)"[\s\S]*?<span>([\s\S]*?)<\/span>\s*<\/button>/g;
    const opts = [];
    let correctIdx = -1, m, idx = 0;
    while ((m = optRe.exec(chunk)) !== null) {
      const classes = m[1] || '';
      const label   = stripOptPrefix(m[2]);
      opts.push(label);
      if (/\bnp-correct\b/.test(classes)) correctIdx = idx;
      idx++;
    }
    if (opts.length < 2 || correctIdx < 0) continue;

    const exMatch = chunk.match(/<(?:p|div)\s+class="np-ex-text"[^>]*>([\s\S]*?)<\/(?:p|div)>/);
    const explanation = exMatch ? htmlClean(exMatch[1]) : '';

    mcqs.push({
      q: question,
      options: opts,
      correct: correctIdx,
      explanation,
    });
  }
  return mcqs.length ? mcqs : null;
}

// Auto-pick best extractor for a HTML page
function extractMCQs(html) {
  return extractFromJSArray(html) || extractFromHTMLCards(html);
}

// ───────────────────── Extractor 3 — Math JSON files ─────────────────────
// Math source: _<topic>_data.json files with {y, q, opts, ci, ans} schema.
// Each file = one topic. We also try to merge `_<topic>_explanations.json`.
function extractMathTopics(subjectDir) {
  if (!fs.existsSync(subjectDir)) return [];
  const files = fs.readdirSync(subjectDir).filter(f => /^_[a-z0-9]+_data\.json$/.test(f));
  const topics = [];

  for (const file of files) {
    const slug = file.replace(/^_/, '').replace(/_data\.json$/, '');
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(subjectDir, file), 'utf8')); }
    catch { continue; }
    if (!Array.isArray(data) || data.length === 0) continue;

    // Try paired explanations file
    let expls = {};
    const exPath = path.join(subjectDir, `_${slug}_explanations.json`);
    if (fs.existsSync(exPath)) {
      try {
        const ex = JSON.parse(fs.readFileSync(exPath, 'utf8'));
        if (Array.isArray(ex)) ex.forEach((e, i) => { expls[i] = e.e || e.explanation || ''; });
        else if (typeof ex === 'object') expls = ex;
      } catch {}
    }

    const mcqs = data.map((item, i) => ({
      q:           item.q || '',
      options:     item.opts || item.options || [],
      correct:     typeof item.ci === 'number' ? item.ci : (item.correct ?? 0),
      explanation: expls[i] || item.explanation || '',
      year:        item.y,
      answer:      item.ans,
    })).filter(m => m.q && m.options.length >= 2);

    if (mcqs.length) topics.push({ slug, mcqs });
  }
  return topics;
}

// ───────────────────── Writers ─────────────────────
function writeSubjectMeta(subject) {
  const dir = path.join(CONTENT_ROOT, subject.id);
  fs.mkdirSync(dir, { recursive: true });
  const meta = {
    name: subject.name,
    icon: subject.icon,
    order: subject.order,
    description: subject.description,
    color: subject.color || '#0d4a28',
    category: subject.category || 'one-paper',
  };
  if (subject.placeholder) meta.placeholder = true;
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify(meta, null, 2));
}

function normaliseMCQ(item, topicId, idx) {
  const prefix = topicId.replace(/[^a-z]/g, '').slice(0, 6) || 'mcq';
  return {
    id: `${prefix}-${String(idx + 1).padStart(3, '0')}`,
    q: String(item.q || '').trim(),
    options: (item.options || []).map(o => String(o).trim()),
    correct: typeof item.correct === 'number' ? item.correct : 0,
    explanation: String(item.explanation || '').trim(),
    tags: [],
  };
}

function writeTopicFile(subject, topicSlug, mcqs) {
  const dir = path.join(CONTENT_ROOT, subject.id);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${topicSlug}.json`);

  let version = 1;
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      version = (existing.version || 0) + 1;
    } catch {}
  }

  const out = {
    topic_id: topicSlug,
    topic_name: prettify(topicSlug),
    subject: subject.id,
    version,
    updated_at: new Date().toISOString().slice(0, 10),
    description: `${prettify(topicSlug)} MCQs for PPSC, FPSC, NTS, CSS & PMS.`,
    icon: '📄',
    mcqs: mcqs.map((m, i) => normaliseMCQ(m, topicSlug, i)),
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  return { count: out.mcqs.length, version };
}

// ───────────────────── Main ─────────────────────
const argSubject = (process.argv.find(a => a.startsWith('--subject=')) || '').split('=')[1];

console.log('🚀 QuizWing — full content migration\n');
console.log(`   Source: ${PAGES_ROOT}`);
console.log(`   Output: ${CONTENT_ROOT}\n`);

let totalMCQs = 0, totalFiles = 0, totalSubjects = 0;

for (const [key, subject] of Object.entries(SUBJECTS)) {
  if (argSubject && argSubject !== subject.id) continue;

  if (subject.placeholder) {
    writeSubjectMeta(subject);
    totalSubjects += 1;
    console.log(`✏️  placeholder: ${subject.name}`);
    continue;
  }

  const subjectDir = path.join(PAGES_ROOT, subject.folder);
  if (!fs.existsSync(subjectDir)) {
    console.log(`⏭️  skip ${subject.id} — folder missing (${subject.folder})`);
    continue;
  }

  console.log(`\n▼ ${subject.name}  [${subject.category}]`);
  writeSubjectMeta(subject);
  totalSubjects += 1;

  // ─ Math: read JSON files directly ─
  if (subject.extractor === 'math-json') {
    const topics = extractMathTopics(subjectDir);
    for (const t of topics) {
      const { count, version } = writeTopicFile(subject, t.slug, t.mcqs);
      totalMCQs += count; totalFiles += 1;
      console.log(`   ✅ wrote  ${t.slug}.json  (${count} MCQs, v${version})`);
    }
    continue;
  }

  // ─ HTML topic folders (default) ─
  const entries = fs.readdirSync(subjectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const topicSlug = entry.name;
    const htmlPath = path.join(subjectDir, topicSlug, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf8');
    const data = extractMCQs(html);
    if (!data || data.length === 0) {
      console.log(`   ⚠️  skip   ${topicSlug} — no MCQs found`);
      continue;
    }
    const { count, version } = writeTopicFile(subject, topicSlug, data);
    totalMCQs += count; totalFiles += 1;
    console.log(`   ✅ wrote  ${topicSlug}.json  (${count} MCQs, v${version})`);
  }
}

console.log(`\n✨ Done.`);
console.log(`   ${totalSubjects} subjects · ${totalFiles} topic files · ${totalMCQs} MCQs`);
console.log(`\nNext: node scripts/manifest.js`);
