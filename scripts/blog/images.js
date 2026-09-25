// Генерация иллюстраций: OpenAI Images API + приведение к нужному размеру
// и формату через sharp. Модель картинок текст внутрь не рисует — это
// отдельно запрещено в prompts/blog/image-style.txt.
'use strict';

const fs = require('node:fs/promises');
const sharp = require('sharp');

// gpt-image-2 принимает произвольные размеры, кратные 16, поэтому берём точные
// 16:9 и 4:3. Для более старых моделей падаем на стандартные размеры, а нужную
// пропорцию всё равно получаем кадрированием в sharp (без растягивания).
const TARGETS = {
  hero: { width: 1536, height: 864, sizes: ['1536x864', '1536x1024', 'auto'] },
  inside_1: { width: 1216, height: 912, sizes: ['1216x912', '1536x1024', 'auto'] },
  inside_2: { width: 1216, height: 912, sizes: ['1216x912', '1536x1024', 'auto'] },
};

const WEBP_QUALITY = 85;

function isBadSizeError(err) {
  return err?.status === 400 && /size|resolution|dimension|width|height/i.test(String(err?.message || ''));
}

async function fetchImageBuffer(client, { model, prompt, sizes }) {
  let lastError;

  for (const size of sizes) {
    try {
      // GPT image-модели — через streaming с partial_images: без них сервер молчит
      // до готовой картинки, и VPN рвёт соединение (~21.5 с, bytesRead: 0).
      // Промежуточные кадры игнорируем, в файл идёт только completed.
      // maxRetries: 0 только здесь — при обрыве SDK не должен молча запускать
      // ещё две платные генерации.
      if (/^gpt-image/.test(model)) {
        // ВРЕМЕННАЯ ТЕЛЕМЕТРИЯ (BLOG_IMAGE_DEBUG=1): тайминги и цепочка cause, без ключа и base64.
        const t0 = Date.now();
        const dbg = (msg) => { if (process.env.BLOG_IMAGE_DEBUG) console.error(`  [img ${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`); };
        dbg(`images.generate() model=${model} size=${size} stream=true partial_images=2 maxRetries=0 prompt=${prompt.length} симв.`);
        try {
        const stream = await client.images.generate({ model, prompt, size, n: 1, stream: true, partial_images: 2 }, { maxRetries: 0 });
        dbg(`stream получен (HTTP-заголовки пришли): ${stream?.constructor?.name}, asyncIterable=${typeof stream?.[Symbol.asyncIterator] === 'function'}`);
        let b64 = null;
        for await (const event of stream) {
          dbg(`event ${event.type}${event.b64_json ? ` (b64 ${Math.round(event.b64_json.length / 1024)} КБ)` : ''}`);
          if (event.type === 'image_generation.completed') b64 = event.b64_json;
        }
        dbg(`поток закрыт, completed=${Boolean(b64)}`);
        if (!b64) throw new Error('поток Images API завершился без итогового изображения');
        return Buffer.from(b64, 'base64');
        } catch (err) {
          if (process.env.BLOG_IMAGE_DEBUG) {
            dbg('ОШИБКА, цепочка cause:');
            for (let e = err, d = 0; e && d < 8; e = e.cause, d += 1) {
              const f = {};
              for (const k of ['name', 'message', 'code', 'status', 'errno', 'syscall', 'requestID']) if (e[k] !== undefined) f[k] = e[k];
              if (e.socket) f.socket = e.socket;
              console.error(`    [${d}] ${e.constructor?.name}: ${JSON.stringify(f).replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')}`);
            }
          }
          throw err;
        }
      }

      const result = await client.images.generate({ model, prompt, size, n: 1 });
      const image = result?.data?.[0];

      if (image?.b64_json) return Buffer.from(image.b64_json, 'base64');

      // dall-e-модели возвращают ссылку вместо base64.
      if (image?.url) {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`не удалось скачать изображение: HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      }

      throw new Error('ответ Images API не содержит изображения');
    } catch (err) {
      lastError = err;
      if (!isBadSizeError(err)) throw err;
      // Размер не поддержан этой моделью — пробуем следующий из списка.
    }
  }

  throw lastError;
}

// Возвращает готовый webp-буфер нужных пропорций. cover кадрирует, но никогда
// не искажает картинку.
async function toWebp(buffer, { width, height }) {
  return sharp(buffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function generateImage({ client, model, imagePrompt, styleGuide, outPath }) {
  const target = TARGETS[imagePrompt.role];
  if (!target) throw new Error(`Неизвестная роль изображения: ${imagePrompt.role}`);

  // Смысл картинки задаёт текстовая модель, единый визуальный стиль
  // добавляется из prompts/blog/image-style.txt.
  const prompt = `${imagePrompt.prompt.trim()}\n\n${styleGuide.trim()}`;

  const raw = await fetchImageBuffer(client, { model, prompt, sizes: target.sizes });
  const webp = await toWebp(raw, target);
  await fs.writeFile(outPath, webp);

  return { bytes: webp.length, width: target.width, height: target.height };
}

module.exports = { generateImage, TARGETS };
