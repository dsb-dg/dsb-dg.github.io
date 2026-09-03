#!/usr/bin/env python3
"""
Assemble the self-contained explorer dataset for the DSB-DG project website.

Produces three sections, all grounded in real benchmark artifacts (no synthesis):

  exp_a  Context Saturation — single-turn cross-model units, each with the source
         document (at the asked tier) and the highlighted supporting evidence, plus
         the real spoken-question audio.
  exp_b  Grounding Decay — full multi-turn conversation transcripts (user turns from
         the conversation script + every model's probe responses from results/exp_b),
         with the probe→distractor→repeat structure and GA(A)/GA(B)/GA(A')/GDS.
  exp_c  Proactive Grounding — the same conversations with per-model GA under
         no / single / multiple context refreshes (C0/C1/C2) and the injection deltas.
         (Per-turn transcripts were not persisted for Exp C; only aggregates exist.)

Documents are stored once in a shared `documents` map (keyed by doc_id__tier) and
referenced by examples, so large tier texts are not duplicated.

Outputs: assets/data/explorer_data.json  and  assets/data/explorer_data.js
(window.EXPLORER_DATA), plus the question-audio clips used by Exp A.
"""
import json, glob, os, shutil, collections

REPO      = "/home/colligo/DocGroundDuplex-Bench"
BACKUP    = "/mnt/bindfs/sensei-fs/users/puneetm/dsb-rework-backup"
AUDIO_SRC = os.path.join(BACKUP, "audio")
CONVS_SRC = os.path.join(BACKUP, "convs")
SITE      = "/home/colligo/DSB-DG/website"
OUT_JSON  = os.path.join(SITE, "assets/data/explorer_data.json")
OUT_JS    = os.path.join(SITE, "assets/data/explorer_data.js")
OUT_AUDIO = os.path.join(SITE, "assets/audio")

MODELS = ["cascaded", "gpt_realtime", "minicpmo", "ultravox", "salmonn", "moshi"]
MODEL_LABEL = {"cascaded": "Cascaded", "gpt_realtime": "GPT-Realtime", "minicpmo": "MiniCPM-o",
               "ultravox": "UV-32B", "salmonn": "SALMONN", "moshi": "Moshi"}
DOMAIN_LABEL = {"clinical": "Clinical Trials", "earnings": "Earnings Calls", "fda_510k": "FDA 510(k)",
                "leases": "Commercial Leases", "municipal": "Municipal Minutes"}
QA_DOMAIN_DIR = {"clinical": "clinical", "earnings": "earnings", "fda_510k": "fda_510k",
                 "leases": "leases", "municipal": "municipal"}
TIER_TOK = {"T1": "≈500", "T2": "≈1k", "T3": "≈2k", "T4": "≈4k", "T5": "≈8k"}

# --------------------------------------------------------------------- helpers
def verdict(j):
    if j.get("no_response"): return "no_response"
    if j.get("appropriate_refusal"): return "refusal"
    if j.get("factual_accuracy") == 1: return "grounded"
    if j.get("hallucination_type", "none") in ("intrinsic", "extrinsic", "both"): return "hallucination"
    return "ungrounded"

# shared document store: "doc_id__tier" -> text
documents = {}
def doc_key(domain, doc_id, tier):
    k = f"{doc_id}__{tier}"
    if k not in documents:
        p = os.path.join(REPO, "data/tiers", domain, f"{doc_id}_{tier}.txt")
        try:
            documents[k] = open(p, encoding="utf-8").read()
        except OSError:
            documents[k] = ""
    return k

print("Loading QA evidence spans ...")
support = {}
qa_meta = {}
for dom, ddir in QA_DOMAIN_DIR.items():
    for f in glob.glob(os.path.join(REPO, "data/qa_final", ddir, "*.json")):
        for qa in json.load(open(f)):
            support[qa["qa_id"]] = qa.get("supporting_sentences", []) or []
            qa_meta[qa["qa_id"]] = qa
print(f"  {len(support)} QA records")

have_audio = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(AUDIO_SRC, "*.wav"))}
print(f"  {len(have_audio)} question-audio clips")

# ============================================================ EXP A (single-turn)
print("Building Exp A ...")
units = {}   # (qa_id,tier) -> {"meta":..,"models":{}}
for m in MODELS:
    for f in glob.glob(os.path.join(REPO, "results/exp_a", m, "*.json")):
        if f.endswith("_errors.log"): continue
        try: d = json.load(open(f))
        except Exception: continue
        u = units.setdefault((d["qa_id"], d["tier"]), {"meta": {}, "models": {}})
        if not u["meta"]:
            u["meta"] = {k: d.get(k) for k in ("qa_id", "tier", "min_tier", "domain", "doc_id",
                                               "question_type", "reasoning_type", "question_text", "ground_truth_answer")}
        j = d["judgment"]
        u["models"][m] = {"transcript": (d.get("scored_transcript") or d.get("model_text") or "").strip(),
                          "verdict": verdict(j), "hallucination_type": j.get("hallucination_type", "none"),
                          "fted_ms": round(d["fted_ms"]) if isinstance(d.get("fted_ms"), (int, float)) else None,
                          "addresses": bool(j.get("response_addresses_question"))}

