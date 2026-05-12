#!/usr/bin/env node
/**
 * QuizWing — One-time MCQ migration script
 *
 * Reads every existing HTML MCQ page in ../../../pages/ and converts the
 * embedded JavaScript MCQ arrays into clean JSON files under content/.
 *
 * Usage:
 *   cd mobile-app/content-repo
 *   node scripts/migrate.js
 *
 * This is idempotent — safe to re-run. It will overwrite topic JSON files
 * with the latest content from the HTML pages.
 */

const fs = require('fs');
const path = require('path');

// ---------- Configuration ----------
const PAGES_ROOT = path.resolve(__dirname, '../../../pages/one-paper-mcqs');
const CONTENT_ROOT = path.resolve(__dirname, '../content');

// Topic mappings: which HTML folder → which subject slug + topic id + icon
const TOPICS = [
  // Everyday Science
  { folder: 'everyday-science/atmosphere-winds-earth-structure',     subject: 'everyday-science', id: 'atmosphere-winds-earth-structure',     name: 'Atmosphere, Winds & Earth Structure', icon: '🌍' },
  { folder: 'everyday-science/natural-hazards-disasters-energy-resources', subject: 'everyday-science', id: 'natural-hazards-disasters-energy-resources', name: 'Natural Hazards, Disasters & Energy Resources', icon: '⚡' },
  { folder: 'everyday-science/rocks-and-types',                     subject: 'everyday-science', id: 'rocks-and-types',                     name: 'Rocks & Their Types',                  icon: '🪨' },
  { folder: 'everyday-science/scientific-instruments-and-measurements', subject: 'everyday-science', id: 'scientific-instruments-and-measurements', name: 'Scientific Instruments & Measurements', icon: '🔬' },
  { folder: 'everyday-science/solar-system-and-the-sun',            subject: 'everyday-science', id: 'solar-system-and-the-sun',            name: 'Solar System & the Sun',               icon: '☀️' },
  { folder: 'everyday-science/planets',                             subject: 'everyday-science', id: 'planets',                             name: 'Planets',                              icon: '🪐' },
  { folder: 'everyday-science/galaxies',                            subject: 'everyday-science', id: 'galaxies',                            name: 'Galaxies',                             icon: '🌌' },
  { folder: 'everyday-science/basic-chemistry-and-periodic-table',  subject: 'everyday-science', id: 'basic-chemistry-and-periodic-table',  name: 'Basic Chemistry & Periodic Table',     icon: '🧪' },
  { folder: 'everyday-science/atoms-radioactivity-and-reactions',   subject: 'everyday-science', id: 'atoms-radioactivity-and-reactions',   name: 'Atoms, Radioactivity & Reactions',     icon: '⚛️' },
  { folder: 'everyday-science/elements-metals-materials-and-chemicals', subject: 'everyday-science', id: 'elements-metals-materials-and-chemicals', name: 'Elements, Metals, Materials & Chemicals', icon: '⚒️' },
  { folder: 'everyday-science/human-body-system-and-organs',        subject: 'everyday-science', id: 'human-body-system-and-organs',        name: 'Human Body System & Organs',           icon: '🫀' },
  { folder: 'everyday-science/vitamins',                            subject: 'everyday-science', id: 'vitamins',                            name: 'Vitamins',                             icon: '💊' },
  { folder: 'everyday-science/diseases-and-vaccines',               subject: 'everyday-science', id: 'diseases-and-vaccines',               name: 'Diseases & Vaccines',                  icon: '🦠' },
  { folder: 'everyday-science/inventions-inventors-discoveries-discoverers', subject: 'everyday-science', id: 'inventions-inventors-discoveries-discoverers', name: 'Inventions, Inventors, Discoveries & Discoverers', icon: '💡' },
  { folder: 'everyday-science/timeline-of-scientific-discoveries',  subject: 'everyday-science', id: 'timeline-of-scientific-discoveries',  name: 'Timeline of Scientific Discoveries',   icon: '🗓️' },

  // Computer Science cluster — add when migrating
  // { folder: 'computer-science-mcqs/introduction-generations-of-computers', subject: 'computer-science', id: 'introduction-generations-of-computers', name: 'Introduction & Generations of Computers', icon: '💻' },
  // ... etc
];

