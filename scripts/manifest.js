#!/usr/bin/env node
/**
 * QuizWing — Manifest generator
 *
 * Scans content/ and produces content/manifest.json — the master index
 * the Flutter app reads on every launch to know what's available and
 * which topics have new versions.
 *
 * Runs automatically via GitHub Action on every push, but you can also
 * run locally:
 *   node scripts/manifest.js
 */

const fs = require('fs');
const path = require('path');

const CONTENT_ROOT = path.resolve(__dirname, '../content');
const MANIFEST_PATH = path.join(CONTENT_ROOT, 'manifest.json');

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const subjects = [];

// Discover subjects = top-level folders inside content/
const subjectDirs = fs.readdirSync(CONTENT_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

for (const subjectId of subjectDirs) {
  const subjectPath = path.join(CONTENT_ROOT, subjectId);
  const meta = loadJson(path.join(subjectPath, '_meta.json')) || { name: subjectId, order: 99 };

  // Discover topic files
  const topicFiles = fs.readdirSync(subjectPath)
    .filter(f => f.endsWith('.json') && f !== '_meta.json')
    .sort();

  const topics = [];
  for (const file of topicFiles) {
    const data = loadJson(path.join(subjectPath, file));
    if (!data) continue;
    topics.push({
      id: data.topic_id,
      name: data.topic_name,
      icon: data.icon || '',
      version: data.version || 1,
      mcq_count: (data.mcqs || []).length,
      updated_at: data.updated_at,
      url: `content/${subjectId}/${file}`,
    });
  }

  subjects.push({
    id: subjectId,
    name: meta.name,
    icon: meta.icon || '',
    order: meta.order ?? 99,
    description: meta.description || '',
    topic_count: topics.length,
    total_mcqs: topics.reduce((s, t) => s + t.mcq_count, 0),
    topics,
  });
}

subjects.sort((a, b) => a.order - b.order);

const manifest = {
  schema_version: 1,
  app_min_version: '1.0.0',
  generated_at: new Date().toISOString(),
  subjects,
  totals: {
    subjects: subjects.length,
    topics: subjects.reduce((s, x) => s + x.topic_count, 0),
    mcqs: subjects.reduce((s, x) => s + x.total_mcqs, 0),
  },
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

console.log(`✨ Manifest written → ${MANIFEST_PATH}`);
console.log(`   ${manifest.totals.subjects} subjects · ${manifest.totals.topics} topics · ${manifest.totals.mcqs} MCQs`);
