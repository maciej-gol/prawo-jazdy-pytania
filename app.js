// ============================================================
// Prawo Jazdy – Practice App
// ============================================================
// Single-file vanilla JS SPA.
// All state lives in localStorage under "pj_" prefixed keys.
// Routing is hash-based: #home | #question | #summary | #history | #stats

// ============================================================
// Constants
// ============================================================
const BASIC_COUNT       = 20;  // PODSTAWOWY questions per session
const SPECIALIST_COUNT  = 12;  // SPECJALISTYCZNY questions per session
const TOTAL_QUESTIONS   = BASIC_COUNT + SPECIALIST_COUNT; // 32
const PASS_THRESHOLD    = 0.917; // ~68/74 — approximate for display only

const LS_STATS    = "pj_stats";     // { questionId: { attempts, correct } }
const LS_SESSIONS = "pj_sessions";  // array of session objects (newest first)
const LS_CURRENT  = "pj_current";   // in-progress session id

// ============================================================
// State
// ============================================================
let ALL_QUESTIONS = [];   // loaded from questions.json
let currentSession = null; // { id, date, questions[], answers{}, result{} }

// ============================================================
// localStorage helpers
// ============================================================
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getStats() {
  return loadJSON(LS_STATS, {});
}

function saveStats(stats) {
  saveJSON(LS_STATS, stats);
}

function getSessions() {
  return loadJSON(LS_SESSIONS, []);
}

function saveSessions(sessions) {
  saveJSON(LS_SESSIONS, sessions);
}

function recordAnswer(questionId, isCorrect) {
  const stats = getStats();
  const key = String(questionId);
  if (!stats[key]) stats[key] = { attempts: 0, correct: 0 };
  stats[key].attempts += 1;
  if (isCorrect) stats[key].correct += 1;
  saveStats(stats);
}

// ============================================================
// Session management
// ============================================================
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function createSession() {
  const usable      = ALL_QUESTIONS.filter(q => !q.mediaMissing);
  const basic       = usable.filter(q => q.structure === "PODSTAWOWY");
  const specialist  = usable.filter(q => q.structure === "SPECJALISTYCZNY");

  const picked = [
    ...pickRandom(basic, BASIC_COUNT),
    ...pickRandom(specialist, SPECIALIST_COUNT),
  ];
  // Shuffle combined list so basic/specialist are intermixed
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }

  const session = {
    id:        uid(),
    date:      new Date().toISOString(),
    questions: picked.map(q => q.id),
    answers:   {},
    result:    null,
  };

  // Persist immediately so a refresh doesn't lose the session
  saveCurrentSessionId(session.id);
  upsertSession(session);
  return session;
}

function saveCurrentSessionId(id) {
  localStorage.setItem(LS_CURRENT, id || "");
}

function upsertSession(session) {
  const sessions = getSessions().filter(s => s.id !== session.id);
  sessions.unshift(session); // newest first
  // Keep at most 100 sessions to avoid localStorage bloat
  saveSessions(sessions.slice(0, 100));
}

function loadSession(id) {
  return getSessions().find(s => s.id === id) || null;
}

function redoSession(session) {
  const fresh = {
    id:        uid(),
    date:      new Date().toISOString(),
    questions: [...session.questions],
    answers:   {},
    result:    null,
  };
  saveCurrentSessionId(fresh.id);
  upsertSession(fresh);
  return fresh;
}

function finaliseSession(session) {
  const qMap = questionMap();
  let correct = 0;
  let basicCorrect = 0;
  let specialistCorrect = 0;
  let basicTotal = 0;
  let specialistTotal = 0;

  for (const qid of session.questions) {
    const q = qMap[qid];
    if (!q) continue;
    const userAns = session.answers[qid];
    const ok = userAns === q.correct;
    if (ok) correct++;
    if (q.structure === "PODSTAWOWY") {
      basicTotal++;
      if (ok) basicCorrect++;
    } else {
      specialistTotal++;
      if (ok) specialistCorrect++;
    }
  }

  session.result = {
    correct,
    total:           session.questions.length,
    basicCorrect,
    basicTotal,
    specialistCorrect,
    specialistTotal,
  };
  saveCurrentSessionId(null);
  upsertSession(session);
}