def complete(u, need=6):
    return len(u["models"]) >= need and u["meta"]["qa_id"] in have_audio

t3 = {k: v for k, v in units.items() if k[1] == "T3" and complete(v)}
selected = collections.OrderedDict()
def add(key, u, *tags):
    if key in selected: selected[key][1].update(tags); return
    if complete(u): selected[key] = (u, set(tags))

FAIL = ("hallucination", "ungrounded", "no_response")
# (1) SALMONN capacity cliff (T3 correct -> T4 collapse), balanced by domain
pd = collections.Counter()
for (qid, _), u in sorted(t3.items()):
    if pd[u["meta"]["domain"]] >= 1 or sum(pd.values()) >= 6: continue
    u4 = units.get((qid, "T4"))
    if u4 and complete(u4) and u["models"].get("salmonn", {}).get("verdict") == "grounded" \
       and u4["models"].get("salmonn", {}).get("verdict") in FAIL:
        add((qid, "T3"), u, "cliff"); add((qid, "T4"), u4, "cliff"); pd[u["meta"]["domain"]] += 1
# (2) unanswerable: refusal vs false confidence
pd = collections.Counter()
for (qid, _), u in sorted(t3.items()):
    dom = u["meta"]["domain"]
    if u["meta"]["question_type"] != "unanswerable" or pd[dom] >= 2 or sum(pd.values()) >= 10: continue
    vs = {m: r["verdict"] for m, r in u["models"].items()}
    if "refusal" in vs.values() and any(v in ("hallucination", "ungrounded") for v in vs.values()):
        add((qid, "T3"), u, "unanswerable"); pd[dom] += 1
# (3) Moshi fails where strong models succeed
pd = collections.Counter()
for (qid, _), u in sorted(t3.items()):
    dom = u["meta"]["domain"]
    if u["meta"]["question_type"] != "grounded" or pd[dom] >= 2 or sum(pd.values()) >= 8: continue
    if u["models"].get("cascaded", {}).get("verdict") == "grounded" and u["models"].get("moshi", {}).get("verdict") in FAIL:
        add((qid, "T3"), u, "moshi-fail"); pd[dom] += 1
# (4) per-domain coverage
by_dom = collections.Counter(selected[k][0]["meta"]["domain"] for k in selected)
for (qid, _), u in sorted(t3.items()):
    dom = u["meta"]["domain"]
    if by_dom[dom] >= 7: continue
    grounded = sum(1 for r in u["models"].values() if r["verdict"] == "grounded")
    before = len(selected); add((qid, "T3"), u, "consensus" if grounded >= 5 else "mixed")
    if len(selected) > before: by_dom[dom] += 1
# (5) long-context T5
t5 = {k: v for k, v in units.items() if k[1] == "T5" and complete(v)}
pd = collections.Counter()
for (qid, _), u in sorted(t5.items()):
    dom = u["meta"]["domain"]
    if pd[dom] >= 1 or sum(pd.values()) >= 6: continue
    if u["meta"]["question_type"] == "grounded" and u["models"].get("cascaded", {}).get("verdict") == "grounded":
        add((qid, "T5"), u, "long-context"); pd[dom] += 1

exp_a = []
copied = set()
for (qid, tier), (u, tags) in selected.items():
    meta = u["meta"]
    if qid not in copied:
        src = os.path.join(AUDIO_SRC, qid + ".wav")
        if os.path.exists(src):
            os.makedirs(OUT_AUDIO, exist_ok=True); shutil.copy2(src, os.path.join(OUT_AUDIO, qid + ".wav")); copied.add(qid)
    exp_a.append({
        "id": f"{qid}__{tier}", "qa_id": qid, "tier": tier, "tier_tokens": TIER_TOK.get(tier, ""),
        "domain": meta["domain"], "domain_label": DOMAIN_LABEL.get(meta["domain"], meta["domain"]),
        "doc_id": meta["doc_id"], "question_type": meta["question_type"], "reasoning_type": meta["reasoning_type"],
        "question_text": meta["question_text"], "reference_answer": meta["ground_truth_answer"],
        "evidence": support.get(qid, []),
        "doc": doc_key(meta["domain"], meta["doc_id"], tier),
        "audio": (qid + ".wav") if qid in copied else None,
        "models": [dict(id=m, label=MODEL_LABEL[m], **u["models"][m]) for m in MODELS if m in u["models"]],
        "tags": sorted(tags),
    })
exp_a.sort(key=lambda r: (r["domain_label"], r["tier"], r["qa_id"]))
print(f"  Exp A: {len(exp_a)} examples, {len(copied)} audio clips")

# ============================================================ EXP B + C (multi-turn)
print("Building Exp B / C ...")
def load_conv(conv_id):
    p = os.path.join(CONVS_SRC, conv_id + ".json")
    return json.load(open(p)) if os.path.exists(p) else None

def exp_result(exp, model, conv_id):
    p = os.path.join(REPO, "results", exp, model, conv_id + ".json")
    return json.load(open(p)) if os.path.exists(p) else None

