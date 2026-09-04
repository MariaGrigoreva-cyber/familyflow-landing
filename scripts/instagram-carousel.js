const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const body = arg.slice(2);
    const eq = body.indexOf("=");

    if (eq === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }

  return result;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text, maxChars) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function fontSettings(text, cover = false) {
  const length = text.length;

  let fontSize;

  if (cover) {
    if (length <= 55) fontSize = 76;
    else if (length <= 90) fontSize = 66;
    else if (length <= 125) fontSize = 56;
    else fontSize = 48;
  } else {
    if (length <= 45) fontSize = 72;
    else if (length <= 70) fontSize = 62;
    else if (length <= 100) fontSize = 54;
    else fontSize = 46;
  }

  let maxChars;

  if (fontSize >= 72) maxChars = 19;
  else if (fontSize >= 62) maxChars = 22;
  else if (fontSize >= 54) maxChars = 26;
  else maxChars = 30;

  return {
    fontSize,
    maxChars,
    lineHeight: Math.round(fontSize * 1.16),
  };
}

function textTspans(lines, x, startY, lineHeight) {
  return lines
    .map(
      (line, i) =>
        `<tspan x="${x}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");
}

function makePlainSvg({
  text,
  number,
  total,
  title,
  variant = "plain",
  subtitle = "",
  lift = false,
}) {
  const accent = variant === "accent";
  const cta = variant === "cta";

  let { fontSize, maxChars } = fontSettings(text, false);

  if (cta) {
    if (text.length <= 65) {
      fontSize = 62;
      maxChars = 26;
    } else {
      fontSize = 54;
      maxChars = 29;
    }
  }

  const lineHeight = Math.round(fontSize * 1.16);
  const lines = wrapText(text, maxChars);
  const textHeight = lines.length * lineHeight;

  const centerY = cta
    ? 585
    : lift
      ? 575
      : 650;

  const startY = Math.round(centerY - textHeight / 2);

  const background = accent ? "#B0502F" : "#FAF6F0";
  const mainText = accent ? "#FFF8F3" : "#241E19";
  const brandText = accent ? "#FFF8F3" : "#B0502F";
  const metaText = accent ? "#F7DED4" : "#7C6B61";
  const divider = accent ? "#D98566" : "#E8DCD3";
  const circleFill = accent ? "#FFFFFF" : "#B0502F";

  const subtitleLines = cta
    ? wrapText(subtitle, 42)
    : [];

  const subtitleStart =
    startY + textHeight + 85;

  return Buffer.from(`
  <svg width="1080" height="1350" viewBox="0 0 1080 1350"
       xmlns="http://www.w3.org/2000/svg">

    <rect width="1080" height="1350"
          fill="${background}"/>

    <circle cx="1010" cy="180" r="205"
            fill="${circleFill}"
            opacity="${accent ? "0.07" : "0.08"}"/>

    <circle cx="70" cy="1240" r="145"
            fill="${circleFill}"
            opacity="${accent ? "0.05" : "0.05"}"/>

    <text x="90" y="105"
          font-family="Arial, Helvetica, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="3"
          fill="${brandText}">
      СЕМЕЙНЫЙ ПОТОК
    </text>

    <text x="990" y="108"
          text-anchor="end"
          font-family="Arial, Helvetica, sans-serif"
          font-size="28"
          font-weight="600"
          fill="${metaText}">
      ${String(number).padStart(2, "0")} / ${String(total).padStart(2, "0")}
    </text>

    <line x1="90" y1="155"
          x2="990" y2="155"
          stroke="${divider}"
          stroke-width="2"/>

    ${
      cta
        ? `
        <rect x="90"
              y="${startY - 125}"
              width="190"
              height="48"
              rx="24"
              fill="#B0502F"/>

        <text x="185"
              y="${startY - 93}"
              text-anchor="middle"
              font-family="Arial, Helvetica, sans-serif"
              font-size="19"
              font-weight="700"
              letter-spacing="2"
              fill="#FFFFFF">
          СОХРАНИТЕ
        </text>
        `
        : ""
    }

    <text x="90"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="${mainText}">
      ${textTspans(lines, 90, startY, lineHeight)}
    </text>

    ${
      cta
        ? `
        <text x="90"
              font-family="Arial, Helvetica, sans-serif"
              font-size="30"
              font-weight="400"
              fill="#7C6B61">
          ${textTspans(
            subtitleLines,
            90,
            subtitleStart,
            42
          )}
        </text>

        <line x1="90" y1="1175"
              x2="210" y2="1175"
              stroke="#B0502F"
              stroke-width="7"
              stroke-linecap="round"/>

        <text x="90" y="1235"
              font-family="Arial, Helvetica, sans-serif"
              font-size="25"
              fill="#7C6B61">
          myfamilyflow.ru
        </text>
        `
        : accent
          ? `
        <line x1="90" y1="1175"
              x2="210" y2="1175"
              stroke="#F3B097"
              stroke-width="7"
              stroke-linecap="round"/>

        <text x="90" y="1235"
              font-family="Arial, Helvetica, sans-serif"
              font-size="25"
              fill="#F7DED4">
          myfamilyflow.ru
        </text>
        `
          : ""
    }

  </svg>
  `);
}

function makeImageOverlaySvg({
  text,
  number,
  total,
  title,
  cover,
}) {
  const { fontSize, maxChars, lineHeight } = fontSettings(text, cover);
  const lines = wrapText(text, maxChars);

  const textHeight = lines.length * lineHeight;
  const startY = cover
    ? Math.round(720 - textHeight / 2)
    : Math.round(700 - textHeight / 2);

  return Buffer.from(`
  <svg width="1080" height="1350" viewBox="0 0 1080 1350"
       xmlns="http://www.w3.org/2000/svg">

    <rect width="1080" height="1350"
          fill="#241E19"
          opacity="${cover ? "0.46" : "0.50"}"/>

    <rect x="0" y="0" width="1080" height="190"
          fill="#241E19"
          opacity="0.16"/>

    <text x="90" y="105"
          font-family="Arial, Helvetica, sans-serif"
          font-size="24"
          font-weight="700"
          letter-spacing="3"
          fill="#FFF5EF">
      СЕМЕЙНЫЙ ПОТОК
    </text>

    <text x="990" y="108"
          text-anchor="end"
          font-family="Arial, Helvetica, sans-serif"
          font-size="28"
          font-weight="600"
          fill="#FFF5EF">
      ${String(number).padStart(2, "0")} / ${String(total).padStart(2, "0")}
    </text>

    ${
      cover
        ? `
      <text x="90" y="255"
            font-family="Arial, Helvetica, sans-serif"
            font-size="30"
            font-weight="600"
            fill="#F0B8A2">
        ${escapeXml(title)}
      </text>
    `
        : ""
    }

    <text x="90"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="#FFFFFF">
      ${textTspans(lines, 90, startY, lineHeight)}
    </text>

    <line x1="90" y1="1175" x2="210" y2="1175"
          stroke="#E58B68"
          stroke-width="7"
          stroke-linecap="round"/>

    <text x="90" y="1235"
          font-family="Arial, Helvetica, sans-serif"
          font-size="25"
          fill="#FFF5EF">
      myfamilyflow.ru
    </text>
  </svg>
  `);
}

function readImageStyle() {
  const stylePath = path.join(ROOT, "prompts", "blog", "image-style.txt");

  if (!fs.existsSync(stylePath)) {
    return "Warm realistic editorial lifestyle photography, cozy modern home, natural light, beige and terracotta palette.";
  }

  return fs.readFileSync(stylePath, "utf8").trim().slice(0, 3000);
}

function buildImagePrompt({ articleTitle, slideText, style }) {
  return `
Create a vertical editorial lifestyle photograph for an Instagram carousel
for a Russian-language family finance product called "Семейный поток".

ARTICLE TOPIC:
${articleTitle}

VISUAL IDEA:
${slideText}

ESTABLISHED VISUAL STYLE:
${style}

Create a warm, realistic, premium but relatable lifestyle photograph.
Modern everyday home environment.
Adults approximately 28–42 years old when people are shown.
Family-finance context can be suggested through a smartphone, planner,
calendar, envelopes, everyday household objects or groceries.

Use warm neutral beige, cream, wood and muted terracotta tones.
Natural soft light.
Editorial photography rather than stock photography.
Clean composition with visual breathing room.

The final Instagram slide will be cropped to 4:5.
Keep important people and objects in the central safe area.
Leave useful negative space for text overlay.

CRITICAL:
NO readable text.
NO words.
NO letters.
NO numbers.
NO logos.
NO watermarks.
NO bank brands.
NO readable financial data.
NO fake app interface with readable values.
Do not generate typography of any kind.
`.trim();
}

async function generateAiImage({ prompt, target, model, quality }) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1536",
      quality,
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    let message = raw;

    try {
      const parsed = JSON.parse(raw);
      message =
        parsed?.error?.message ||
        parsed?.error?.code ||
        raw;
    } catch {}

    throw new Error(`OpenAI image API: ${response.status} — ${message}`);
  }

  const data = JSON.parse(raw);
  const base64 = data?.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenAI не вернул data[0].b64_json");
  }

  fs.writeFileSync(target, Buffer.from(base64, "base64"));
}

async function main() {
  loadEnv();

  const args = parseArgs();
  const slug = args.slug;

  if (!slug) {
    throw new Error(
      "Укажи slug: --slug=kak-raspredelit-zarplatu-na-mesyats"
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Некорректный slug");
  }

  const aiImages = Math.max(
    0,
    Math.min(3, Number(args["ai-images"] ?? 2))
  );

  const quality = String(args.quality || "medium");

  if (!["low", "medium", "high"].includes(quality)) {
    throw new Error("--quality должен быть low, medium или high");
  }

  const dryRun = Boolean(args["dry-run"]);
  const force = Boolean(args.force);
  const reuseImages = Boolean(args["reuse-images"]);

  const sourcePath = path.join(
    ROOT,
    "content",
    "blog",
    `${slug}.json`
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Не найден исходник статьи: ${sourcePath}`);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

  const instagram = source?.social?.instagram;
  const carousel = instagram?.carousel;

  if (!carousel || !Array.isArray(carousel.slides) || !carousel.slides.length) {
    throw new Error(
      `В ${sourcePath} нет social.instagram.carousel.slides`
    );
  }

  const slides = [...carousel.slides].sort(
    (a, b) => Number(a.number) - Number(b.number)
  );

  const outDir = path.join(
    ROOT,
    "public",
    "social",
    slug,
    "instagram"
  );

  const assetsDir = path.join(outDir, "assets");

  const model =
    process.env.OPENAI_IMAGE_MODEL ||
    "gpt-image-2";

  console.log("");
  console.log("Instagram carousel");
  console.log("------------------");
  console.log(`Статья: ${source.title}`);
  console.log(`Slug: ${slug}`);
  console.log(`Слайдов: ${slides.length}`);
  console.log(`AI-фонов: ${aiImages}`);
  console.log(`Модель: ${model}`);
  console.log(`Качество: ${quality}`);
  console.log(`Формат: 1080×1350 PNG`);
  console.log("");

  const imageIndexes = [];

  if (aiImages >= 1) imageIndexes.push(0);

  if (aiImages >= 2 && slides.length > 3) {
    imageIndexes.push(Math.min(3, slides.length - 1));
  }

  if (aiImages >= 3 && slides.length > 1) {
    const last = slides.length - 1;
    if (!imageIndexes.includes(last)) imageIndexes.push(last);
  }

  console.log(
    `AI-визуалы будут на слайдах: ${
      imageIndexes.length
        ? imageIndexes.map((i) => i + 1).join(", ")
        : "нет"
    }`
  );

  if (dryRun) {
    console.log("");
    console.log("DRY RUN — API не вызывается, файлы не создаются.");
    return;
  }

  if (aiImages > 0 && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "Нет OPENAI_API_KEY. Проверь familyflow-landing/.env"
    );
  }

  if (fs.existsSync(outDir)) {
    const hasSlides = fs
      .readdirSync(outDir)
      .some((name) => /^\d\d\.png$/.test(name));

    if (hasSlides && !force) {
      throw new Error(
        `Карусель уже существует: ${outDir}\n` +
        `Для перегенерации добавь --force`
      );
    }

    if (force && !reuseImages) {
      fs.rmSync(outDir, {
        recursive: true,
        force: true,
      });
    }

    if (force && reuseImages) {
      for (const name of fs.readdirSync(outDir)) {
        if (
          /^\d\d\.png$/.test(name) ||
          name === "caption.txt" ||
          name === "carousel.json"
        ) {
          fs.rmSync(path.join(outDir, name), {
            force: true,
          });
        }
      }
    }
  }

  fs.mkdirSync(assetsDir, {
    recursive: true,
  });

  const style = readImageStyle();
  const generatedBackgrounds = new Map();

  for (let i = 0; i < imageIndexes.length; i++) {
    const slideIndex = imageIndexes[i];
    const slide = slides[slideIndex];

    const target = path.join(
      assetsDir,
      `ai-${String(i + 1).padStart(2, "0")}.png`
    );

    if (reuseImages && fs.existsSync(target)) {
      generatedBackgrounds.set(slideIndex, target);
      console.log(
        `↻ Слайд ${slideIndex + 1}: используем готовый AI-фон`
      );
      continue;
    }

    const prompt = buildImagePrompt({
      articleTitle: source.title,
      slideText: slide.text,
      style,
    });

    console.log(
      `→ OpenAI: фон для слайда ${slideIndex + 1}...`
    );

    await generateAiImage({
      prompt,
      target,
      model,
      quality,
    });

    generatedBackgrounds.set(slideIndex, target);

    console.log(`✓ AI-фон готов`);
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    const number = Number(slide.number || i + 1);
    const target = path.join(
      outDir,
      `${String(i + 1).padStart(2, "0")}.png`
    );

    const bg = generatedBackgrounds.get(i);

    if (bg) {
      const overlay = makeImageOverlaySvg({
        text: slide.text,
        number,
        total: slides.length,
        title: carousel.title || source.title,
        cover: i === 0,
      });

      await sharp(bg)
        .resize(1080, 1350, {
          fit: "cover",
          position: "centre",
        })
        .composite([
          {
            input: overlay,
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toFile(target);
    } else {
      const isAccentSlide =
        number === slides.length - 1;

      const isCtaSlide =
        number === slides.length;

      const displayText = isCtaSlide
        ? "Распределите зарплату до первой покупки."
        : slide.text;

      const svg = makePlainSvg({
        text: displayText,
        number,
        total: slides.length,
        title: carousel.title || source.title,
        variant: isAccentSlide
          ? "accent"
          : isCtaSlide
            ? "cta"
            : "plain",
        subtitle: isCtaSlide
          ? "Сохраните карусель — пригодится в день зарплаты."
          : "",
        lift: number === 5 || number === 6,
      });

      await sharp(svg)
        .png()
        .toFile(target);
    }

    console.log(`✓ ${path.basename(target)}`);
  }

  fs.writeFileSync(
    path.join(outDir, "caption.txt"),
    String(instagram.caption || "").trim() + "\n"
  );

  fs.writeFileSync(
    path.join(outDir, "carousel.json"),
    JSON.stringify(
      {
        slug,
        title: carousel.title,
        slides,
        caption: instagram.caption || "",
        generated_at: new Date().toISOString(),
        ai_model: aiImages > 0 ? model : null,
        ai_images: aiImages,
        quality,
        dimensions: "1080x1350",
      },
      null,
      2
    ) + "\n"
  );

  console.log("");
  console.log("DONE");
  console.log(`Карусель: ${outDir}`);
  console.log(`Подпись: ${path.join(outDir, "caption.txt")}`);
  console.log("");
  console.log(
    `Открыть папку на Mac:\nopen "${outDir}"`
  );
}

main().catch((error) => {
  console.error("");
  console.error("ERROR");
  console.error(error.message || error);
  process.exit(1);
});
