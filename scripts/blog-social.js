#!/usr/bin/env node
// Генерация контент-пакета для соцсетей к уже написанной статье.
//
//   npm run blog:social -- --slug=<slug>              сгенерировать и сохранить
//   npm run blog:social -- --slug=<slug> --dry-run    сгенерировать и показать, не сохраняя
//   npm run blog:social -- --slug=<slug> --show       показать сохранённый, без OpenAI
//
// Нужна для статей, созданных до расширения соцпакета: у них в social есть
// только telegram и threads. Перегенерировать ради этого статью, SEO и картинки
// незачем — команда трогает ровно одно поле source JSON.
//
// Что она НЕ делает: не переписывает статью, SEO, slug, CTA и изображения, не
// обращается к Images API, не трогает ничего в public/, не коммитит и никуда
// ничего не публикует.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');

const ROOT = path.join(__dirname, '..');

require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const sourceStore = require('./blog/source');
const { sanitizeArticleHtml } = require('./blog/render');

const DEFAULT_TEXT_MODEL = 'gpt-5.6-terra';

const PATHS = {
  systemPrompt: path.join(ROOT, 'prompts', 'blog', 'system.txt'),
  socialPrompt: path.join(ROOT, 'prompts', 'blog', 'social.txt'),
  contentBlogDir: path.join(ROOT, 'content', 'blog'),
};

const SLUG_RE = /^[a-z0-9-]+$/;

const log = (message = '') => console.log(message);
const step = (message) => console.log(`→ ${message}`);
const done = (message) => console.log(`✓ ${message}`);

class SocialError extends Error {}

const rel = (filePath) => path.relative(ROOT, filePath);

function parseArgs(argv) {
  const args = { slug: null, dryRun: false, show: false, help: false };

  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--show') args.show = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--slug=')) args.slug = arg.slice('--slug='.length).trim();
    else throw new SocialError(`Неизвестный аргумент «${arg}». Доступны --slug=, --dry-run, --show`);
  }

  if (args.dryRun && args.show) {
    throw new SocialError('--dry-run и --show взаимоисключающие: первый обращается к модели, второй только читает файл');
  }
  return args;
}

