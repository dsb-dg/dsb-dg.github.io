# DSB-DG — Project Website, Explorer, Code Release

Self-contained public project page + audio explorer for **DuplexSpeechBench – Document
Grounding (DSB-DG)**, plus a clean public code release and the staged HuggingFace dataset.
No build step and no server dependency — open the HTML directly or serve the folder statically.

## Contents

```
website/
├── index.html                 Project page (abstract, framework figure, protocols, benchmark, results, cite)
├── explorer.html              Audio Explorer — three tabs: Context Saturation / Grounding Decay / Proactive Grounding
├── build_explorer_data.py     Regenerates the explorer dataset from benchmark artifacts
├── assets/
│   ├── css/styles.css
│   ├── js/charts.js           SVG result charts + tables (numbers hard-coded from the paper)
│   ├── js/explorer.js         Explorer rendering, filters, evidence highlighting, conversation transcripts
│   ├── img/                   Paper figures (intro_overview.png, main_figure.png)
│   ├── data/explorer_data.{json,js}   Explorer dataset (+ window.EXPLORER_DATA for file://)
│   └── audio/*.wav            Spoken-question clips for the Exp A examples
└── (code_release and hf_dataset are now SEPARATE top-level dirs — see below)
```

The clean **code repo** and the **HuggingFace dataset** are separate top-level dirs, ready to
upload manually:  `../code_release/`  (for GitHub)  and  `../hf_dataset/`  (for HF `puneetm/DSB-DG`).

## View it

- **Directly:** open `index.html` (the explorer loads its data from `explorer_data.js`, so it works over `file://`).
- **Or serve:** `python3 -m http.server` here, then visit `http://localhost:8000`.

Dark mode follows the OS setting and can be toggled (◐, persisted to `localStorage`).

## Audio Explorer — three protocols

- **Context Saturation (Exp A):** real spoken question + every model's transcribed answer and grounding-judge
  verdict (grounded / hallucination / calibrated refusal), with the source document collapsible and the
  supporting evidence highlighted.
- **Grounding Decay (Exp B):** full multi-turn conversation transcripts (probe → distractor → repeat) with each
  model's per-probe verdict and GA(A)→GA(A′)/GDS.
- **Proactive Grounding (Exp C):** per-model grounding accuracy under no / single / multiple context refreshes
  (C₀/C₁/C₂) with the injection deltas, plus the conversation script.

### Data provenance (no hallucinated numbers)
- Project-page result tables/charts are transcribed verbatim from the manuscript into `assets/js/charts.js`.
- Dataset statistics reflect the **released v2 benchmark** (1,636 QA) — see note below.
- Explorer examples are assembled by `build_explorer_data.py` from the real per-model results
  (`DocGroundDuplex-Bench/results/exp_{a,b,c}/`), the verified QA evidence spans, the conversation scripts, and
  the spoken-question audio. Model **answer** audio was scored in-flight and not persisted, so answers are shown
  as transcript + verdict, never re-synthesized.

Regenerate: `python3 build_explorer_data.py` (needs the benchmark repo + the sensei-fs audio backup).

## ../code_release/ — clean public code repo (separate top-level dir)

A friction-minimized copy of the evaluation harness + data-construction pipeline, derived from
`release/oss-v2` but stripped of engineering scars:
- **Removed:** `dev/` (rework tracker, secrets notes, legacy v1 code), committed `results/` and `__pycache__`,
  the private `duplex_r1` adapter, and all author paths / secret-file reads.
- **Cleaned:** `common.py` (env-only credentials, repo-relative data root, `sys.executable` for subprocesses);
  every dataset reference points to `puneetm/DSB-DG`; v2 data-construction scripts renamed to canonical names.
- **Added:** `src/eval_v2/adapter_template.py` — a documented copy-paste skeleton so anyone can benchmark
  their model by writing one file.

All Python compiles; the data wiring resolves against the shipped `data/` (1,636 records). To run the audio
evaluation, download the dataset (below) into `DSB_DATA_ROOT` and follow `code_release/OPEN_SOURCE.md`.

## Dataset (HuggingFace)

Location: `../hf_dataset/` (sibling of `website/`) → target repo **`puneetm/DSB-DG`** (private).
Contents: `benchmark.json` (1,636 QA), `tiers/`, `question_audio/` (1,636 wavs), `conversations/` (20),
`raw_clean/`, `all_qa.json`, and a dataset card (`README.md`).

Upload (after `hf auth login`):
```bash
huggingface-cli upload puneetm/DSB-DG ../hf_dataset . --repo-type dataset --private
```

## TODO before public launch
- Publish `code_release/` to GitHub and fill in the **Code** button in `index.html`
  (and the repo URL in the dataset card / `code_release/README.md`).
- Flip the HF dataset to public when ready (the website already links `puneetm/DSB-DG`).
- Note: the manuscript's Table 1 (dataset composition) predates the v2 correction; the website and dataset
  use the corrected 1,636-QA counts. Update the paper table to match.
