const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function args() {
  const out = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const x = arg.slice(2);
    const eq = x.indexOf("=");

    if (eq === -1) {
      out[x] = true;
    } else {
      out[x.slice(0, eq)] =
        x.slice(eq + 1);
    }
  }

  return out;
}

const a = args();
const slug = a.slug;

if (!slug) {
  console.error(
    "Укажи --slug=kak-raspredelit-zarplatu-na-mesyats"
  );
  process.exit(1);
}

const sourcePath = path.join(
  ROOT,
  "content",
  "blog",
  `${slug}.json`
);

if (!fs.existsSync(sourcePath)) {
  console.error(
    `Не найден ${sourcePath}`
  );
  process.exit(1);
}

const source = JSON.parse(
  fs.readFileSync(sourcePath, "utf8")
);

const reel =
  source?.social?.short_video;

if (!reel?.script?.length) {
  console.error(
    "Нет social.short_video.script"
  );
  process.exit(1);
}

const voicePath = path.join(
  ROOT,
  "public",
  "social",
  slug,
  "reels",
  "voice.mp3"
);

if (!fs.existsSync(voicePath)) {
  console.error(
    "Не найден voice.mp3 от предыдущего reels.js"
  );
  console.error(voicePath);
  process.exit(1);
}

const duration =
  Number(reel.duration_seconds) || 28;

const data = {
  slug,
  title: source.title,
  hook: reel.hook || "",
  duration_seconds: duration,
  voice_static_path:
    `social/${slug}/reels/voice.mp3`,
  scenes: reel.script,
};

const dataPath = path.join(
  ROOT,
  "motion-reels",
  "current-data.json"
);

fs.writeFileSync(
  dataPath,
  JSON.stringify(data, null, 2) + "\n"
);

const outDir = path.join(
  ROOT,
  "public",
  "social",
  slug,
  "reels-motion"
);

fs.mkdirSync(outDir, {
  recursive: true,
});

const output = path.join(
  outDir,
  "reel.mp4"
);

fs.rmSync(output, {
  force: true,
});

console.log("");
console.log("MOTION REEL");
console.log("-----------");
console.log(`Статья: ${source.title}`);
console.log(`Сцен: ${reel.script.length}`);
console.log(`Длительность: ${duration} сек`);
console.log("Визуал: Remotion motion design");
console.log("OpenAI-вызовы: 0");
console.log("");

const result = spawnSync(
  process.platform === "win32"
    ? "npx.cmd"
    : "npx",
  [
    "remotion",
    "render",
    "motion-reels/index.jsx",
    "MotionReel",
    output,
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
  }
);

if (result.status !== 0) {
  process.exit(
    result.status || 1
  );
}

console.log("");
console.log("DONE");
console.log(output);
console.log("");
console.log(
  `Открыть:\nopen "${output}"`
);
