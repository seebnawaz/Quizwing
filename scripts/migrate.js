#!/usr/bin/env node
/**
 * QuizWing — Full content migration: HTML → JSON
 *
 * Walks the entire pages/one-paper-mcqs/ tree and converts every
 * embedded `var xxxData = [...]` MCQ array into clean JSON files
 * organised by subject.
 *
 * Usage:
 *   node scripts/migrate.js               # migrate everything
 *   node scripts/migrate.js --subject=X   # migrate one subject only
 *
 * Idempotent — re-running bumps version numbers automatically.
 */

const fs = require('fs');
const path = require('path');

const PAGES_ROOT   = path.resolve(__dirname, '../../../pages/one-paper-mcqs');
const CONTENT_ROOT = path.resolve(__dirname, '../content');

// ---------------- Subject taxonomy ----------------
// Map: HTML folder name → app subject metadata
const SUBJECTS = {
  'everyday-science': {
    folder: 'everyday-science',
    id: 'everyday-science',
    name: 'Everyday Science',
    icon: '🔬',
    order: 1,
    description: 'Physics, Chemistry, Biology, Astronomy, Human Body, Diseases & Inventions for PPSC, FPSC, NTS, CSS, PMS, MDCAT.',
    color: '#0d4a28',
  },
  'computer-science-mcqs': {
    folder: 'computer-science-mcqs',
    id: 'computer-science',
    name: 'Computer Science',
    icon: '💻',
    order: 2,
    description: 'Computer fundamentals, CPU, networks, internet, AI, databases & famous scientists for PPSC, FPSC, NTS, CSS.',
    color: '#1e40af',
  },
  'current-affairs-mcqs': {
    folder: 'current-affairs-mcqs',
    id: 'current-affairs',
    name: 'Current Affairs',
    icon: '📰',
    order: 3,
    description: 'Pakistan + International current affairs 2024–2026 — elections, conflicts, treaties, awards, sports.',
    color: '#b91c1c',
  },
  'general-knowledge-mcqs': {
    folder: 'general-knowledge-mcqs',
    id: 'general-knowledge',
    name: 'General Knowledge',
    icon: '🌍',
    order: 4,
    description: 'World history, geography, countries & capitals, wars, empires and exploration.',
    color: '#7c3aed',
  },
  // Hub-only subjects (no topic content yet) — surface as coming-soon
  'pakistan-studies-mcqs': {
    folder: 'pakistan-studies-mcqs',
    id: 'pakistan-studies',
    name: 'Pakistan Studies',
    icon: '🇵🇰',
    order: 5,
    description: 'Pakistan movement, Quaid-e-Azam, constitution, history & political development.',
    color: '#15803d',
    placeholder: true,
  },
  'islamic-studies-mcqs': {
    folder: 'islamic-studies-mcqs',
    id: 'islamic-studies',
    name: 'Islamic Studies',
    icon: '🕌',
    order: 6,
    description: 'Quran, Hadith, Prophet (PBUH), Caliphs, Islamic history & jurisprudence.',
    color: '#0e7490',
    placeholder: true,
  },
  'english-mcqs': {
    folder: 'english-mcqs',
    id: 'english',
    name: 'English',
    icon: '📖',
    order: 7,
    description: 'Grammar, vocabulary, synonyms, antonyms, idioms, prepositions & comprehension.',
    color: '#be185d',
    placeholder: true,
  },
  'mathematics-mcqs': {
    folder: 'mathematics-mcqs',
    id: 'mathematics',
    name: 'Mathematics',
    icon: '📐',
    order: 8,
    description: 'Arithmetic, algebra, geometry, percentages, ratios, averages & word problems.',
    color: '#c2410c',
    placeholder: true,
  },
  'geography-mcqs': {
    folder: 'geography-mcqs',
    id: 'geography',
    name: 'Geography',
    icon: '🗺️',
    order: 9,
    description: 'Physical, political & economic geography of Pakistan and the world.',
    color: '#0f766e',
    placeholder: true,
  },
  'urdu-mcqs': {
    folder: 'urdu-mcqs',
    id: 'urdu',
    name: 'Urdu',
    icon: '✍️',
    order: 10,
    description: 'Urdu grammar, idioms, poets, prose, literature & sentence construction.',
    color: '#7e22ce',
    placeholder: true,
  },
};

