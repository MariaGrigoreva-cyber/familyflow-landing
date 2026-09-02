// Аккуратное обновление public/sitemap.xml.
// Существующие <url> сохраняются целиком (вместе с changefreq/priority и чем
// угодно ещё внутри блока) — мы только добавляем новые и обновляем lastmod
// у своих. Ничего из уже проиндексированного не теряется.
'use strict';

const fs = require('node:fs/promises');

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const FOOTER = '</urlset>';

function parseUrlBlocks(xml) {
  const blocks = [];
  const re = /<url\b[\s\S]*?<\/url>/g;
  let match;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const loc = /<loc>([\s\S]*?)<\/loc>/.exec(block)?.[1]?.trim();
    if (loc) blocks.push({ loc, block });
  }
  return blocks;
}

function renderBlock(loc, lastmod) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
}

function withLastmod(block, lastmod) {
  if (/<lastmod>[\s\S]*?<\/lastmod>/.test(block)) {
    return block.replace(/<lastmod>[\s\S]*?<\/lastmod>/, () => `<lastmod>${lastmod}</lastmod>`);
  }
  return block.replace(/<\/loc>/, () => `</loc>\n    <lastmod>${lastmod}</lastmod>`);
}

// Блок сохраняется как есть (включая любые свои теги), выравнивается только
// первая строка — под отступ внутри <urlset>.
function indentBlock(block) {
  return block
    .trim()
    .split('\n')
    .map((line, i) => (i === 0 ? `  ${line.trim()}` : line.replace(/\s+$/, '')))
    .join('\n');
}

// entries: [{ loc, lastmod }]
function updateSitemapXml(existingXml, entries) {
  const blocks = existingXml ? parseUrlBlocks(existingXml) : [];
  const byLoc = new Map(blocks.map((item) => [item.loc, item]));

  for (const { loc, lastmod } of entries) {
    const existing = byLoc.get(loc);
    if (existing) {
      existing.block = withLastmod(existing.block, lastmod);
    } else {
      const added = { loc, block: renderBlock(loc, lastmod) };
      blocks.push(added);
      byLoc.set(loc, added);
    }
  }

  const body = blocks.map((item) => indentBlock(item.block)).join('\n');

  return `${HEADER}\n${body}\n${FOOTER}\n`;
}

async function readSitemap(sitemapPath) {
  try {
    return await fs.readFile(sitemapPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Не удалось прочитать ${sitemapPath}: ${err.message}`);
  }
}

module.exports = { updateSitemapXml, readSitemap, parseUrlBlocks };
