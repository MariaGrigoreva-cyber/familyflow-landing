#!/usr/bin/env node
// Пересборка всей статики блога из источников content/blog/*.json.
//
//   npm run blog:rebuild
//
// Источник правды — content/blog/<slug>.json. Отсюда собираются страницы статей,
// post.json, индекс блога, блок на главной и sitemap. Нужна после правки текста
// статьи, шаблонов или вёрстки карточек — гонять платный npm run blog ради этого
// незачем.
//
// Команда полностью офлайновая: не обращается к OpenAI, не требует
// OPENAI_API_KEY, не генерирует и не трогает картинки, ничего не удаляет и не
// пишет в content/ — источники только читаются.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// SITE_URL и APP_URL можно переопределить в .env, как и для генератора. dotenv
// живёт в devDependencies, поэтому на проде (npm install --omit=dev) его нет —
// там просто берутся значения по умолчанию, и команда всё равно работает.
try {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
} catch {
  /* dotenv не установлен — не страшно, ниже есть дефолты */
}

const render = require('./blog/render');
const sourceStore = require('./blog/source');
const { updateSitemapXml, readSitemap } = require('./blog/sitemap');

const DEFAULTS = {
  SITE_URL: 'https://myfamilyflow.ru',
  APP_URL: 'https://app.myfamilyflow.ru',
};

const PATHS = {
  articleTemplate: path.join(ROOT, 'templates', 'article.html'),
  blogIndexTemplate: path.join(ROOT, 'templates', 'blog-index.html'),
  homeTeaserTemplate: path.join(ROOT, 'templates', 'home-teaser.html'),
  contentBlogDir: path.join(ROOT, 'content', 'blog'),
  blogDir: path.join(ROOT, 'public', 'blog'),
  blogIndexJson: path.join(ROOT, 'public', 'blog', 'index.json'),
  blogIndexHtml: path.join(ROOT, 'public', 'blog', 'index.html'),
  homeIndexHtml: path.join(ROOT, 'public', 'index.html'),
  sitemap: path.join(ROOT, 'public', 'sitemap.xml'),
};

const log = (message = '') => console.log(message);
const step = (message) => console.log(`→ ${message}`);
const done = (message) => console.log(`✓ ${message}`);
const warn = (message) => console.log(`! ${message}`);

class RebuildError extends Error {}

const rel = (filePath) => path.relative(ROOT, filePath);

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readTemplate(filePath, label) {
  const contents = await readFileOrNull(filePath);
  if (contents === null) throw new RebuildError(`Не найден ${label}: ${rel(filePath)}`);
  return contents;
}

const exists = (filePath) => fs.access(filePath).then(() => true, () => false);

// Читаем и проверяем все источники разом. Одна битая статья останавливает всю
// пересборку: лучше понятная ошибка, чем наполовину обновлённый блог.
async function loadSources() {
  const files = await sourceStore.listSourceFiles(PATHS.contentBlogDir);
  if (files.length === 0) {
    throw new RebuildError(
      `Нет источников в ${rel(PATHS.contentBlogDir)}. Сгенерируйте статью (npm run blog) ` +
      'или перенесите существующую (npm run blog:migrate).'
    );
  }

  const problems = [];
  const sources = [];
  const seenSlugs = new Map();

  for (const file of files) {
    const label = `content/blog/${path.basename(file)}`;
    let source;
    try {
      source = await sourceStore.readSource(file);
    } catch (error) {
      problems.push(`${label}: ${error.message}`);
      continue;
    }

    const found = sourceStore.validateSource(source, label);
    problems.push(...found);
    if (found.length > 0) continue;

    // Имя файла — часть адреса статьи, рассинхрон с полем slug ловим сразу.
    const expected = `${source.slug}.json`;
    if (path.basename(file) !== expected) {
      problems.push(`${label}: slug «${source.slug}» не совпадает с именем файла (ожидалось ${expected})`);
      continue;
    }
    if (seenSlugs.has(source.slug)) {
      problems.push(`${label}: slug «${source.slug}» уже встречался`);
      continue;
    }
    seenSlugs.set(source.slug, file);
    sources.push(source);
  }

  if (problems.length > 0) {
    throw new RebuildError(
      `Источники не прошли проверку:\n  - ${problems.join('\n  - ')}\n\n` +
      'Исправьте content/blog вручную — автоматически ничего не меняю. Ничего не перезаписано.'
    );
  }

  return sources;
}

// Картинки — единственное, что пересборка сделать не может: их генерирует
// платный npm run blog. Поэтому просто проверяем, что все файлы на месте.
async function assertImagesPresent(sources) {
  const missing = [];

  for (const source of sources) {
    for (const image of source.images) {
      const file = path.join(PATHS.blogDir, source.slug, image.file);
      if (!(await exists(file))) missing.push(rel(file));
    }
  }

  if (missing.length > 0) {
    throw new RebuildError(
      `Не хватает изображений:\n  - ${missing.join('\n  - ')}\n\n` +
      'Пересборка их не создаёт — это делает только npm run blog. Ничего не перезаписано.'
    );
  }
}