// Per-topic icon overrides (otherwise inferred from name)
const TOPIC_ICONS = {
  // Everyday Science
  'planets': '🪐', 'galaxies': '🌌', 'solar-system-and-the-sun': '☀️',
  'atoms-radioactivity-and-reactions': '⚛️',
  'basic-chemistry-and-periodic-table': '🧪',
  'elements-metals-materials-and-chemicals': '⚒️',
  'human-body-system-and-organs': '🫀',
  'vitamins': '💊', 'diseases-and-vaccines': '🦠',
  'inventions-inventors-discoveries-discoverers': '💡',
  'timeline-of-scientific-discoveries': '🗓️',
  'atmosphere-winds-earth-structure': '🌍',
  'natural-hazards-disasters-energy-resources': '⚡',
  'rocks-and-types': '🪨',
  'scientific-instruments-and-measurements': '🔭',
  // Computer Science
  'introduction-generations-of-computers': '🖥️',
  'types-of-computers-input-output-devices': '🖱️',
  'cpu-memory-storage-devices': '💾',
  'languages-of-computer': '⌨️',
  'operating-system': '🪟',
  'software-and-hardware': '🧰',
  'computer-networks': '🌐',
  'internet-email-communications': '📧',
  'network-security-encryption-viruses': '🔐',
  'artificial-intelligence-cloud-computing-it': '🤖',
  'database-systems': '🗄️',
  'management-information-systems': '📊',
  'famous-computer-scientists': '👨‍💻',
  'firsts-in-computer-science': '🥇',
  'inventors-and-their-inventions': '💡',
  // Current Affairs
  '26th-constitutional-amendment': '⚖️', '27th-constitutional-amendment': '⚖️',
  'afghanistan-pakistan-conflict-2025': '🇦🇫',
  'broader-international-current-affairs': '🌐',
  'gaza-peace-plan-2025': '🕊️',
  'general-and-presidential-elections-2024': '🗳️',
  'international-current-affairs-2025': '🌍',
  'iran-israel-war-2025': '⚔️',
  'kashmir-siachen-and-sir-creek': '🏔️',
  'nobel-prizes-and-2025-winners': '🏆',
  'obituaries-2025': '🕊️',
  'operation-bunyan-al-marsoos-and-icube-qamar': '🚀',
  'other-international-awards-and-prizes': '🏅',
  'pahalgam-attack-and-india-pakistan-crisis-2025': '⚠️',
  'pakistan-national-current-affairs-2025': '🇵🇰',
  'palestine-israel-issue': '🇵🇸',
  'russia-ukraine-war-and-sudan-civil-war': '🛡️',
  'sports-national-and-international': '⚽',
  'uno-and-other-organizations': '🇺🇳',
  'world-organizations-and-headquarters': '🏢',
  // General Knowledge
  'american-history': '🇺🇸', 'arab-spring': '🌅',
  'asian-history': '🌏', 'cold-war-and-nuclear-era': '☢️',
  'countries-and-capitals': '🏛️', 'early-human-history': '🏺',
  'early-kingdoms-and-empires': '👑', 'european-history': '🇪🇺',
  'exploration-and-colonization': '🧭',
  'middle-east-history': '🕌', 'oceans-and-seas': '🌊',
  'ottoman-empire-turkiye': '🏛️',
  'secret-intelligence-agencies': '🕵️',
  'ussr-russia-history': '🇷🇺',
  'world-war-i-and-ii': '🪖',
};

function prettify(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAnd\b/g, '&')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bIn\b/g, 'in')
    .replace(/\bA\b/g, 'a')
    .replace(/^./, c => c.toUpperCase());
}

function extractMCQs(html) {
  // Find any `var xxxData = [...]; ` block (the convention across all our pages)
  const re = /var\s+([a-zA-Z_]+)Data\s*=\s*(\[[\s\S]*?\n\]);/;
  const m = html.match(re);
  if (!m) return null;
  try {
    // eslint-disable-next-line no-new-func
    const data = new Function('return ' + m[2])();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function normaliseMCQ(item, topicId, idx) {
  // Build a short, stable prefix from the topic ID
  const prefix = topicId.replace(/[^a-z]/g, '').slice(0, 6) || 'mcq';
  return {
    id: `${prefix}-${String(idx + 1).padStart(3, '0')}`,
    q: String(item.q || item.question || '').trim(),
    options: item.options || item.opts || [],
    correct: typeof item.correct === 'number' ? item.correct : (item.c ?? 0),
    explanation: String(item.rationale || item.explanation || '').trim(),
    tags: [],
  };
}

function writeSubjectMeta(subject) {
  const dir = path.join(CONTENT_ROOT, subject.id);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, '_meta.json');
  const meta = {
    name: subject.name,
    icon: subject.icon,
    order: subject.order,
    description: subject.description,
    color: subject.color || '#0d4a28',
  };
  if (subject.placeholder) meta.placeholder = true;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
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
    icon: TOPIC_ICONS[topicSlug] || '📄',
    mcqs: mcqs.map((m, i) => normaliseMCQ(m, topicSlug, i)),
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  return { count: out.mcqs.length, version };
}

// ---------------- Main ----------------
const argSubject = (process.argv.find(a => a.startsWith('--subject=')) || '').split('=')[1];

console.log('🚀 QuizWing — full content migration\n');
console.log(`   Source: ${PAGES_ROOT}`);
console.log(`   Output: ${CONTENT_ROOT}\n`);

let totalMCQs = 0, totalFiles = 0, totalSubjects = 0;

for (const [folderName, subject] of Object.entries(SUBJECTS)) {
  if (argSubject && argSubject !== subject.id) continue;
  if (subject.placeholder) {
    // For placeholder subjects, write the _meta.json so the app can show
    // "Coming soon" but skip topic extraction.
    writeSubjectMeta(subject);
    totalSubjects += 1;
    console.log(`✏️  placeholder: ${subject.name} (no MCQ content yet)`);
    continue;
  }

  const subjectDir = path.join(PAGES_ROOT, folderName);
  if (!fs.existsSync(subjectDir)) {
    console.log(`⏭️  skip subject ${subject.id} — folder missing`);
    continue;
  }

  console.log(`\n▼ ${subject.name}`);
  writeSubjectMeta(subject);
  totalSubjects += 1;

  const entries = fs.readdirSync(subjectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const topicSlug = entry.name;
    const htmlPath = path.join(subjectDir, topicSlug, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf8');
    const data = extractMCQs(html);
    if (!data) {
      console.log(`   ⚠️  skip   ${topicSlug} — no MCQ array found`);
      continue;
    }

    const { count, version } = writeTopicFile(subject, topicSlug, data);
    totalMCQs += count;
    totalFiles += 1;
    console.log(`   ✅ wrote  ${topicSlug}.json  (${count} MCQs, v${version})`);
  }
}

console.log(`\n✨ Done.`);
console.log(`   ${totalSubjects} subjects · ${totalFiles} topic files · ${totalMCQs} MCQs`);
console.log(`\nNext: node scripts/manifest.js`);
