#!/usr/bin/env node
// Генератор SEO-статей для блога «Семейного потока».
//
//   npm run blog
//   npm run blog -- --topic="Почему денег не хватает даже при нормальной зарплате"
//   npm run blog -- --topic="..." --dry-run
//
// Скрипт полностью изолирован от приложения: он запускается только вручную в
// Node, читает OPENAI_API_KEY из .env и складывает готовую статику в public/blog/.
// Ключ никогда не попадает в src, в бандл и в HTML.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');

const ROOT = path.join(__dirname, '..');

require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const { generateArticle } = require('./blog/text');
const { generateImage } = require('./blog/images');
const render = require('./blog/render');
const { updateSitemapXml, readSitemap } = require('./blog/sitemap');

const DEFAULTS = {
  OPENAI_TEXT_MODEL: 'gpt-5.6-terra',
  OPENAI_IMAGE_MODEL: 'gpt-image-2',
  SITE_URL: 'https://myfamilyflow.ru',
  // Лендинг и приложение живут на разных поддоменах: блог на myfamilyflow.ru,
  // кнопки «Попробовать» ведут в приложение на app.myfamilyflow.ru.
  APP_URL: 'https://app.myfamilyflow.ru',
};

const PATHS = {
  systemPrompt: path.join(ROOT, 'prompts', 'blog', 'system.txt'),
  imageStyle: path.join(ROOT, 'prompts', 'blog', 'image-style.txt'),
  template: path.join(ROOT, 'templates', 'article.html'),
  blogIndexTemplate: path.join(ROOT, 'templates', 'blog-index.html'),
  homeTeaserTemplate: path.join(ROOT, 'templates', 'home-teaser.html'),
  publicDir: path.join(ROOT, 'public'),
  blogDir: path.join(ROOT, 'public', 'blog'),
  blogIndexJson: path.join(ROOT, 'public', 'blog', 'index.json'),
  blogIndexHtml: path.join(ROOT, 'public', 'blog', 'index.html'),
  sitemap: path.join(ROOT, 'public', 'sitemap.xml'),
  homeIndexHtml: path.join(ROOT, 'public', 'index.html'),
};

const log = (message) => console.log(message);
const step = (message) => console.log(`→ ${message}`);
const done = (message) => console.log(`✓ ${message}`);

function parseArgs(argv) {
  const args = { topic: null, dryRun: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--topic=')) args.topic = arg.slice('--topic='.length);
    else if (arg === '--topic') { args.topic = argv[i + 1] ?? null; i += 1; }
  }

  if (typeof args.topic === 'string') args.topic = args.topic.replace(/^["']|["']$/g, '').trim();
  return args;
}

function usage() {
  log(`Генератор статей блога «Семейный поток»

  npm run blog
  npm run blog -- --topic="Тема статьи"
  npm run blog -- --topic="Тема статьи" --dry-run

Опции:
  --topic="..."   тема статьи; без неё скрипт спросит тему в терминале
  --dry-run       только текст: показать статью, не тратить деньги на картинки
                  и ничего не записывать на диск
  --help          эта справка

Переменные окружения (.env):
  OPENAI_API_KEY       обязательно
  OPENAI_TEXT_MODEL    по умолчанию ${DEFAULTS.OPENAI_TEXT_MODEL}
  OPENAI_IMAGE_MODEL   по умолчанию ${DEFAULTS.OPENAI_IMAGE_MODEL}
  SITE_URL             по умолчанию ${DEFAULTS.SITE_URL}
  APP_URL              по умолчанию ${DEFAULTS.APP_URL}`);
}

async function ask(question, hint) {
  if (!process.stdin.isTTY) {
    throw new Error(
      `Нужен ответ на вопрос «${question.trim().replace(/\n/g, ' ')}», но терминал неинтерактивный.` +
      (hint ? ` ${hint}` : '')
    );
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(filePath, label) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    if (!contents.trim()) throw new Error('файл пустой');
    return contents;
  } catch (err) {
    throw new Error(`Не удалось прочитать ${label} (${path.relative(ROOT, filePath)}): ${err.message}`);
  }
}

function readEnv() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'Не задан OPENAI_API_KEY.\n' +
      'Добавьте его в .env в корне проекта (см. .env.example). Файл .env в Git не попадает.'
    );
  }

  const trimSlash = (value) => value.replace(/\/+$/, '');

  return {
    apiKey: apiKey.trim(),
    textModel: process.env.OPENAI_TEXT_MODEL?.trim() || DEFAULTS.OPENAI_TEXT_MODEL,
    imageModel: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULTS.OPENAI_IMAGE_MODEL,
    siteUrl: trimSlash(process.env.SITE_URL?.trim() || DEFAULTS.SITE_URL),
    appUrl: trimSlash(process.env.APP_URL?.trim() || DEFAULTS.APP_URL),
  };
}