// Subject-level metadata
const SUBJECTS = {
  'everyday-science': {
    name: 'Everyday Science',
    icon: '🔬',
    order: 1,
    description: 'Physics, Chemistry, Biology, Astronomy, Human Body, Diseases & Inventions for PPSC, FPSC, NTS, CSS, PMS, MDCAT.',
  },
  'computer-science': {
    name: 'Computer Science',
    icon: '💻',
    order: 2,
    description: 'Computer fundamentals, hardware, software, networks, internet & IT for PPSC, FPSC, NTS, CSS.',
  },
  'css-pms': {
    name: 'CSS & PMS',
    icon: '🏛️',
    order: 3,
    description: 'CSS Screening, PMS, MPT — General Science & Ability + subject papers.',
  },
  'fia': {
    name: 'FIA Past Papers',
    icon: '🛡️',
    order: 4,
    description: 'Solved past papers for FIA Constable, ASI, Sub Inspector, Inspector & AD.',
  },
};

// ---------- Helpers ----------

/** Extract the `var xxxData = [...]` array from an HTML file. */
function extractMCQArray(html) {
  // Match var <prefix>Data=[...]; — handle multi-line
  const re = /var\s+([a-zA-Z]+)Data\s*=\s*(\[[\s\S]*?\n\]);/;
  const m = html.match(re);
  if (!m) return null;

  const arrayLiteral = m[2];
  // Convert JS object literal to JSON by tweaking unquoted keys and trailing commas
  // BUT: the originals use proper JS object literal syntax (q:, options:, correct:, rationale:)
  // So we eval it safely instead of writing a fragile regex parser.
  try {
    // eslint-disable-next-line no-new-func
    const data = new Function('return ' + arrayLiteral)();
    return { prefix: m[1], data };
  } catch (err) {
    console.error('  ⚠️  parse error:', err.message);
    return null;
  }
}

/** Convert an MCQ object from the HTML format to the GitHub JSON schema. */
function normaliseMCQ(item, topicId, idx) {
  return {
    id: `${topicId.slice(0, 6)}-${String(idx + 1).padStart(3, '0')}`,
    q: item.q.trim(),
    options: item.options || item.opts || [],
    correct: typeof item.correct === 'number' ? item.correct : (item.c ?? 0),
    explanation: (item.rationale || item.explanation || '').trim(),
    tags: [],
  };
}

/** Write the topic JSON file. */
function writeTopicFile(topic, mcqs) {
  const subjectDir = path.join(CONTENT_ROOT, topic.subject);
  fs.mkdirSync(subjectDir, { recursive: true });
  const outPath = path.join(subjectDir, `${topic.id}.json`);

  // Bump version if file already exists, else start at 1
  let version = 1;
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      version = (existing.version || 0) + 1;
    } catch {}
  }

  const out = {
    topic_id: topic.id,
    topic_name: topic.name,
    subject: topic.subject,
    version,
    updated_at: new Date().toISOString().slice(0, 10),
    description: `${topic.name} MCQs for PPSC, FPSC, NTS, CSS & PMS preparation.`,
    icon: topic.icon,
    mcqs: mcqs.map((m, i) => normaliseMCQ(m, topic.id, i)),
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  return { outPath, count: out.mcqs.length, version };
}

/** Write the _meta.json for a subject. */
function writeSubjectMeta(subject) {
  const dir = path.join(CONTENT_ROOT, subject);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, '_meta.json');
  if (fs.existsSync(metaPath)) return;
  fs.writeFileSync(metaPath, JSON.stringify(SUBJECTS[subject] || { name: subject, order: 99 }, null, 2));
}

// ---------- Main ----------
let totalMCQs = 0, totalFiles = 0;

console.log('🚀 QuizWing MCQ migration — HTML → JSON\n');
console.log(`   Source: ${PAGES_ROOT}`);
console.log(`   Output: ${CONTENT_ROOT}\n`);

const seenSubjects = new Set();
for (const topic of TOPICS) {
  const htmlPath = path.join(PAGES_ROOT, topic.folder, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.log(`⏭️  skip   ${topic.id} — no HTML found at ${htmlPath}`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const result = extractMCQArray(html);
  if (!result || !Array.isArray(result.data) || result.data.length === 0) {
    console.log(`⚠️  empty  ${topic.id} — couldn't extract MCQ array`);
    continue;
  }

  // Ensure subject _meta.json exists
  if (!seenSubjects.has(topic.subject)) {
    writeSubjectMeta(topic.subject);
    seenSubjects.add(topic.subject);
  }

  const { count, version } = writeTopicFile(topic, result.data);
  totalMCQs += count;
  totalFiles += 1;
  console.log(`✅ wrote  ${topic.subject}/${topic.id}.json  (${count} MCQs, v${version})`);
}

console.log(`\n✨ Done. ${totalFiles} topic files, ${totalMCQs} MCQs migrated to ${CONTENT_ROOT}`);
console.log('\nNext step: run  node scripts/manifest.js  to generate the master manifest.');
