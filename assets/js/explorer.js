/* ============================================================================
   DSB-DG Audio Explorer — three protocols, evidence-highlighted documents,
   full multi-turn conversation transcripts. Data: window.EXPLORER_DATA.
   ============================================================================ */
(function () {
  "use strict";
  const DATA = window.EXPLORER_DATA;
  const listEl = document.getElementById("list");
  if (!DATA) { listEl.innerHTML = "<p class='empty-state'>Data failed to load.</p>"; return; }
  const DOCS = DATA.documents || {};

  const MODEL_VAR = { cascaded: "--m-cascaded", gpt_realtime: "--m-gpt", minicpmo: "--m-minicpm",
    ultravox: "--m-uv", salmonn: "--m-salmonn", moshi: "--m-moshi" };
  const MODEL_ORDER = ["cascaded", "gpt_realtime", "minicpmo", "ultravox", "salmonn", "moshi"];
  const VERDICT = {
    grounded: { t: "Grounded", c: "v-grounded" }, refusal: { t: "Calibrated refusal", c: "v-refusal" },
    hallucination: { t: "Hallucination", c: "v-hallucination" }, ungrounded: { t: "Ungrounded", c: "v-ungrounded" },
    no_response: { t: "No response", c: "v-no_response" } };
  const TAG_LABEL = { cliff: "Capacity cliff", "moshi-fail": "Moshi fails", unanswerable: "Refusal contrast",
    consensus: "Consensus grounded", mixed: "Mixed verdicts", "long-context": "Long context (8k)" };
  const TIER_LABEL = { T1: "T1 · ≈500", T2: "T2 · ≈1k", T3: "T3 · ≈2k", T4: "T4 · ≈4k", T5: "T5 · ≈8k" };
  const TYPE_LABEL = { grounded: "Grounded", unanswerable: "Unanswerable" };
  const TABS = [
    { id: "exp_a", label: "Context Saturation", k: "Exp A",
      intro: "Single-turn: one spoken question asked under a fixed document tier. Play the question and compare every system's grounded answer, hallucination, or refusal." },
    { id: "exp_b", label: "Grounding Decay", k: "Exp B",
      intro: "Multi-turn: identical early probes (A) are replayed as late probes (A′) after distractor dialogue. Read the full conversation and watch which models forget. GDS = GA(A′) − GA(A)." },
    { id: "exp_c", label: "Proactive Grounding", k: "Exp C",
      intro: "Multi-turn: the same conversations run under no / single / multiple mid-dialogue context refreshes (C₀/C₁/C₂). Does re-injecting the document restore grounding — or overwhelm it?" },
  ];

  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");
  const cvarBar = (id) => `var(${MODEL_VAR[id] || "--m-moshi"})`;

  const state = { tab: "exp_a", domain: new Set(), tier: new Set(), type: new Set(), tag: new Set(), q: "" };

  // ---- evidence-highlighted document -------------------------------------
  function highlightDoc(text, evidence) {
    if (!text) return "";
    const ranges = [];
    (evidence || []).forEach((s) => {
      if (!s || !s.trim()) return;
      const pat = s.trim().split(/\s+/).map(escRe).join("\\s+");
      let m; let re;
      try { re = new RegExp(pat, "g"); } catch (e) { return; }
      while ((m = re.exec(text)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });
    let out = "", pos = 0;
    merged.forEach(([a, b]) => { out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; pos = b; });
    return out + esc(text.slice(pos));
  }
  function docDetails(docKey, evidence, tier) {
    const text = DOCS[docKey] || "";
    if (!text) return "";
    const n = (evidence || []).filter(Boolean).length;
    return `<details class="doc"><summary>📄 Source document
      <span style="color:var(--muted);font-weight:500">· ${esc(tier || "")} tier · ${n} evidence span${n === 1 ? "" : "s"} highlighted</span>
      <span class="hint">expand to verify ▾</span></summary>
      <div class="doc-body"><pre>${highlightDoc(text, evidence)}</pre></div></details>`;
  }

  // ---- filters -----------------------------------------------------------
  function chip(label, group, value) {
    const b = document.createElement("button");
    b.className = "chip" + (group === "tag" ? " tag" : "");
    b.textContent = label; b.dataset.group = group; b.dataset.value = value;
    b.addEventListener("click", () => {
      const set = state[group];
      if (set.has(value)) set.delete(value); else set.add(value);
      b.classList.toggle("active"); render();
    });
    return b;
  }
  function buildTabs() {
    const box = document.getElementById("tabs");
    TABS.forEach((t) => {
      const n = (DATA[t.id] || []).length;
      const b = document.createElement("button");
      b.className = "tab" + (t.id === state.tab ? " active" : "");
      b.innerHTML = `<span class="k">${t.k}</span> ${t.label} <span class="n">${n}</span>`;
      b.addEventListener("click", () => {
        state.tab = t.id;
        document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        document.getElementById("tabIntro").textContent = t.intro;
        syncFilterVisibility(); render();
      });
      box.appendChild(b);
    });
    document.getElementById("tabIntro").textContent = TABS[0].intro;
  }
  function buildFilters() {
    const dm = document.getElementById("fDomain");
    const domainsInUse = new Set();
    ["exp_a", "exp_b", "exp_c"].forEach((k) => (DATA[k] || []).forEach((e) => domainsInUse.add(e.domain)));
    DATA.meta.domains.filter((d) => domainsInUse.has(d.id)).forEach((d) => dm.appendChild(chip(d.label, "domain", d.id)));
    const tiers = [...new Set((DATA.exp_a || []).map((e) => e.tier))].sort();
    tiers.forEach((t) => document.getElementById("fTier").appendChild(chip(TIER_LABEL[t] || t, "tier", t)));
    Object.keys(TYPE_LABEL).forEach((t) => {
      if ((DATA.exp_a || []).some((e) => e.question_type === t)) document.getElementById("fType").appendChild(chip(TYPE_LABEL[t], "type", t));
    });
    const tags = new Set(); (DATA.exp_a || []).forEach((e) => e.tags.forEach((t) => tags.add(t)));
    ["cliff", "moshi-fail", "unanswerable", "consensus", "mixed", "long-context"].filter((t) => tags.has(t))
      .forEach((t) => document.getElementById("fTag").appendChild(chip(TAG_LABEL[t], "tag", t)));
    document.getElementById("search").addEventListener("input", (e) => { state.q = e.target.value.toLowerCase().trim(); render(); });
    document.getElementById("footNote").textContent =
      `${DATA.meta.n_exp_a} single-turn · ${DATA.meta.n_exp_b} decay + ${DATA.meta.n_exp_c} proactive conversations · ${DATA.meta.n_audio} spoken clips`;
  }
  function syncFilterVisibility() {
    const showA = state.tab === "exp_a";
    ["grpTier", "grpType", "grpTag"].forEach((id) => { document.getElementById(id).style.display = showA ? "" : "none"; });
  }

  // ---- matching ----------------------------------------------------------
  function matchDomainSearch(e, hay) {
    if (state.domain.size && !state.domain.has(e.domain)) return false;
    if (state.q && !hay.toLowerCase().includes(state.q)) return false;
    return true;
  }
  function matchA(e) {
    if (state.tier.size && !state.tier.has(e.tier)) return false;
    if (state.type.size && !state.type.has(e.question_type)) return false;
    if (state.tag.size && !e.tags.some((t) => state.tag.has(t))) return false;
    const hay = [e.question_text, e.reference_answer, e.qa_id, e.domain_label,
      e.models.map((m) => m.transcript).join(" "), DOCS[e.doc] || ""].join(" ");
    return matchDomainSearch(e, hay);
  }
  function matchConv(e) {
    const hay = [e.doc_id, e.domain_label, e.turns.map((t) => t.text).join(" "),
      (e.turns || []).map((t) => t.responses ? Object.values(t.responses).map((r) => r.transcript).join(" ") : "").join(" "),
      DOCS[e.doc] || ""].join(" ");
    return matchDomainSearch(e, hay);
  }

  // ---- Exp A card --------------------------------------------------------
  function verdictBadge(m) {
    const v = VERDICT[m.verdict] || VERDICT.no_response;
    let label = v.t;
    if (m.verdict === "hallucination" && m.hallucination_type && m.hallucination_type !== "none") label += ` · ${m.hallucination_type}`;
    return `<span class="verdict ${v.c}"><span class="g"></span>${label}</span>`;
  }
  function respRowA(m) {
    const say = m.transcript ? `<div class="say">“${esc(m.transcript)}”</div>` : `<div class="say empty">(no scoreable response)</div>`;
    const fted = (m.fted_ms != null) ? `<span class="fted">${m.fted_ms.toLocaleString()} ms</span>` : "";
    return `<div class="resp"><span class="model"><span class="bar" style="background:${cvarBar(m.id)}"></span>${esc(m.label)}</span>
      ${say}<span class="side">${verdictBadge(m)}${fted}</span></div>`;
  }
  function cardA(e) {
    const models = MODEL_ORDER.map((id) => e.models.find((m) => m.id === id)).filter(Boolean);
    const tags = e.tags.filter((t) => TAG_LABEL[t]).map((t) => `<span class="meta-tag hl">${TAG_LABEL[t]}</span>`).join("");
    const ref = e.question_type === "unanswerable"
      ? `<span class="k">Reference:</span> Unanswerable — not stated in the document.`
      : `<span class="k">Reference answer:</span> ${esc(e.reference_answer) || "—"}`;
    const audio = e.audio ? `<audio controls preload="none" src="assets/audio/${esc(e.audio)}"></audio>` : `<span class="audio-label">(question audio unavailable)</span>`;
    return `<article class="ex-card"><div class="ex-top">
      <div class="ex-meta">
        <span class="meta-tag dom">${esc(e.domain_label)}</span>
        <span class="meta-tag tier">${esc(e.tier)} · ${esc(e.tier_tokens)} tok</span>
        <span class="meta-tag ${e.question_type === "unanswerable" ? "qtype-unanswerable" : ""}">${esc(e.question_type)}</span>
        ${e.reasoning_type ? `<span class="meta-tag">${esc(e.reasoning_type)}</span>` : ""}${tags}</div>
      <div class="ex-q">${esc(e.question_text)}</div>
      <div class="audio-row"><span class="audio-label">🎙️ Spoken question</span>${audio}</div>
      <div class="ref-box">${ref}</div>
      ${docDetails(e.doc, e.evidence, e.tier)}
    </div><div class="responses"><div class="rt">Model responses · ${models.length} systems</div>
      ${models.map(respRowA).join("")}</div></article>`;
  }

  // ---- Exp B card (conversation + decay) ---------------------------------
  function decayChip(d) {
    const gds = d.gds; const cls = gds < 0 ? "neg" : gds > 0 ? "pos" : "";
    const gtxt = gds == null ? "—" : (gds > 0 ? "+" : "") + Math.round(gds * 100);
    return `<span class="decay-chip"><span class="bar" style="background:${cvarBar(d.id)}"></span>
      <b>${esc(d.label)}</b><span class="flow">${pct(d.ga_a)}→${pct(d.ga_a_repeat)}</span>
      <span class="gds ${cls}">GDS ${gtxt}</span></span>`;
  }
  function probeResp(t) {
    const rows = MODEL_ORDER.map((id) => {
      const r = (t.responses || {})[id]; if (!r) return "";
      const say = r.transcript ? `<span class="say">“${esc(r.transcript)}”</span>` : `<span class="say empty">(no response)</span>`;
      const fa = r.fa === 1 ? `<span class="fa ok" title="grounded">✓</span>` : `<span class="fa no" title="not grounded">✗</span>`;
      return `<span class="m"><span class="bar" style="background:${cvarBar(id)}"></span>${esc(MODEL_LABEL(id))}</span>${say}${fa}`;
    }).join("");
    return `<div class="probe-resp">${rows}</div>`;
  }
  function MODEL_LABEL(id) { return (DATA.meta.models.find((m) => m.id === id) || {}).label || id; }
  function turnRow(t) {
    const type = t.type || "";
    if (type.startsWith("probe")) {
      const tagcls = type;
      const label = type === "probe_a_repeat" ? "probe A′ (repeat)" : type === "probe_b" ? "probe B" : "probe A";
      const exp = t.expected ? `<div class="expected">Expected: <b>${esc(t.expected)}</b></div>` : "";
      return `<div class="turn"><div class="uline"><span class="who">User</span>
        <span class="utext">${esc(t.text)} <span class="ttag ${tagcls}">${label}</span></span></div>
        ${exp}${probeResp(t)}</div>`;
    }
    const dim = (type === "opening" || type === "closing") ? " " + type : "";
    const tag = type === "distractor" ? ` <span class="ttag distractor">distractor</span>` : "";
    return `<div class="turn${dim}"><div class="uline"><span class="who">User</span>
      <span class="utext">${esc(t.text)}${tag}</span></div></div>`;
  }
  function cardB(e) {
    const decay = MODEL_ORDER.map((id) => e.decay.find((d) => d.id === id)).filter(Boolean);
    const nProbe = e.turns.filter((t) => (t.type || "").startsWith("probe")).length;
    return `<article class="ex-card"><div class="ex-top">
      <div class="ex-meta">
        <span class="meta-tag dom">${esc(e.domain_label)}</span>
        <span class="meta-tag tier">${esc(e.tier)} · ${esc(e.tier_tokens)} tok</span>
        <span class="meta-tag">${e.turns.length}-turn conversation</span>
        <span class="meta-tag">${esc(e.doc_id)}</span></div>
      <div class="ex-q">Grounding decay across dialogue</div>
      <div class="decay-row">${decay.map(decayChip).join("")}</div>
      ${docDetails(e.doc, e.evidence, e.tier)}
    </div><div class="convo"><div class="rt">Full conversation · ${e.turns.length} user turns · ${nProbe} probes</div>
      ${e.turns.map(turnRow).join("")}</div></article>`;
  }

  // ---- Exp C card (refresh outcomes) -------------------------------------
  function refreshRow(r) {
    const bar = (lab, v, hue) => `<div class="rf-bar"><span>${lab}</span>
      <div class="rf-track"><div class="rf-fill" style="width:${Math.round((v || 0) * 100)}%;background:${hue}"></div></div>
      <span class="v">${pct(v)}</span></div>`;
    const dh = r.dheavy; const cls = dh < 0 ? "neg" : dh > 0 ? "pos" : "";
    const dtxt = dh == null ? "—" : (dh > 0 ? "+" : "") + Math.round(dh * 100);
    return `<div class="rf-row"><span class="m"><span class="bar" style="background:${cvarBar(r.id)}"></span>${esc(r.label)}</span>
      <div class="rf-bars">${bar("C₀", r.c0, "var(--muted)")}${bar("C₁", r.c1, "var(--accent)")}${bar("C₂", r.c2, "var(--accent-ink)")}</div>
      <span class="rf-delta ${cls}" title="Δheavy = GA(C₂) − GA(C₀)">Δ ${dtxt}</span></div>`;
  }
  function cardC(e) {
    const rf = MODEL_ORDER.map((id) => e.refresh.find((r) => r.id === id)).filter(Boolean);
    const convo = e.turns.map((t) => {
      const tag = (t.type || "").startsWith("probe") ? ` <span class="ttag ${t.type}">${t.type === "probe_a_repeat" ? "probe A′" : t.type === "probe_b" ? "probe B" : "probe A"}</span>`
        : (t.type === "distractor" ? ` <span class="ttag distractor">distractor</span>` : "");
      return `<div class="turn ${t.type || ""}"><div class="uline"><span class="who">User</span><span class="utext">${esc(t.text)}${tag}</span></div></div>`;
    }).join("");
    return `<article class="ex-card"><div class="ex-top">
      <div class="ex-meta">
        <span class="meta-tag dom">${esc(e.domain_label)}</span>
        <span class="meta-tag tier">${esc(e.tier)} · ${esc(e.tier_tokens)} tok</span>
        <span class="meta-tag">${e.turns.length}-turn conversation</span>
        <span class="meta-tag">${esc(e.doc_id)}</span></div>
      <div class="ex-q">Effect of mid-dialogue context refresh</div>
      ${docDetails(e.doc, e.evidence, e.tier)}
    </div><div class="refresh-grid">
      <div class="rt">Grounding accuracy by refresh strategy · C₀ none · C₁ single · C₂ multiple</div>
      ${rf.map(refreshRow).join("")}
      <details class="doc" style="margin-top:14px"><summary>💬 Conversation script <span class="hint">expand ▾</span></summary>
        <div class="doc-body" style="max-height:300px">${convo}</div></details>
    </div></article>`;
  }

  // ---- render ------------------------------------------------------------
  function render() {
    let items, cardFn, matchFn;
    if (state.tab === "exp_a") { items = DATA.exp_a || []; cardFn = cardA; matchFn = matchA; }
    else if (state.tab === "exp_b") { items = DATA.exp_b || []; cardFn = cardB; matchFn = matchConv; }
    else { items = DATA.exp_c || []; cardFn = cardC; matchFn = matchConv; }
    const shown = items.filter(matchFn);
    listEl.innerHTML = shown.map(cardFn).join("");
    document.getElementById("empty").style.display = shown.length ? "none" : "block";
    const noun = state.tab === "exp_a" ? "examples" : "conversations";
    document.getElementById("countLine").textContent = `Showing ${shown.length} of ${items.length} ${noun}`;
  }

  buildTabs(); buildFilters(); syncFilterVisibility(); render();
})();
