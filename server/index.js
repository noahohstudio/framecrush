import express from "express";
import multer from "multer";
import cors from "cors";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const app = express();
app.use(cors());



const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function runFfmpeg(inputPath, outputPath, p) {
  const fps = num(p.fps, 12);
  const crunch = num(p.crunch, 320);
  const grain = num(p.grain, 18);
  const contrast = num(p.contrast, 1.2);
  const brightness = num(p.brightness, 0.02);
  const gamma = num(p.gamma, 1.05);
  const saturation = num(p.saturation, 0.8);
  const crf = num(p.crf, 28);

  const vf = [
    `fps=${fps}`,
    `scale=${crunch}:-2:flags=neighbor`,
    `scale=1280:-2:flags=bilinear`,
    `eq=contrast=${contrast}:brightness=${brightness}:gamma=${gamma}:saturation=${saturation}`,
    `noise=alls=${grain}:allf=t+u`,
  ].join(",");

  const args = [
    "-y",
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", vf,
    "-c:v", "libx264",
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-shortest",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 * 10 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

app.post("/api/grunge", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded.");

    const inputPath = req.file.path;
    const outputPath = path.join(os.tmpdir(), `grunge_${Date.now()}.mp4`);

    await runFfmpeg(inputPath, outputPath, req.body);

    res.setHeader("Content-Type", "video/mp4");
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);

    stream.on("close", () => {
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (e) {
    res.status(500).send(String(e.message || e));
  }
});

app.listen(3001, () => {
  console.log("Backend running: http://localhost:3001");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on", PORT);
});