const byDateDesc = (a, b) => {
  const left = a.published_at || a.created_at;
  const right = b.published_at || b.created_at;
  if (left === right) return a.slug.localeCompare(b.slug);
  return right.localeCompare(left);
};

async function main() {
  const siteUrl = process.env.SITE_URL || DEFAULTS.SITE_URL;
  const appUrl = process.env.APP_URL || DEFAULTS.APP_URL;

  step(`Читаю источники из ${rel(PATHS.contentBlogDir)}...`);
  const sources = await loadSources();
  const published = sources.filter((source) => source.status === 'published').sort(byDateDesc);
  const drafts = sources.filter((source) => source.status !== 'published');

  done(`источников: ${sources.length} (published: ${published.length}, draft: ${drafts.length})`);
  for (const draft of drafts) warn(`${draft.slug} — status: ${draft.status}, в публичные файлы не попадёт`);

  if (published.length === 0) {
    throw new RebuildError('Ни одного источника со статусом published — публиковать нечего. Ничего не перезаписано.');
  }

  const [articleTemplate, blogIndexTemplate, homeTeaserTemplate] = await Promise.all([
    readTemplate(PATHS.articleTemplate, 'шаблон статьи'),
    readTemplate(PATHS.blogIndexTemplate, 'шаблон страницы блога'),
    readTemplate(PATHS.homeTeaserTemplate, 'шаблон блока для главной'),
  ]);

  await assertImagesPresent(published);

  // Сначала рендерим всё в память и только потом пишем: ошибка на середине не
  // оставит блог в смешанном состоянии из старых и новых файлов.
  const pages = published.map((source) => ({
    slug: source.slug,
    dir: path.join(PATHS.blogDir, source.slug),
    html: render.renderArticleHtml({ source, template: articleTemplate, siteUrl, appUrl }),
    post: render.buildPost({ source }),
  }));

  const index = pages.map((page) => render.buildIndexEntry(page.post));
  const blogIndexHtml = render.renderBlogIndexHtml({
    posts: index,
    template: blogIndexTemplate,
    siteUrl,
    appUrl,
  });

  const homeHtml = await readFileOrNull(PATHS.homeIndexHtml);
  if (homeHtml === null) throw new RebuildError(`Не найден ${rel(PATHS.homeIndexHtml)}`);
  const updatedHome = render.replaceHomeTeaser(
    homeHtml,
    render.renderHomeTeaser({ posts: index, template: homeTeaserTemplate })
  );

  const sitemapEntries = [
    { loc: `${siteUrl}/blog/`, lastmod: index[0].date },
    ...published.map((source) => ({
      loc: `${siteUrl}/blog/${source.slug}/`,
      lastmod: source.published_at || source.created_at,
    })),
  ];
  const sitemap = updateSitemapXml(await readSitemap(PATHS.sitemap), sitemapEntries);

  // Записи атомарные (временный файл + rename), поэтому оборваться на середине
  // внутри файла невозможно.
  for (const page of pages) {
    await fs.mkdir(page.dir, { recursive: true });
    await render.writeFileAtomic(path.join(page.dir, 'index.html'), page.html);
    await render.writeFileAtomic(path.join(page.dir, 'post.json'), `${JSON.stringify(page.post, null, 2)}\n`);
    done(`public/blog/${page.slug}/ — index.html и post.json пересобраны`);
  }

  await render.writeFileAtomic(PATHS.blogIndexJson, `${JSON.stringify(index, null, 2)}\n`);
  done(`public/blog/index.json пересобран (${index.length} ${index.length === 1 ? 'статья' : 'статей'})`);

  await render.writeFileAtomic(PATHS.blogIndexHtml, blogIndexHtml);
  done('public/blog/index.html пересобран');

  if (updatedHome === null) {
    warn('в public/index.html нет маркеров BLOG_TEASER — блок на главной не тронут');
  } else if (updatedHome === homeHtml) {
    done('блок на главной уже актуален');
  } else {
    await render.writeFileAtomic(PATHS.homeIndexHtml, updatedHome);
    done('блок «Полезное о семейных финансах» на главной пересобран');
  }

  await render.writeFileAtomic(PATHS.sitemap, sitemap);
  done('public/sitemap.xml обновлён');

  log('');
  log('DONE');
  log(`${siteUrl}/blog/`);
}

main().catch((error) => {
  if (error instanceof RebuildError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(`\n✗ Пересборка не удалась: ${error.message}`);
  }
  process.exitCode = 1;
});
