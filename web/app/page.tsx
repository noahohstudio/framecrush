"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";

const MAX_MB = 150; // decimal MB (Finder-ish)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const UI_SCALE = 0.67;

type Preset = {
  name: string;
  values: {
    fps: number;
    crunch: number;
    grain: number;
    contrast: number;
    brightness: number;
    gamma: number;
    saturation: number;
    crf: number;
  };
};

const PRESETS: Preset[] = [
  {
    name: "PUNK CAMCORDER",
    values: {
      fps: 12,
      crunch: 320,
      grain: 22,
      contrast: 1.25,
      brightness: 0.02,
      gamma: 1.05,
      saturation: 0.75,
      crf: 30,
    },
  },
  {
    name: "WASHED DV",
    values: {
      fps: 15,
      crunch: 480,
      grain: 14,
      contrast: 1.05,
      brightness: 0.04,
      gamma: 1.1,
      saturation: 0.65,
      crf: 28,
    },
  },
  {
    name: "BRUTAL B&W",
    values: {
      fps: 12,
      crunch: 360,
      grain: 18,
      contrast: 1.45,
      brightness: -0.02,
      gamma: 0.95,
      saturation: 0.0,
      crf: 29,
    },
  },
  {
    name: "HI-GRIME",
    values: {
      fps: 10,
      crunch: 240,
      grain: 28,
      contrast: 1.3,
      brightness: 0.0,
      gamma: 1.0,
      saturation: 0.85,
      crf: 34,
    },
  },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"idle" | "info" | "ok" | "err">("idle");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [processing, setProcessing] = useState<boolean>(false);

  const [activePreset, setActivePreset] = useState<string>(PRESETS[0].name);

  // sliders
  const [fps, setFps] = useState<number>(12);
  const [crunch, setCrunch] = useState<number>(320);
  const [grain, setGrain] = useState<number>(18);
  const [contrast, setContrast] = useState<number>(1.2);
  const [brightness, setBrightness] = useState<number>(0.02);
  const [gamma, setGamma] = useState<number>(1.05);
  const [saturation, setSaturation] = useState<number>(0.8);
  const [crf, setCrf] = useState<number>(28);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function markCustom() {
    if (activePreset !== "CUSTOM") setActivePreset("CUSTOM");
  }

  function applyPreset(p: Preset) {
    setActivePreset(p.name);
    setStatusTone("info");
    setStatus(`preset: ${p.name.toLowerCase()}`);

    setFps(p.values.fps);
    setCrunch(p.values.crunch);
    setGrain(p.values.grain);
    setContrast(p.values.contrast);
    setBrightness(p.values.brightness);
    setGamma(p.values.gamma);
    setSaturation(p.values.saturation);
    setCrf(p.values.crf);
  }

  async function framecrush() {
    if (!file || processing) return;

    setProcessing(true);
    setStatusTone("info");
    setStatus("processing…");
    setVideoUrl("");

    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("fps", String(fps));
      fd.append("crunch", String(crunch));
      fd.append("grain", String(grain));
      fd.append("contrast", String(contrast));
      fd.append("brightness", String(brightness));
      fd.append("gamma", String(gamma));
      fd.append("saturation", String(saturation));
      fd.append("crf", String(crf));

      const res = await fetch(`${BACKEND_URL}/api/grunge`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const msg = await res.text();
        setStatusTone("err");
        setStatus(msg || `error (${res.status})`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setStatusTone("ok");
      setStatus("Crushed.");
    } catch {
      setStatusTone("err");
      setStatus("processing failed.");
    } finally {
      setProcessing(false);
    }
  }

  const fileLabel = useMemo(() => {
    if (!file) return "No file chosen";
    return `${file.name} • ${(file.size / 1_000_000).toFixed(1)}MB`;
  }, [file]);

  const statusClass = useMemo(() => {
    if (!status) return "";
    if (statusTone === "ok") return "border-emerald-300/40 text-emerald-50 bg-emerald-950/20";
    if (statusTone === "err") return "border-red-300/40 text-red-50 bg-red-950/20";
    return "border-zinc-200/30 text-zinc-50 bg-black/20";
  }, [status, statusTone]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      {/* Background image */}
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: "url('/background.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "contrast(1.05) brightness(0.98)",
        }}
      />

      {/* Vignette + subtle grain overlay */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 55% 35%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 35%, rgba(0,0,0,0.22) 80%)",
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/></filter><rect width=%22200%22 height=%22200%22 filter=%22url(%23n)%22 opacity=%220.5%22/></svg>')",
            mixBlendMode: "multiply",
          }}
        />
      </div>

      {/* Loading overlay */}
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="px-6 py-4 border border-white/40 text-white tracking-[0.25em] uppercase">
            Processing…
          </div>
        </div>
      )}

      {/* Centered, scaled wrapper (THIS is the 67% baseline) */}
      <div className="relative z-10 w-full px-6 py-10 flex justify-center">
  {/* "Browser-zoom style" scaling: scale + width compensation */}
  <div
    className="origin-top"
    style={{
      transform: `scale(${UI_SCALE})`,
      transformOrigin: "top center",
      width: `${100 / UI_SCALE}%`, // <- this is the magic that makes it feel like real zoom
    }}
  >
    <div className="mx-auto w-[1100px] max-w-[calc(100vw-48px)]">
            {/* Logo */}
            <div className="w-full max-w-5xl mx-auto">
              <Image
                src="/framecrush-logo.png"
                alt="Framecrush"
                width={1400}
                height={260}
                priority
                className="mx-auto block"
              />
            </div>

            {/* Upload row */}
            <div className="mt-6 w-full max-w-[720px] mx-auto flex flex-col items-center gap-2">
              <div className="flex items-center gap-10">
                {/* Choose file button (label wraps input) */}
                <label className="inline-flex items-center justify-center">
                  <input
                    type="file"
                    accept="video/*, .mp4,.mov,.m4v,.webm,.mkv"
                    disabled={processing}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0] ?? null;
                      if (!f) return;

                      // limit: decimal MB
                      if (f.size > MAX_MB * 1_000_000) {
                        setStatusTone("err");
                        setStatus(`too big: max ${MAX_MB}MB`);
                        e.currentTarget.value = "";
                        setFile(null);
                        return;
                      }

                      setStatusTone("idle");
                      setStatus("");
                      setFile(f);
                    }}
                  />
                  <span
                    className={`px-5 py-2 border-2 border-black/80 bg-white/85 text-black tracking-[0.2em] uppercase text-sm
                    ${processing ? "opacity-50" : "hover:bg-white hover:text-black"} cursor-pointer select-none`}
                    style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.35)" }}
                  >
                    Choose File
                  </span>
                </label>

                {/* File chosen chip */}
                <div
                  className="px-5 py-2 border-2 border-black/80 bg-black/85 text-white tracking-[0.18em] uppercase text-sm"
                  style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.35)" }}
                >
                  {file ? fileLabel : "No file chosen"}
                </div>
              </div>

              <div className="text-xs tracking-[0.2em] uppercase text-black opacity-75">
                Max {MAX_MB}MB • Max 60s
              </div>
            </div>

            {/* Main panel */}
            <section
              className="mt-8 w-full max-w-[780px] mx-auto border-2 border-black/80 bg-black/50 text-white"
              style={{
                boxShadow: "10px 10px 0 rgba(0,0,0,0.35)",
                transform: "rotate(-0.15deg)",
                background: "linear-gradient(160deg, rgba(0,0,0,0.50), rgba(0,0,0,0.90))",
              }}
            >
              {/* top tabs */}
              <div className="flex gap-2 p-4 pb-2">
                {PRESETS.map((p) => {
                  const active = activePreset === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      disabled={processing}
                      onClick={() => applyPreset(p)}
                      className={`px-4 py-2 border-2 tracking-[0.2em] uppercase text-xs transition
                        ${processing ? "opacity-50 cursor-not-allowed" : "hover:bg-white hover:text-black"}
                        ${active ? "bg-white text-black border-white" : "border-white/60"}
                      `}
                      style={{ boxShadow: active ? "2px 2px 0 rgba(255,255,255,0.2)" : "none" }}
                    >
                      {p.name}
                    </button>
                  );
                })}
                <div className="ml-auto flex items-center text-xs tracking-[0.2em] uppercase opacity-70">
                  {activePreset === "CUSTOM" ? "CUSTOM" : " "}
                </div>
              </div>

              {/* sliders */}
              <div className="px-4 pb-4">
                <SliderRow
                  label={`FPS: ${fps}`}
                  valueBox={String(fps)}
                  min={4}
                  max={30}
                  value={fps}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setFps(v);
                  }}
                />

                <SliderRow
                  label={`Crunch (width): ${crunch}`}
                  valueBox={String(crunch)}
                  min={180}
                  max={960}
                  value={crunch}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setCrunch(v);
                  }}
                />

                <SliderRow
                  label={`Grain: ${grain}`}
                  valueBox={String(grain)}
                  min={0}
                  max={30}
                  value={grain}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setGrain(v);
                  }}
                />

                <SliderRow
                  label={`Contrast: ${contrast.toFixed(2)}`}
                  valueBox={contrast.toFixed(2)}
                  min={0.8}
                  max={1.6}
                  step={0.05}
                  value={contrast}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setContrast(v);
                  }}
                />

                <SliderRow
                  label={`Brightness: ${brightness.toFixed(2)}`}
                  valueBox={brightness.toFixed(2)}
                  min={-0.2}
                  max={0.2}
                  step={0.01}
                  value={brightness}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setBrightness(v);
                  }}
                />

                <SliderRow
                  label={`Gamma: ${gamma.toFixed(2)}`}
                  valueBox={gamma.toFixed(2)}
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  value={gamma}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setGamma(v);
                  }}
                />

                <SliderRow
                  label={`Saturation: ${saturation.toFixed(2)}`}
                  valueBox={saturation.toFixed(2)}
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={saturation}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setSaturation(v);
                  }}
                />

                <SliderRow
                  label={`Compression (CRF): ${crf}`}
                  valueBox={String(crf)}
                  min={18}
                  max={35}
                  value={crf}
                  disabled={processing}
                  onChange={(v) => {
                    markCustom();
                    setCrf(v);
                  }}
                />
              </div>

              {/* buttons */}
              <div className="px-4 pb-4 flex items-center justify-center gap-6">
                <button
                  type="button"
                  onClick={framecrush}
                  disabled={processing || !file}
                  className={`px-8 py-3 border-2 tracking-[0.25em] uppercase text-sm transition
                    ${processing || !file ? "opacity-50 cursor-not-allowed" : "hover:bg-white hover:text-black"}
                  `}
                  style={{ boxShadow: "4px 4px 0 rgba(255,255,255,0.1)" }}
                >
                  Crush
                </button>

                <button
                  type="button"
                  disabled={processing}
                  onClick={() => {
                    setFile(null);
                    setVideoUrl("");
                    setStatusTone("idle");
                    setStatus("");
                  }}
                  className={`px-8 py-3 border-2 tracking-[0.25em] uppercase text-sm transition
                    ${processing ? "opacity-50 cursor-not-allowed" : "hover:bg-white hover:text-black"}
                  `}
                  style={{ boxShadow: "4px 4px 0 rgba(255,255,255,0.1)" }}
                >
                  Clear
                </button>
              </div>

              {/* status */}
              {status && (
                <div className="px-4 pb-5 flex justify-center">
                  <div className={`px-4 py-2 border-2 tracking-[0.2em] uppercase text-xs ${statusClass}`}>
                    {status}
                  </div>
                </div>
              )}
            </section>

            {/* output */}
            <div className="mt-8 w-full max-w-[900px] mx-auto">
              {videoUrl ? (
                <div
                  className="border-2 border-black/80 bg-white/70 p-4"
                  style={{ boxShadow: "10px 10px 0 rgba(0,0,0,0.35)" }}
                >
                  <video src={videoUrl} controls className="w-full" />
                  <div className="mt-3 flex items-center justify-between text-xs text-black tracking-[0.2em] uppercase">
                    <span className="opacity-80 text-black">Output</span>
                    <a className="underline" href={videoUrl} download="framecrush.mp4">
                      Download
                    </a>
                  </div>
                </div>
              ) : (
                <div
                  className="border-2 border-black/80 bg-white/50 p-6 text-black text-xs tracking-[0.2em] uppercase opacity-70"
                  style={{ boxShadow: "10px 10px 0 rgba(0,0,0,0.25)" }}
                >
                  Output preview will appear here.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Custom range styling */}
      <style jsx global>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.55);
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          background: rgba(255, 255, 255, 0.92);
          border: 2px solid rgba(0, 0, 0, 0.9);
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: rgba(255, 255, 255, 0.92);
          border: 2px solid rgba(0, 0, 0, 0.9);
          box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
          cursor: pointer;
        }
        input[type="range"]::-moz-range-track {
          height: 10px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.55);
        }
      `}</style>
    </main>
  );
}

function SliderRow(props: {
  label: string;
  valueBox: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const { label, valueBox, min, max, step, value, disabled, onChange } = props;

  return (
    <div className="grid grid-cols-[1fr_90px] items-center gap-4 py-2">
      <div className="space-y-2">
        <div className="text-sm tracking-[0.18em] uppercase opacity-90">{label}</div>
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      <div
        className="h-[34px] flex items-center justify-center border-2 border-white/70 bg-white/90 text-black tracking-[0.2em] text-sm"
        style={{ boxShadow: "3px 3px 0 rgba(255,255,255,0.12)" }}
      >
        {valueBox}
      </div>
    </div>
  );
}
