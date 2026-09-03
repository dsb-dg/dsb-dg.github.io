/* ============================================================================
   DSB-DG project page — SVG pipeline diagram, line charts, and result tables.
   All numbers are transcribed verbatim from the manuscript's tables.
   ============================================================================ */
(function () {
  "use strict";

  const MODELS = [
    { id: "cascaded", label: "Cascaded",     v: "--m-cascaded" },
    { id: "gpt",      label: "GPT-Realtime", v: "--m-gpt" },
    { id: "minicpm",  label: "MiniCPM-o",    v: "--m-minicpm" },
    { id: "uv",       label: "UV-32B",       v: "--m-uv" },
    { id: "salmonn",  label: "SALMONN",      v: "--m-salmonn" },
    { id: "moshi",    label: "Moshi",        v: "--m-moshi" },
  ];
  const TIERS = ["T1", "T2", "T3", "T4", "T5"];

  const GA = {
    cascaded: [95.2, 95.1, 93.6, 89.3, 92.6],
    gpt:      [94.8, 93.1, 89.3, 91.0, 88.9],
    minicpm:  [93.5, 91.1, 91.8, 87.8, 84.9],
    uv:       [82.4, 81.0, 78.7, 74.5, 77.6],
    salmonn:  [76.1, 76.4, 62.1, 13.1, 18.4],
    moshi:    [0.0, 0.0, 0.0, 0.0, 0.0],
  };
  const HR = {  // Moshi omitted (not grounded => HR not meaningful), per the paper figure
    cascaded: [3.7, 5.5, 7.4, 11.4, 16.8],
    gpt:      [4.3, 6.6, 9.1, 8.7, 9.8],
    minicpm:  [5.8, 8.0, 9.1, 12.6, 14.7],
    uv:       [12.3, 15.6, 16.0, 21.7, 27.6],
    salmonn:  [23.3, 21.4, 32.3, 48.0, 50.6],
  };

  const SVGNS = "http://www.w3.org/2000/svg";
  // CSS custom properties only resolve inside `style`, never as presentation
  // attributes — so route any fill/stroke that references var() into inline style.
  const el = (n, a) => {
    const e = document.createElementNS(SVGNS, n);
    let style = "";
    for (const k in (a || {})) {
      if (k === "style") { style += a[k] + ";"; continue; }
      const val = a[k];
      if ((k === "fill" || k === "stroke") && typeof val === "string" && val.indexOf("var(") === 0) {
        style += `${k}:${val};`;
      } else {
        e.setAttribute(k, val);
      }
    }
    if (style) e.setAttribute("style", style);
    return e;
  };
  const cvar = (v) => `var(${v})`;

  /* ---------------------------------------------------------------- pipeline */
  function pipeline() {
    const svg = document.getElementById("pipeline");
    if (!svg) return;
    svg.innerHTML = "";
    const boxes = [
      { x: 8,   w: 150, t: "Document (TEXT)", s: "5 tiers · ≈500→8k tok", ic: "📄" },
      { x: 178, w: 150, t: "Spoken question", s: "16 kHz · fixed TTS voice", ic: "🎙️" },
      { x: 348, w: 176, t: "Full-duplex model", s: "listens + speaks in real time", ic: "🗣️", accent: true },
      { x: 544, w: 150, t: "Whisper-large-v3", s: "ASR of spoken reply", ic: "📝" },
      { x: 714, w: 198, t: "GPT-4o grounding judge", s: "grounded? hallucination?", ic: "⚖️" },
    ];
    boxes.forEach((b, i) => {
      const g = el("g");
      g.appendChild(el("rect", { x: b.x, y: 40, width: b.w, height: 66, rx: 12,
        fill: "var(--surface-2)", stroke: b.accent ? "var(--accent)" : "var(--hair)", "stroke-width": b.accent ? 1.6 : 1 }));
      const ic = el("text", { x: b.x + 14, y: 68, "font-size": 19 }); ic.textContent = b.ic; g.appendChild(ic);
      const t = el("text", { x: b.x + 40, y: 66, "font-size": 12.5, "font-weight": 700, fill: "var(--ink)" }); t.textContent = b.t; g.appendChild(t);
      const s = el("text", { x: b.x + 40, y: 84, "font-size": 10.5, fill: "var(--muted)" }); s.textContent = b.s; g.appendChild(s);
      svg.appendChild(g);
      if (i < boxes.length - 1) {
        const x1 = b.x + b.w, x2 = boxes[i + 1].x;
        svg.appendChild(el("line", { x1, y1: 73, x2: x2 - 2, y2: 73, stroke: "var(--axis)", "stroke-width": 1.4, "marker-end": "url(#arrow)" }));
      }
    });
    const defs = el("defs");
    const mk = el("marker", { id: "arrow", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto" });
    mk.appendChild(el("path", { d: "M0,0 L6,3 L0,6 Z", fill: "var(--axis)" }));
    defs.appendChild(mk); svg.appendChild(defs);
    const cap = el("text", { x: 460, y: 132, "font-size": 11, fill: "var(--ink-2)", "text-anchor": "middle" });
    cap.textContent = "Identical document + audio to every system · fully automatic scoring";
    svg.appendChild(cap);
  }

  /* ------------------------------------------------------------- line chart */
  function lineChart(svgId, data, series, yMax, yLabel) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = "";
    const W = 460, H = 300, m = { t: 14, r: 54, b: 40, l: 42 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xOf = (i) => m.l + (iw * i) / (TIERS.length - 1);
    const yOf = (v) => m.t + ih - (ih * v) / yMax;

    const grid = el("g", { class: "grid" });
    for (let v = 0; v <= yMax; v += yMax / 5) {
      grid.appendChild(el("line", { x1: m.l, y1: yOf(v), x2: m.l + iw, y2: yOf(v) }));
      const t = el("text", { x: m.l - 8, y: yOf(v) + 3.5, "text-anchor": "end" }); t.textContent = Math.round(v); grid.appendChild(t);
    }
    svg.appendChild(grid);
    // x labels
    TIERS.forEach((ti, i) => {
      const t = el("text", { x: xOf(i), y: H - 20, "text-anchor": "middle" }); t.textContent = ti; svg.appendChild(t);
    });
    const sub = ["≈500", "≈1k", "≈2k", "≈4k", "≈8k"];
    TIERS.forEach((ti, i) => { const t = el("text", { x: xOf(i), y: H - 7, "text-anchor": "middle", "font-size": 9, fill: "var(--muted)" }); t.textContent = sub[i]; svg.appendChild(t); });
    const yl = el("text", { class: "axis-label", x: 0, y: 0, transform: `translate(11,${m.t + ih / 2}) rotate(-90)`, "text-anchor": "middle" }); yl.textContent = yLabel; svg.appendChild(yl);

    // lines
    series.forEach((sid) => {
      const vals = data[sid];
      if (!vals) return;
      const mdl = MODELS.find((x) => x.id === sid);
      const d = vals.map((v, i) => `${i ? "L" : "M"}${xOf(i)},${yOf(v)}`).join(" ");
      const dash = sid === "salmonn" ? "5 3" : sid === "moshi" ? "2 3" : "";
      svg.appendChild(el("path", { d, fill: "none", style: `stroke:${cvar(mdl.v)}`, "stroke-width": 2.2,
        "stroke-linejoin": "round", "stroke-dasharray": dash }));
      vals.forEach((v, i) => {
        const c = el("circle", { cx: xOf(i), cy: yOf(v), r: 4.2, style: `fill:${cvar(mdl.v)}`, stroke: "var(--surface)", "stroke-width": 1.5 });
        const title = el("title"); title.textContent = `${mdl.label} · ${TIERS[i]}: ${v}%`; c.appendChild(title);
        svg.appendChild(c);
      });
      // end label
      const lastX = xOf(TIERS.length - 1), lastY = yOf(vals[vals.length - 1]);
      const lbl = el("text", { x: lastX + 6, y: lastY + 3.5, "font-size": 10, "font-weight": 700, style: `fill:${cvar(mdl.v)}` });
      lbl.textContent = mdl.label.replace("GPT-Realtime", "GPT-RT");
      svg.appendChild(lbl);
    });
  }

  function legend() {
    const box = document.getElementById("modelLegend");
    if (!box) return;
    box.innerHTML = "";
    MODELS.forEach((mdl) => {
      const it = document.createElement("span"); it.className = "item";
      it.innerHTML = `<span class="swatch" style="background:${cvar(mdl.v)}"></span>${mdl.label}`;
      box.appendChild(it);
    });
  }

  /* ----------------------------------------------------------------- tables */
  const dot = (v) => `<span class="dot" style="background:${cvar(v)}"></span>`;
  const num = (x) => (typeof x === "number" ? x.toFixed(1) : x);
  function delta(x) {
    const s = (x > 0 ? "+" : "") + x.toFixed(1);
    const cls = x > 0 ? "pos" : x < 0 ? "neg" : "";
    return `<span class="${cls}">${s}</span>`;
  }
  function mrow(mdlId, cells) {
    const mdl = MODELS.find((x) => x.id === mdlId) || { v: "--m-moshi", label: mdlId };
    return `<tr><td>${dot(mdl.v)}${mdl.label}</td>${cells}</tr>`;
  }

  function tableA() {
    const t = document.getElementById("tblA"); if (!t) return;
    const rows = [["cascaded"], ["gpt"], ["minicpm"], ["uv"], ["salmonn"], ["moshi"]];
    // best (max) per tier for bolding
    const best = TIERS.map((_, i) => Math.max(...rows.map((r) => GA[r[0]][i])));
    let body = rows.map(([id]) =>
      mrow(id, GA[id].map((v, i) => `<td class="${v === best[i] ? "best" : ""}">${v.toFixed(1)}</td>`).join(""))
    ).join("");
    // Moshi-EC extra row
    const ec = [8.0, 3.0, 3.1, 3.0, 6.0];
    body += `<tr><td>${dot("--m-moshi")}Moshi–EC</td>${ec.map((v) => `<td>${v.toFixed(1)}</td>`).join("")}</tr>`;
    t.innerHTML = `<thead><tr><th>Model</th>${TIERS.map((ti, i) => `<th>${ti}<br><span style="font-weight:400;color:var(--muted)">${["≈500","≈1k","≈2k","≈4k","≈8k"][i]}</span></th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
  }

  function tableB() {
    const t = document.getElementById("tblB"); if (!t) return;
    const d = {
      cascaded: [100.0, 95.0, 97.5, -2.5], gpt: [3.3, 58.3, 0.0, -3.3],
      minicpm: [8.3, 56.7, 2.5, -5.8], uv: [11.7, 48.3, 0.0, -11.7],
      salmonn: [1.7, 8.3, 2.5, 0.8], moshi: [0.0, 0.8, 0.0, 0.0],
    };
    const body = ["cascaded", "gpt", "minicpm", "uv", "salmonn", "moshi"].map((id) => {
      const r = d[id];
      const gdsBold = id === "uv" ? ` style="font-weight:800"` : "";
      return mrow(id, `<td>${num(r[0])}</td><td>${num(r[1])}</td><td>${num(r[2])}</td><td${gdsBold}>${delta(r[3])}</td>`);
    }).join("");
    t.innerHTML = `<thead><tr><th>Model</th><th>GA(A)</th><th>GA(B)</th><th>GA(A′)</th><th>GDS</th></tr></thead><tbody>${body}</tbody>`;
  }

  function tableC() {
    const t = document.getElementById("tblC"); if (!t) return;
    const d = {
      cascaded: [87.8, 94.2, 100.0, 6.4, 12.2], gpt: [79.6, 94.2, 98.1, 14.6, 18.5],
      uv: [85.7, 86.5, 73.1, 0.8, -12.6], minicpm: [65.3, 65.4, 59.6, 0.1, -5.7],
      salmonn: [51.0, 50.0, 19.2, -1.0, -31.8], moshi: [0.0, 0.0, 0.0, 0.0, 0.0],
    };
    const body = ["cascaded", "gpt", "uv", "minicpm", "salmonn", "moshi"].map((id) => {
      const r = d[id]; const bestC = Math.max(r[0], r[1], r[2]);
      const c = (v) => `<td class="${v === bestC && bestC > 0 ? "best" : ""}">${v.toFixed(1)}</td>`;
      return mrow(id, `${c(r[0])}${c(r[1])}${c(r[2])}<td>${delta(r[3])}</td><td>${delta(r[4])}</td>`);
    }).join("");
    t.innerHTML = `<thead><tr><th>Model</th><th>C₀</th><th>C₁</th><th>C₂</th><th>Δ<sub>light</sub></th><th>Δ<sub>heavy</sub></th></tr></thead><tbody>${body}</tbody>`;
  }

  function tableL() {
    const t = document.getElementById("tblL"); if (!t) return;
    const rows = [
      ["moshi", "Moshi (original)", 173, 173, 175, 173, "Low latency, minimal grounding"],
      ["moshi", "Moshi–EC", 210, 209, 212, 207, "+37 ms EC overhead; GA = .015"],
      ["gpt", "GPT-Realtime", 1808, 990, 1323, 97, "High GA = .893"],
      ["salmonn", "SALMONN", 1275, 1776, 5814, 484, "High p95 tail at long context"],
      ["cascaded", "Cascaded", 1445, 1703, 3322, 92, "94% of FTED is the LLM"],
      ["minicpm", "MiniCPM-o", 2055, 3041, 7790, 169, "High tail at large context"],
      ["uv", "UV-32B", 2116, 2030, 2330, 443, "CoT overhead; not real-time"],
    ];
    const minQAL = Math.min(...rows.map((r) => r[5]));
    const body = rows.map((r) => {
      const mdl = MODELS.find((x) => x.id === r[0]);
      const q = `<td class="${r[5] === minQAL ? "best" : ""}">${r[5].toLocaleString()}</td>`;
      return `<tr><td>${dot(mdl.v)}${r[1]}</td><td>${r[2].toLocaleString()}</td><td>${r[3].toLocaleString()}</td><td>${r[4].toLocaleString()}</td>${q}<td style="text-align:left;color:var(--ink-2);white-space:normal">${r[6]}</td></tr>`;
    }).join("");
    t.innerHTML = `<thead><tr><th>Model</th><th>p50 ↓</th><th>mean ↓</th><th>p95 ↓</th><th>QAL ↓</th><th style="text-align:left">Notes</th></tr></thead><tbody>${body}</tbody>`;
  }

  function render() {
    pipeline();
    lineChart("chartGA", GA, MODELS.map((m) => m.id), 100, "Grounding Accuracy (%)");
    lineChart("chartHR", HR, ["cascaded", "gpt", "minicpm", "uv", "salmonn"], 60, "Hallucination Rate (%)");
    legend();
    tableA(); tableB(); tableC(); tableL();
  }

  window.__redrawCharts = render;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