function printDryRun(article, env) {
  log('');
  log('РЕЖИМ DRY RUN — файлы не создаются, картинки не генерируются.');
  log('');
  log(`Title:\n${article.title}`);
  log('');
  log(`Slug:\n${article.slug}`);
  log('');
  log(`SEO title (${article.seo_title.length} символов):\n${article.seo_title}`);
  log('');
  log(`SEO description (${article.seo_description.length} символов):\n${article.seo_description}`);
  log('');
  log(`Excerpt:\n${article.excerpt}`);
  log('');
  log(`Keywords:\n${(article.keywords || []).join(', ')}`);
  log('');
  log(`URL после генерации:\n${env.siteUrl}/blog/${article.slug}/`);
  log('');
  log('Будущие изображения:');
  for (const image of article.image_prompts) {
    log(`  • ${image.file} (${image.role}, ${image.aspect_ratio})`);
    log(`    alt: ${image.alt}`);
    log(`    prompt: ${image.prompt.replace(/\s+/g, ' ').slice(0, 220)}${image.prompt.length > 220 ? '…' : ''}`);
  }
  log('');
  const words = render.sanitizeArticleHtml(article.article_html)
    .replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  log(`Объём статьи: примерно ${words} слов`);
  log('');
  log('DRY RUN OK — картинки и файлы не создавались.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }

  const env = readEnv();

  let topic = args.topic;
  if (!topic) topic = await ask('Тема статьи: ', 'Передайте тему аргументом: --topic="...".');
  if (!topic) throw new Error('Тема статьи не задана.');
  done(`Topic received: ${topic}`);

  const [systemPrompt, imageStyle, template, blogIndexTemplate, homeTeaserTemplate] = await Promise.all([
    readTextFile(PATHS.systemPrompt, 'system prompt'),
    readTextFile(PATHS.imageStyle, 'image style guide'),
    readTextFile(PATHS.template, 'шаблон статьи'),
    readTextFile(PATHS.blogIndexTemplate, 'шаблон страницы блога'),
    readTextFile(PATHS.homeTeaserTemplate, 'шаблон блока для главной'),
  ]);

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: env.apiKey });

  step(`Generating article... (${env.textModel})`);
  const article = await generateArticle({
    client,
    model: env.textModel,
    systemPrompt,
    topic,
    log,
  });
  done('Article generated');

  if (args.dryRun) {
    printDryRun(article, env);
    return;
  }

  log('');
  log(`Title:\n${article.title}`);
  log('');
  log(`Slug:\n${article.slug}`);
  log('');

  const targetDir = path.join(PATHS.blogDir, article.slug);
  if (await exists(targetDir)) {
    const answer = await ask(
      'Article already exists.\nOverwrite? (y/N) ',
      `Удалите public/blog/${article.slug}/ вручную или запустите генерацию в интерактивном терминале.`
    );
    if (!/^y(es)?$/i.test(answer)) {
      log('Отменено, ничего не изменено.');
      return;
    }
  }

  await fs.mkdir(PATHS.blogDir, { recursive: true });

  // Собираем статью во временной папке рядом с целевой: при любой ошибке
  // в public/blog не остаётся полусозданной статьи.
  const tmpDir = path.join(PATHS.blogDir, `.tmp-${article.slug}-${process.pid}`);
  const backupDir = `${targetDir}.backup-${process.pid}`;
  let backedUp = false;
  let published = false;

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const labels = { hero: 'hero image', inside_1: 'inside image 1', inside_2: 'inside image 2' };
    for (const imagePrompt of article.image_prompts) {
      step(`Generating ${labels[imagePrompt.role]}... (${env.imageModel})`);
      const info = await generateImage({
        client,
        model: env.imageModel,
        imagePrompt,
        styleGuide: imageStyle,
        outPath: path.join(tmpDir, imagePrompt.file),
      });
      done(`${imagePrompt.file} — ${info.width}×${info.height}, ${Math.round(info.bytes / 1024)} КБ`);
    }

    const dates = render.formatDates();
    const html = render.renderArticleHtml({
      article,
      template,
      siteUrl: env.siteUrl,
      appUrl: env.appUrl,
      dates,
    });
    await fs.writeFile(path.join(tmpDir, 'index.html'), html);
    done('index.html created');

    const post = render.buildPost({ article, dates });
    await fs.writeFile(path.join(tmpDir, 'post.json'), `${JSON.stringify(post, null, 2)}\n`);
    done('post.json created');

    // Переносим готовую папку на место одним движением; старую версию сначала
    // отодвигаем в сторону, чтобы можно было вернуть при сбое.
    if (await exists(targetDir)) {
      await fs.rename(targetDir, backupDir);
      backedUp = true;
    }
    await fs.rename(tmpDir, targetDir);
    published = true;

    const index = render.mergeIndex(await render.readIndex(PATHS.blogIndexJson), render.buildIndexEntry(post));
    await render.writeFileAtomic(PATHS.blogIndexJson, `${JSON.stringify(index, null, 2)}\n`);
    await render.writeFileAtomic(
      PATHS.blogIndexHtml,
      render.renderBlogIndexHtml({
        posts: index,
        template: blogIndexTemplate,
        siteUrl: env.siteUrl,
        appUrl: env.appUrl,
      })
    );
    done(`blog index updated (${index.length} ${index.length === 1 ? 'статья' : 'статей'})`);

    // Блок «Полезное о семейных финансах» на главной — только между маркерами,
    // остальной лендинг не трогаем.
    const homeHtml = await fs.readFile(PATHS.homeIndexHtml, 'utf8');
    const updatedHome = render.replaceHomeTeaser(
      homeHtml,
      render.renderHomeTeaser({ posts: index, template: homeTeaserTemplate })
    );
    if (updatedHome === null) {
      log('! В public/index.html нет маркеров BLOG_TEASER — блок на главной не обновлён');
    } else if (updatedHome !== homeHtml) {
      await render.writeFileAtomic(PATHS.homeIndexHtml, updatedHome);
      done('home page teaser updated');
    }

    const sitemap = updateSitemapXml(await readSitemap(PATHS.sitemap), [
      { loc: `${env.siteUrl}/blog/`, lastmod: dates.iso },
      { loc: `${env.siteUrl}/blog/${article.slug}/`, lastmod: dates.iso },
    ]);
    await render.writeFileAtomic(PATHS.sitemap, sitemap);
    done('sitemap updated');

    if (backedUp) await fs.rm(backupDir, { recursive: true, force: true });

    log('');
    log('DONE');
    log('');
    log('URL:');
    log(`http://localhost:3000/blog/${article.slug}/`);
    log(`${env.siteUrl}/blog/${article.slug}/`);
    log('');
    log('Посты для соцсетей лежат в post.json (telegram_post, threads_post).');
  } catch (err) {
    // Возвращаем предыдущую версию статьи, если успели её отодвинуть.
    if (backedUp && !(await exists(targetDir))) {
      await fs.rename(backupDir, targetDir).catch(() => {});
    }
    // Подсказка для финального сообщения: успели ли мы положить статью на место.
    err.published = published;
    err.slug = article.slug;
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (backedUp) await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('');
  console.error(`✗ ${err.message}`);
  if (err.status) console.error(`  HTTP ${err.status}${err.code ? ` (${err.code})` : ''}`);
  console.error('');
  if (err.published) {
    console.error(
      `Файлы статьи уже лежат в public/blog/${err.slug}/, но индекс блога и sitemap.xml ` +
      'могли не обновиться. Перезапустите генерацию (ответьте y на вопрос о перезаписи).'
    );
  } else {
    console.error('Ничего не записано: статья, index.json и sitemap.xml не изменены.');
  }
  process.exitCode = 1;
});