function questionMap() {
  const map = {};
  for (const q of ALL_QUESTIONS) map[q.id] = q;
  return map;
}

// ============================================================
// Router
// ============================================================
function router() {
  const hash = location.hash || "#home";
  const [base, ...parts] = hash.slice(1).split("/");
  const param = parts.join("/");

  switch (base) {
    case "home":    renderHome(); break;
    case "question": renderQuestion(parseInt(param, 10) || 0); break;
    case "summary": renderSummary(param); break;
    case "history": renderHistory(); break;
    case "stats":   renderStats(); break;
    default:        renderHome();
  }
}

function navigate(hash) {
  location.hash = hash;
}

// ============================================================
// Render helpers
// ============================================================
const app = () => document.getElementById("app");

function setContent(html) {
  app().innerHTML = html;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function pct(n, d) {
  if (!d) return "—";
  return Math.round(n / d * 100) + "%";
}

function passLabel(result) {
  if (!result) return "";
  const ratio = result.correct / result.total;
  return ratio >= PASS_THRESHOLD
    ? '<span class="badge pass">ZALICZONY</span>'
    : '<span class="badge fail">NIEZALICZONY</span>';
}

// ============================================================
// Views
// ============================================================

// ---- HOME --------------------------------------------------
function renderHome() {
  const sessions = getSessions();
  const stats = getStats();
  const totalAttempts = Object.values(stats).reduce((s, v) => s + v.attempts, 0);
  const totalCorrect  = Object.values(stats).reduce((s, v) => s + v.correct, 0);

  const lastFive = sessions.slice(0, 5);

  const recentRows = lastFive.length
    ? lastFive.map(s => {
        const r = s.result;
        const score = r ? `${r.correct}/${r.total} (${pct(r.correct, r.total)})` : "W trakcie…";
        return `<tr>
          <td>${formatDate(s.date)}</td>
          <td>${score}</td>
          <td>${r ? passLabel(r) : "—"}</td>
          <td><button class="btn-sm" onclick="resumeOrRedo('${s.id}')">
            ${r ? "Powtórz" : "Kontynuuj"}
          </button></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="empty">Brak sesji. Rozpocznij pierwszy egzamin!</td></tr>`;

  setContent(`
    <section class="home">
      <div class="hero">
        <h1>Testy na Prawo Jazdy</h1>
        <p>Kategoria <strong>B</strong> · ${ALL_QUESTIONS.length} pytań w bazie</p>
        <button class="btn-primary" onclick="startSession()">Rozpocznij egzamin</button>
        <p class="hint">32 pytania · 20 podstawowych + 12 specjalistycznych</p>
      </div>

      <div class="overview-cards">
        <div class="card">
          <div class="card-value">${Object.keys(stats).length}</div>
          <div class="card-label">pytań ćwiczonych</div>
        </div>
        <div class="card">
          <div class="card-value">${totalAttempts ? pct(totalCorrect, totalAttempts) : "—"}</div>
          <div class="card-label">ogólna skuteczność</div>
        </div>
        <div class="card">
          <div class="card-value">${sessions.length}</div>
          <div class="card-label">sesji łącznie</div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-header">
          <h2>Ostatnie sesje</h2>
          <a href="#history">Zobacz wszystkie →</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Wynik</th><th>Status</th><th></th></tr></thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>
    </section>
  `);
}

window.startSession = function() {
  currentSession = createSession();
  navigate("#question/0");
};

window.resumeOrRedo = function(id) {
  const session = loadSession(id);
  if (!session) return;
  if (!session.result) {
    // In-progress: find first unanswered question
    currentSession = session;
    const firstUnanswered = session.questions.findIndex(qid => !(qid in session.answers));
    navigate(`#question/${firstUnanswered === -1 ? 0 : firstUnanswered}`);
  } else {
    // Completed: redo
    currentSession = redoSession(session);
    navigate("#question/0");
  }
};

// ---- QUESTION ---------------------------------------------
function renderQuestion(index) {
  if (!currentSession) {
    // Try to resume from localStorage
    const id = localStorage.getItem(LS_CURRENT);
    if (id) {
      currentSession = loadSession(id);
    }
    if (!currentSession) {
      navigate("#home");
      return;
    }
  }

  const qids = currentSession.questions;
  if (index < 0) index = 0;
  if (index >= qids.length) {
    finaliseSession(currentSession);
    navigate(`#summary/${currentSession.id}`);
    return;
  }

  const qid = qids[index];
  const qMap = questionMap();
  const q = qMap[qid];
  if (!q) {
    navigate("#home");
    return;
  }

  const answered = qid in currentSession.answers;
  const userAnswer = currentSession.answers[qid];

  const progressPct = Math.round((index) / qids.length * 100);

  // Media
  let mediaHtml = "";
  if (q.media) {
    if (q.media.endsWith(".webm")) {
      mediaHtml = `<div class="media-box">
        <video src="media/${q.media}" autoplay controls playsinline muted></video>
      </div>`;
    } else {
      mediaHtml = `<div class="media-box">
        <img src="media/${q.media}" alt="Materiał do pytania">
      </div>`;
    }
  }

  // Answers
  let answersHtml = "";
  if (q.type === "TN") {
    answersHtml = `<div class="answer-grid tn">
      ${["T", "N"].map(val => {
        let cls = "answer-btn";
        if (answered) {
          if (val === q.correct) cls += " correct";
          else if (val === userAnswer) cls += " wrong";
          else cls += " disabled";
        }
        const label = val === "T" ? "TAK" : "NIE";
        return `<button class="${cls}"
          onclick="submitAnswer('${val}', ${index})"
          ${answered ? "disabled" : ""}>${label}</button>`;
      }).join("")}
    </div>`;
  } else {
    answersHtml = `<div class="answer-grid abc">
      ${Object.entries(q.answers).map(([key, text]) => {
        let cls = "answer-btn";
        if (answered) {
          if (key === q.correct) cls += " correct";
          else if (key === userAnswer) cls += " wrong";
          else cls += " disabled";
        }
        return `<button class="${cls}"
          onclick="submitAnswer('${key}', ${index})"
          ${answered ? "disabled" : ""}>
          <span class="answer-key">${key}</span>
          <span class="answer-text">${text}</span>
        </button>`;
      }).join("")}
    </div>`;
  }

  const feedbackHtml = answered
    ? `<div class="feedback ${userAnswer === q.correct ? "feedback-ok" : "feedback-err"}">
        ${userAnswer === q.correct
          ? "✓ Poprawnie!"
          : `✗ Błędna odpowiedź. Poprawna: <strong>${q.correct === "T" ? "TAK" : q.correct === "N" ? "NIE" : q.correct}</strong>`}
      </div>
      <div class="nav-row">
        <button class="btn-next" onclick="nextQuestion(${index})">
          ${index + 1 < qids.length ? "Dalej →" : "Zakończ egzamin"}
        </button>
      </div>`
    : "";

  setContent(`
    <div class="question-view">
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width:${progressPct}%"></div>
      </div>
      <div class="progress-label">Pytanie ${index + 1} / ${qids.length}</div>

      ${mediaHtml}

      <div class="question-card">
        <p class="question-text">${q.text}</p>
        ${answersHtml}
        ${feedbackHtml}
      </div>
    </div>
  `);
}

window.submitAnswer = function(answer, index) {
  if (!currentSession) return;
  const qid = currentSession.questions[index];
  const qMap = questionMap();
  const q = qMap[qid];
  if (!q || (qid in currentSession.answers)) return;

  currentSession.answers[qid] = answer;
  const isCorrect = answer === q.correct;
  recordAnswer(qid, isCorrect);
  upsertSession(currentSession);

  // Re-render to show feedback
  renderQuestion(index);
};

window.nextQuestion = function(currentIndex) {
  navigate(`#question/${currentIndex + 1}`);
};

// ---- SUMMARY ---------------------------------------------
function renderSummary(sessionId) {
  const session = loadSession(sessionId);
  if (!session || !session.result) {
    navigate("#home");
    return;
  }

  const r = session.result;
  const qMap = questionMap();
  const ratio = r.correct / r.total;
  const passed = ratio >= PASS_THRESHOLD;

  const rowsHtml = session.questions.map((qid, i) => {
    const q = qMap[qid];
    if (!q) return "";
    const userAns = session.answers[qid] ?? "—";
    const ok = userAns === q.correct;
    const displayAns = (a) => a === "T" ? "TAK" : a === "N" ? "NIE" : a;
    return `<tr class="${ok ? "row-ok" : "row-err"}">
      <td>${i + 1}</td>
      <td>${ok ? "✓" : "✗"}</td>
      <td class="q-text-cell">${q.text.length > 80 ? q.text.slice(0, 80) + "…" : q.text}</td>
      <td>${displayAns(userAns)}</td>
      <td>${displayAns(q.correct)}</td>
    </tr>`;
  }).join("");

  setContent(`
    <section class="summary">
      <div class="summary-header ${passed ? "pass" : "fail"}">
        <h1>${passed ? "ZALICZONY ✓" : "NIEZALICZONY ✗"}</h1>
        <div class="score-big">${r.correct} / ${r.total}</div>
        <div class="score-pct">${pct(r.correct, r.total)} poprawnych</div>
      </div>

      <div class="summary-breakdown">
        <div class="breakdown-item">
          <span class="bi-label">Podstawowe</span>
          <span class="bi-val">${r.basicCorrect} / ${r.basicTotal}</span>
        </div>
        <div class="breakdown-item">
          <span class="bi-label">Specjalistyczne</span>
          <span class="bi-val">${r.specialistCorrect} / ${r.specialistTotal}</span>
        </div>
      </div>

      <p class="scoring-note">
        ℹ Egzamin teoretyczny używa systemu punktowego (maks. 74 pkt, próg 68 pkt).
        Wynik procentowy jest przybliżeniem — prawdziwy wynik może się różnić.
      </p>

      <div class="summary-actions">
        <button class="btn-primary" onclick="redoCurrentSession('${session.id}')">Powtórz tę sesję</button>
        <button class="btn-secondary" onclick="navigate('#home')">Powrót do menu</button>
      </div>

      <div class="section-box">
        <h2>Przegląd pytań</h2>
        <div class="table-wrap">
          <table class="questions-table">
            <thead>
              <tr><th>#</th><th></th><th>Pytanie</th><th>Twoja odp.</th><th>Poprawna</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    </section>
  `);
}

window.redoCurrentSession = function(id) {
  const session = loadSession(id);
  if (!session) return;
  currentSession = redoSession(session);
  navigate("#question/0");
};

// ---- HISTORY ---------------------------------------------
function renderHistory() {
  const sessions = getSessions();

  const rowsHtml = sessions.length
    ? sessions.map(s => {
        const r = s.result;
        const score = r ? `${r.correct}/${r.total} (${pct(r.correct, r.total)})` : "W trakcie…";
        return `<tr>
          <td>${formatDate(s.date)}</td>
          <td>${score}</td>
          <td>${r ? passLabel(r) : "—"}</td>
          <td>
            ${r
              ? `<button class="btn-sm" onclick="redoCurrentSession('${s.id}')">Powtórz</button>`
              : `<button class="btn-sm" onclick="resumeOrRedo('${s.id}')">Kontynuuj</button>`}
            ${r ? `<a class="btn-sm btn-link" href="#summary/${s.id}">Szczegóły</a>` : ""}
          </td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="empty">Brak historii sesji.</td></tr>`;

  setContent(`
    <section class="page-section">
      <h1>Historia sesji</h1>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Wynik</th><th>Status</th><th>Akcje</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `);
}

// ---- STATS -----------------------------------------------
function renderStats() {
  const stats = getStats();
  const qMap = questionMap();

  // Build rows for answered questions, sorted by accuracy (worst first)
  let rows = Object.entries(stats)
    .map(([id, s]) => ({ id: parseInt(id, 10), ...s, q: qMap[parseInt(id, 10)] }))
    .filter(r => r.q)
    .map(r => ({ ...r, accuracy: r.correct / r.attempts }));

  rows.sort((a, b) => a.accuracy - b.accuracy); // worst first

  const rowsHtml = rows.length
    ? rows.map(r => {
        const accPct = pct(r.correct, r.attempts);
        const cls = r.accuracy < 0.5 ? "row-err" : r.accuracy < 0.8 ? "row-warn" : "row-ok";
        const mediaIcon = r.q.media ? (r.q.media.endsWith(".webm") ? "🎬" : "🖼") : "";
        return `<tr class="${cls}">
          <td>${r.id}</td>
          <td>${r.q.type}</td>
          <td>${mediaIcon}</td>
          <td class="q-text-cell">${r.q.text.length > 80 ? r.q.text.slice(0, 80) + "…" : r.q.text}</td>
          <td>${r.attempts}</td>
          <td>${r.correct}</td>
          <td>${accPct}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="7" class="empty">Brak danych. Odpowiedz na pytania, by zobaczyć statystyki.</td></tr>`;

  setContent(`
    <section class="page-section">
      <div class="section-header">
        <h1>Statystyki pytań</h1>
        <button class="btn-danger btn-sm" onclick="confirmResetStats()">Resetuj statystyki</button>
      </div>
      <p class="hint">${rows.length} / ${ALL_QUESTIONS.length} pytań ćwiczonych · posortowane od najtrudniejszych</p>
      <div class="table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Nr</th><th>Typ</th><th>Media</th><th>Pytanie</th>
              <th>Próby</th><th>Poprawne</th><th>Skuteczność</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `);
}

window.confirmResetStats = function() {
  if (confirm("Czy na pewno chcesz usunąć wszystkie statystyki? Tej operacji nie można cofnąć.")) {
    saveStats({});
    renderStats();
  }
};

// ============================================================
// Bootstrap
// ============================================================
async function init() {
  try {
    const response = await fetch("questions.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ALL_QUESTIONS = await response.json();
  } catch (err) {
    app().innerHTML = `
      <div class="error-box">
        <h2>Nie można załadować pytań</h2>
        <p>Plik <code>questions.json</code> nie został znaleziony.</p>
        <p>Uruchom skrypt konfiguracyjny:</p>
        <pre>pip install openpyxl requests
python scripts/setup.py</pre>
        <p>Następnie uruchom lokalny serwer zamiast otwierać plik bezpośrednio:</p>
        <pre>python -m http.server 8000</pre>
        <p>i otwórz <a href="http://localhost:8000">http://localhost:8000</a></p>
        <details><summary>Szczegóły błędu</summary><pre>${err.message}</pre></details>
      </div>`;
    return;
  }

  // Try to restore an in-progress session
  const currentId = localStorage.getItem(LS_CURRENT);
  if (currentId) {
    const saved = loadSession(currentId);
    if (saved && !saved.result) {
      currentSession = saved;
    }
  }

  window.addEventListener("hashchange", router);
  router();
}

init();