async function ask(question) {
  if (!process.stdin.isTTY) {
    throw new SocialError(
      `Нужен ответ на вопрос «${question.trim()}», но терминал неинтерактивный. ` +
      'Запустите команду в интерактивном терминале.'
    );
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// Модели нужен смысл статьи, а не разметка: снимаем теги, разворачиваем
// сущности и убираем служебные плейсхолдеры картинок.
function htmlToPlainText(html) {
  return sanitizeArticleHtml(html)
    .replace(/\{\{INSIDE_IMAGE_\d\}\}/g, '')
    .replace(/<\/(?:p|h2|h3|li|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '— ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadSource(slug) {
  if (!slug) throw new SocialError('Не задан slug. Пример: npm run blog:social -- --slug=pochemu-ne-hvataet-deneg');
  if (!SLUG_RE.test(slug)) throw new SocialError(`slug «${slug}» не подходит под ^[a-z0-9-]+$`);

  const file = sourceStore.sourcePath(PATHS.contentBlogDir, slug);
  let source;
  try {
    source = await sourceStore.readSource(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const available = (await sourceStore.listSourceFiles(PATHS.contentBlogDir))
        .map((item) => path.basename(item, '.json'));
      throw new SocialError(
        `Нет источника ${rel(file)}.` +
        (available.length ? `\nЕсть такие статьи:\n  - ${available.join('\n  - ')}` : '')
      );
    }
    throw new SocialError(error.message);
  }

  const problems = sourceStore.validateSource(source, `content/blog/${slug}.json`);
  if (problems.length > 0) {
    throw new SocialError(`Источник не прошёл проверку:\n  - ${problems.join('\n  - ')}\n\nФайл не изменён.`);
  }
  if (typeof source.article_html !== 'string' || !source.article_html.trim()) {
    throw new SocialError(`В ${rel(file)} пустой article_html — генерировать соцпакет не из чего.`);
  }

  return { source, file };
}

const PLATFORMS = ['telegram', 'threads', 'instagram', 'vk', 'short_video'];

function missingPlatforms(social) {
  return PLATFORMS.filter((name) => social[name] === undefined || social[name] === null || social[name] === '');
}

function printSocial(social) {
  const line = (title) => {
    log('');
    log(`──────── ${title} ────────`);
  };

  line('TELEGRAM');
  log(social.telegram || '— нет —');

  line('THREADS');
  log(social.threads || '— нет —');

  line('INSTAGRAM CAROUSEL');
  if (!social.instagram?.carousel) log('— нет —');
  else {
    log(`Заголовок: ${social.instagram.carousel.title}`);
    log('');
    for (const slide of social.instagram.carousel.slides || []) {
      log(`${String(slide.number).padStart(2)}. ${slide.text}   [${slide.text.length} симв.]`);
    }
  }

  line('INSTAGRAM CAPTION');
  if (!social.instagram?.caption) log('— нет —');
  else {
    log(social.instagram.caption);
    log('');
    log(`[${social.instagram.caption.length} знаков]`);
  }

  line('VK');
  if (!social.vk) log('— нет —');
  else {
    log(social.vk);
    log('');
    log(`[${social.vk.length} знаков]`);
  }

  line('SHORT VIDEO');
  const video = social.short_video;
  if (!video) log('— нет —');
  else {
    log(`Хук: ${video.hook}`);
    log(`Длительность: ${video.duration_seconds} с · сцен: ${(video.script || []).length}`);
    log('');
    for (const scene of video.script || []) {
      log(`  ${scene.time}`);
      log(`    голос:  ${scene.voice}`);
      log(`    кадр:   ${scene.visual}`);
      log(`    экран:  ${scene.overlay || '— без надписи —'}`);
    }
    log('');
    log(`Описание: ${video.caption}`);
    log(`Призыв:   ${video.cta}`);
  }
  log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    log('npm run blog:social -- --slug=<slug>              сгенерировать и сохранить');
    log('npm run blog:social -- --slug=<slug> --dry-run    сгенерировать и показать, не сохраняя');
    log('npm run blog:social -- --slug=<slug> --show       показать сохранённый, без OpenAI');
    return;
  }

  const { source, file } = await loadSource(args.slug);

  // --show вообще не ходит в сеть: просто печатает то, что уже лежит в файле.
  if (args.show) {
    const missing = missingPlatforms(source.social);
    log(`Соцпакет статьи «${source.title}»`);
    log(`Источник: ${rel(file)}`);
    if (missing.length > 0) {
      log('');
      log(`! Пакет неполный. Есть: ${PLATFORMS.filter((p) => !missing.includes(p)).join(', ')}`);
      log(`  Не хватает: ${missing.join(', ')}`);
      log(`  Дособрать: npm run blog:social -- --slug=${source.slug}`);
    }
    printSocial(source.social);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new SocialError(
      'Нет OPENAI_API_KEY. Положите ключ в .env (см. .env.example).\n' +
      `Посмотреть уже сохранённый пакет без обращения к модели: npm run blog:social -- --slug=${source.slug} --show`
    );
  }
  const model = process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL;

  // Спрашиваем до запроса к модели: незачем тратить вызов, если человек
  // передумает на этапе перезаписи.
  if (!args.dryRun) {
    const missing = missingPlatforms(source.social);
    const question = missing.length > 0 && missing.length < PLATFORMS.length
      ? 'Social package already exists partially.\nGenerate/replace social content? (y/N) '
      : 'Social package already exists.\nGenerate/replace social content? (y/N) ';
    if (missing.length > 0) {
      log(`Сейчас в пакете: ${PLATFORMS.filter((p) => !missing.includes(p)).join(', ') || '— пусто —'}`);
      log(`Не хватает: ${missing.join(', ')}`);
    }
    const answer = await ask(question);
    if (!/^y(es)?$/i.test(answer)) {
      log('Отменено, исходник не изменён.');
      return;
    }
  }

  const [systemPrompt, socialPrompt] = await Promise.all([
    fs.readFile(PATHS.systemPrompt, 'utf8'),
    fs.readFile(PATHS.socialPrompt, 'utf8'),
  ]);

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });
  const { generateSocial } = require('./blog/text');

  const text = htmlToPlainText(source.article_html);
  step(`Генерирую соцпакет для «${source.title}»... (${model})`);
  log(`  контекст: тема, заголовок, лид и текст статьи — ${text.length} символов, без разметки`);

  const social = await generateSocial({
    client,
    model,
    systemPrompt,
    socialPrompt,
    article: { topic: source.topic, title: source.title, excerpt: source.excerpt, text },
    log,
  });
  done('Соцпакет готов и прошёл проверку');

  if (args.dryRun) {
    log('');
    log('РЕЖИМ DRY RUN — исходник не изменён.');
    printSocial(social);
    log('DRY RUN OK — content/blog/' + source.slug + '.json не тронут.');
    return;
  }

  // Меняем ровно одно поле: остальной исходник сохраняется как был, включая
  // порядок ключей. Запись атомарная (временный файл + rename).
  const updated = { ...source, social };
  const problems = sourceStore.validateSource(updated, `content/blog/${source.slug}.json`);
  if (problems.length > 0) {
    throw new SocialError(`Обновлённый источник не прошёл проверку:\n  - ${problems.join('\n  - ')}\n\nФайл не изменён.`);
  }

  await sourceStore.writeSourceAtomic(file, updated);
  done(`${rel(file)} — обновлено только поле social`);

  printSocial(social);
  log('DONE');
  log('');
  log('Публичные файлы не тронуты: страница, post.json, index.json и sitemap.xml остались как были.');
  log(`Посмотреть пакет ещё раз: npm run blog:social -- --slug=${source.slug} --show`);
}

main().catch((error) => {
  if (error instanceof SocialError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(`\n✗ ${error.message}`);
    if (error.status) console.error(`  HTTP ${error.status}${error.code ? ` (${error.code})` : ''}`);
    console.error('\nИсходник не изменён.');
  }
  process.exitCode = 1;
});
