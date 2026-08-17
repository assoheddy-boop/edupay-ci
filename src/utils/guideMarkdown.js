const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');

const GUIDES = {
  direction: {
    slug: 'direction',
    file: 'guide-direction.md',
    pdf: 'EduConnect-Guide-direction.pdf',
    title: 'Guide direction',
    audience: 'Direction',
    navLabel: 'Direction',
  },
  parent: {
    slug: 'parent',
    file: 'guide-parent.md',
    pdf: 'EduConnect-Guide-parent.pdf',
    title: 'Guide parent',
    audience: 'Parents',
    navLabel: 'Parent',
  },
  enseignant: {
    slug: 'enseignant',
    file: 'guide-enseignant.md',
    pdf: 'EduConnect-Guide-enseignant.pdf',
    title: 'Guide enseignant',
    audience: 'Enseignants',
    navLabel: 'Enseignant',
  },
};

function listGuides() {
  return Object.values(GUIDES);
}

function getGuideMeta(slug) {
  return GUIDES[slug] || null;
}

function loadMarkdown(slug) {
  const meta = getGuideMeta(slug);
  if (!meta) return null;
  const filePath = path.join(DOCS_DIR, meta.file);
  const markdown = fs.readFileSync(filePath, 'utf8');
  return { ...meta, markdown, filePath };
}

function pdfPath(slug) {
  const meta = getGuideMeta(slug);
  if (!meta) return null;
  return path.join(DOCS_DIR, meta.pdf);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineHtml(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\[([^\]]+)\]\((https?:[^)]+|mailto:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function joinSoftLines(lines) {
  const parts = [];
  let buf = [];
  const flush = () => {
    const s = buf.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (s) parts.push(s);
    buf = [];
  };
  for (const raw of lines) {
    const str = String(raw).replace(/\t+$/g, '');
    const hardBreak = / {2}$/.test(str);
    const line = str.replace(/\s+$/g, '').replace(/[ \t]{2,}/g, ' ').trim();
    if (!line) continue;
    buf.push(line);
    if (hardBreak) flush();
  }
  flush();
  return parts.join('\n');
}

function parseBlocks(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('---')) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (line.startsWith('>')) {
      const raw = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        raw.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const joined = raw.join('\n').trim();
      const match = joined.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/);
      if (match) {
        blocks.push({
          type: 'callout',
          title: match[1].replace(/\s+/g, ' ').trim(),
          text: joinSoftLines(match[2].split('\n')),
        });
      } else {
        blocks.push({ type: 'callout', title: '', text: joinSoftLines(raw) });
      }
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const para = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !lines[i].startsWith('#')
      && !lines[i].startsWith('>')
      && !lines[i].startsWith('---')
      && !/^[-*]\s/.test(lines[i])
      && !/^\d+\.\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', text: joinSoftLines(para) });
  }

  return blocks;
}

function blocksToHtml(blocks) {
  return blocks.map((block) => {
    if (block.type === 'h1') return `<h1>${inlineHtml(block.text)}</h1>`;
    if (block.type === 'h2') return `<h2>${inlineHtml(block.text)}</h2>`;
    if (block.type === 'h3') return `<h3>${inlineHtml(block.text)}</h3>`;
    if (block.type === 'hr') return '<hr>';
    if (block.type === 'p') return `<p>${inlineHtml(block.text)}</p>`;
    if (block.type === 'ul') {
      const items = block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (block.type === 'ol') {
      const items = block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('');
      return `<ol>${items}</ol>`;
    }
    if (block.type === 'callout') {
      const title = block.title ? `<strong>${inlineHtml(block.title)}</strong>` : '';
      const body = block.text ? `<p>${inlineHtml(block.text)}</p>` : '';
      return `<aside class="guide-callout">${title}${body}</aside>`;
    }
    return '';
  }).join('\n');
}

function markdownToHtml(md) {
  return blocksToHtml(parseBlocks(md));
}

module.exports = {
  DOCS_DIR,
  GUIDES,
  listGuides,
  getGuideMeta,
  loadMarkdown,
  pdfPath,
  parseBlocks,
  markdownToHtml,
};