conv_ids = sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(CONVS_SRC, "exp_b_*.json")))
exp_b, exp_c = [], []
for cid in conv_ids:
    conv = load_conv(cid)
    if not conv: continue
    domain, doc_id, tier = conv["domain"], conv["doc_id"], conv.get("tier", "T3")
    # per-model exp_b results: turn_number -> response
    per_model_turns, decay = {}, {}
    for m in MODELS:
        r = exp_result("exp_b", m, cid)
        if not r: continue
        decay[m] = {"ga_a": r.get("ga_probe_a"), "ga_b": r.get("ga_probe_b"),
                    "ga_a_repeat": r.get("ga_probe_a_repeat"), "gds": r.get("GDS")}
        per_model_turns[m] = {t["turn"]: t for t in r.get("per_turn", [])}
    if not decay: continue

    # union of evidence for every probe fact in this conversation
    ev = []
    for t in conv["turns"]:
        pf = t.get("probe_fact")
        if pf: ev += support.get(pf, [])
    seen = set(); ev = [e for e in ev if not (e in seen or seen.add(e))]

    # full transcript: every user turn; probe turns carry each model's response
    turns_out = []
    for t in conv["turns"]:
        if t.get("speaker") != "user":
            continue
        tn = t["turn_number"]; ttype = t.get("turn_type", "")
        row = {"turn": tn, "type": ttype, "text": t.get("text", ""), "expected": t.get("expected_answer")}
        if ttype.startswith("probe"):
            resp = {}
            for m in MODELS:
                pt = per_model_turns.get(m, {}).get(tn)
                if pt is not None:
                    resp[m] = {"transcript": (pt.get("scored") or pt.get("model_text") or "").strip(),
                               "fa": pt.get("fa")}
            row["responses"] = resp
        turns_out.append(row)

    exp_b.append({
        "id": cid, "conv_id": cid, "domain": domain, "domain_label": DOMAIN_LABEL.get(domain, domain),
        "doc_id": doc_id, "tier": tier, "tier_tokens": TIER_TOK.get(tier, ""),
        "doc": doc_key(domain, doc_id, tier), "evidence": ev,
        "decay": [dict(id=m, label=MODEL_LABEL[m], **decay[m]) for m in MODELS if m in decay],
        "turns": turns_out,
    })

    # Exp C aggregates
    cvals = {}
    for m in MODELS:
        r = exp_result("exp_c", m, cid)
        if r: cvals[m] = {"c0": r.get("GA_C0"), "c1": r.get("GA_C1"), "c2": r.get("GA_C2"),
                          "dlight": r.get("delta_light"), "dheavy": r.get("delta_heavy"), "dmarg": r.get("delta_marginal")}
    if cvals:
        # user turns only (no per-model responses stored for Exp C)
        uturns = [{"turn": t["turn_number"], "type": t.get("turn_type", ""), "text": t.get("text", ""),
                   "expected": t.get("expected_answer")} for t in conv["turns"] if t.get("speaker") == "user"]
        exp_c.append({
            "id": cid, "conv_id": cid, "domain": domain, "domain_label": DOMAIN_LABEL.get(domain, domain),
            "doc_id": doc_id, "tier": tier, "tier_tokens": TIER_TOK.get(tier, ""),
            "doc": doc_key(domain, doc_id, tier), "evidence": ev,
            "refresh": [dict(id=m, label=MODEL_LABEL[m], **cvals[m]) for m in MODELS if m in cvals],
            "turns": uturns,
        })
exp_b.sort(key=lambda r: (r["domain_label"], r["conv_id"]))
exp_c.sort(key=lambda r: (r["domain_label"], r["conv_id"]))
print(f"  Exp B: {len(exp_b)} conversations · Exp C: {len(exp_c)} conversations")

# ------------------------------------------------------------------- emit
payload = {
    "meta": {
        "n_exp_a": len(exp_a), "n_exp_b": len(exp_b), "n_exp_c": len(exp_c), "n_audio": len(copied),
        "models": [{"id": m, "label": MODEL_LABEL[m]} for m in MODELS],
        "domains": [{"id": k, "label": v} for k, v in DOMAIN_LABEL.items()],
        "note": ("Exp A question audio is the real 16 kHz clip fed to every model; model answers are the "
                 "Whisper-large-v3 transcript + GPT-4o grounding-judge verdict (answer audio was scored "
                 "in-flight, not persisted). Exp B shows full conversation transcripts with per-probe verdicts. "
                 "Exp C reports per-model grounding accuracy under context-refresh conditions (aggregate; "
                 "per-turn transcripts were not stored)."),
    },
    "documents": documents,
    "exp_a": exp_a, "exp_b": exp_b, "exp_c": exp_c,
}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
json.dump(payload, open(OUT_JSON, "w"), indent=1, ensure_ascii=False)
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write("window.EXPLORER_DATA = "); json.dump(payload, f, ensure_ascii=False); f.write(";\n")
print(f"Wrote {OUT_JSON} ({os.path.getsize(OUT_JSON)//1024} KB) + explorer_data.js "
      f"({os.path.getsize(OUT_JS)//1024} KB); {len(documents)} unique documents")
