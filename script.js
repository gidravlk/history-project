"use strict";

const STORAGE_KEYS = {
  fullName: "khc_fullName",
  group: "khc_group",
  topicId: "khc_topicId",
  quizAnswers: "khc_quizAnswers",
  results: "khc_results"
};

function $(selector, scope) { return (scope || document).querySelector(selector); }
function $all(selector, scope) { return Array.from((scope || document).querySelectorAll(selector)); }

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSession() {
  return {
    fullName: localStorage.getItem(STORAGE_KEYS.fullName) || "",
    group: localStorage.getItem(STORAGE_KEYS.group) || "",
    topicId: localStorage.getItem(STORAGE_KEYS.topicId) ? Number(localStorage.getItem(STORAGE_KEYS.topicId)) : null
  };
}

function getTopicById(id) {
  return TOPICS.find(function (t) { return t.id === id; }) || null;
}

function getResults() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.results)) || []; } 
  catch (e) { return []; }
}

function saveResults(list) {
  localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(list));
}

// Умное обновление записи (группируется по Имени + Теме)
function upsertResultRecord(updates) {
  const session = getSession();
  if (!session.fullName || !session.topicId) return;

  const topic = getTopicById(session.topicId);
  const results = getResults();
  const key = session.fullName.trim().toLowerCase() + "|" + session.topicId;

  let record = results.find(function (r) { return r.key === key; });
  
  if (!record) {
    record = {
      key: key,
      fullName: session.fullName.trim(),
      group: session.group.trim(),
      topicId: session.topicId,
      topicTitle: topic ? topic.title : "Unknown topic",
      essayText: "",
      essayScore: null,
      quizScore: null,
      average: null,
      updated: new Date().toISOString()
    };
    results.push(record);
  }

  if (updates.essayText !== undefined) record.essayText = updates.essayText;
  if (updates.essayScore !== undefined) record.essayScore = updates.essayScore;
  if (updates.quizScore !== undefined) record.quizScore = updates.quizScore;

  let scores = [];
  if (record.essayScore !== null) scores.push(Number(record.essayScore));
  if (record.quizScore !== null) scores.push(Number(record.quizScore));
  
  if (scores.length > 0) {
    record.average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } else {
    record.average = null;
  }

  record.updated = new Date().toISOString();
  saveResults(results);
}

function renderContextBar(el) {
  if (!el) return;
  const session = getSession();
  const topic = session.topicId !== null ? getTopicById(session.topicId) : null;
  el.innerHTML =
    '<div class="context-bar__item"><dt>Student</dt><dd>' + (escapeHtml(session.fullName) || "\u2014") + "</dd></div>" +
    '<div class="context-bar__item"><dt>Group</dt><dd>' + (escapeHtml(session.group) || "\u2014") + "</dd></div>" +
    '<div class="context-bar__item"><dt>Topic</dt><dd>' + (topic ? escapeHtml(topic.title) : "No topic selected") + "</dd></div>";
}

function requireSession(needsTopic) {
  const session = getSession();
  if (!session.fullName || (needsTopic && session.topicId === null)) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

/* ================== INDEX PAGE ================== */
function initIndexPage() {
  const nameInput = $("#fullName");
  const groupInput = $("#studentGroup");
  const list = $("#topicList");
  const manualBtn = $("#selectManualBtn");
  const randomBtn = $("#randomTopicBtn");
  if (!nameInput || !list) return;

  const session = getSession();
  nameInput.value = session.fullName;
  if (groupInput) groupInput.value = session.group;
  let selectedTopicId = session.topicId;

  function renderList() {
    list.innerHTML = "";
    TOPICS.forEach(function (topic) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "topic-item";
      btn.setAttribute("aria-pressed", String(topic.id === selectedTopicId));
      btn.innerHTML = '<span class="topic-item__num">' + String(topic.id).padStart(2, "0") + "</span>" +
                      '<span class="topic-item__title">' + escapeHtml(topic.title) + "</span>";
      btn.addEventListener("click", function () {
        selectedTopicId = topic.id;
        persistData();
        renderList();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function persistData() {
    localStorage.setItem(STORAGE_KEYS.fullName, nameInput.value.trim());
    if (groupInput) localStorage.setItem(STORAGE_KEYS.group, groupInput.value.trim());
    if (selectedTopicId !== null) localStorage.setItem(STORAGE_KEYS.topicId, String(selectedTopicId));
  }

  nameInput.addEventListener("input", persistData);
  if (groupInput) groupInput.addEventListener("input", persistData);

  function handleGo(isRandom) {
    persistData();
    if (!nameInput.value.trim()) {
      nameInput.focus(); return;
    }
    if (isRandom) {
      const pick = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      selectedTopicId = pick.id;
      persistData();
    } else if (selectedTopicId === null) {
      list.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.location.href = "essay.html";
  }

  if (manualBtn) manualBtn.addEventListener("click", () => handleGo(false));
  if (randomBtn) randomBtn.addEventListener("click", () => handleGo(true));

  renderList();
}

/* ================== ESSAY PAGE ================== */
function initEssayPage() {
  const textarea = $("#essayText");
  if (!textarea) return;
  const session = requireSession(true);
  if (!session) return;

  renderContextBar($("#contextBar"));
  const countEl = $("#wordCount");
  const detectBtn = $("#detectBtn");
  const saveBtn = $("#saveEssayBtn");
  const resultBox = $("#detectorResult");
  const savedNote = $("#essaySavedNote");

  // Загружаем эссе, привязанное ИМЕННО к текущему студенту и выбранной теме
  const key = session.fullName.trim().toLowerCase() + "|" + session.topicId;
  const existingRecord = getResults().find(r => r.key === key);
  textarea.value = (existingRecord && existingRecord.essayText) ? existingRecord.essayText : "";
  
  updateWordCount();

  textarea.addEventListener("input", function () {
    upsertResultRecord({ essayText: textarea.value });
    updateWordCount();
    if (savedNote) savedNote.hidden = true;
  });

  function updateWordCount() {
    const words = textarea.value.trim().length ? textarea.value.trim().split(/\s+/).length : 0;
    if (countEl) countEl.textContent = words + (words === 1 ? " word" : " words");
  }

  if (detectBtn) {
    detectBtn.addEventListener("click", function () {
      const text = textarea.value;
      if (text.trim().split(/\s+/).filter(Boolean).length < 30) {
        resultBox.hidden = false;
        resultBox.innerHTML = '<p class="text-muted">Write at least 30 words before running the check.</p>';
        return;
      }
      let score = 55 + (text.length % 40); 
      score = Math.max(40, Math.min(99, Math.round(score)));
      resultBox.hidden = false;
      resultBox.innerHTML =
        '<div class="score-row"><div class="score-chip"><span class="score-chip__value">' + score + '%</span>' +
        '<span class="score-chip__label">Human-likeness (simulated)</span></div></div>' +
        '<p class="field__hint">This is a classroom simulation. It does not call a real AI-detection service.</p>';
      resultBox.dataset.score = String(score);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      const score = resultBox && resultBox.dataset.score ? Number(resultBox.dataset.score) : null;
      upsertResultRecord({ essayText: textarea.value, essayScore: score });
      if (savedNote) savedNote.hidden = false;
    });
  }
}

/* ================== QUIZ PAGE ================== */
function initQuizPage() {
  const container = $("#quizContainer");
  if (!container) return;
  const session = requireSession(true);
  if (!session) return;

  renderContextBar($("#contextBar"));
  const topic = getTopicById(session.topicId);
  const questions = QUIZ_BANK[session.topicId];
  const emptyState = $("#quizEmptyState");
  const quizBody = $("#quizBody");

  if (!questions || questions.length < 30) {
    quizBody.hidden = true;
    emptyState.hidden = false;
    const select = $("#changeTopicSelect");
    const validTopics = TOPICS.filter(t => QUIZ_BANK[t.id] && QUIZ_BANK[t.id].length >= 30);
    
    select.innerHTML = validTopics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("");
    
    $("#changeTopicBtn").addEventListener("click", () => {
      const newId = Number(select.value);
      if (newId) {
        localStorage.setItem(STORAGE_KEYS.topicId, newId);
        window.location.reload();
      }
    });
    return;
  }

  let current = 0;
  const answers = new Array(questions.length).fill(null);
  const promptEl = $("#questionPrompt");
  const optionsEl = $("#optionsList");
  const progressFill = $("#progressFill");
  const progressLabel = $("#progressLabel");
  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const finishBtn = $("#finishBtn");
  const scoreScreen = $("#scoreScreen");

  function renderQuestion() {
    const q = questions[current];
    promptEl.textContent = (current + 1) + ". " + q.q;
    optionsEl.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    q.options.forEach(function (opt, i) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.setAttribute("aria-pressed", String(answers[current] === i));
      btn.innerHTML = '<span class="option__letter">' + letters[i] + "</span>" + escapeHtml(opt);
      btn.addEventListener("click", function () {
        answers[current] = i;
        renderQuestion();
      });
      li.appendChild(btn);
      optionsEl.appendChild(li);
    });

    const pct = Math.round(((current + 1) / questions.length) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = "Question " + (current + 1) + " of " + questions.length;

    prevBtn.disabled = current === 0;
    const isLast = current === questions.length - 1;
    nextBtn.hidden = isLast;
    finishBtn.hidden = !isLast;
  }

  prevBtn.addEventListener("click", () => { if (current > 0) { current -= 1; renderQuestion(); } });
  nextBtn.addEventListener("click", () => { if (answers[current] !== null && current < questions.length - 1) { current += 1; renderQuestion(); } });
  
  finishBtn.addEventListener("click", function () {
    if (answers[current] === null) return;
    let correctCount = 0;
    answers.forEach((a, i) => { if (a === questions[i].correct) correctCount += 1; });
    const scorePct = Math.round((correctCount / questions.length) * 100);
    
    localStorage.setItem(STORAGE_KEYS.quizAnswers, JSON.stringify(answers));
    upsertResultRecord({ quizScore: scorePct });

    quizBody.hidden = true;
    scoreScreen.hidden = false;
    scoreScreen.innerHTML =
      '<h2>Quiz complete</h2>' +
      '<div class="score-row"><div class="score-chip"><span class="score-chip__value">' + scorePct + '%</span>' +
      '<span class="score-chip__label">' + correctCount + " of " + questions.length + " correct</span></div></div>" +
      '<p>Result saved for <strong>' + escapeHtml(session.fullName) + "</strong>.</p>" +
      '<div class="btn-row"><a class="btn btn--turquoise" href="results.html">View results table</a></div>';
  });

  renderQuestion();
}

/* ================== RESULTS PAGE ================== */
function initResultsPage() {
  const tableBody = $("#resultsTableBody");
  const filterSelect = $("#studentFilter");
  if (!tableBody) return;

  let allResults = getResults().slice().sort((a, b) => (b.average || 0) - (a.average || 0));
  let currentFiltered = allResults;

  // Заполняем фильтр студентов
  if (filterSelect) {
    const uniqueStudents = [...new Set(allResults.map(r => r.fullName))];
    if (uniqueStudents.length > 0) {
      $("#resultsControls").hidden = false;
      uniqueStudents.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name.toLowerCase();
        opt.textContent = name;
        filterSelect.appendChild(opt);
      });
    }

    filterSelect.addEventListener("change", () => {
      const val = filterSelect.value;
      if (val === "ALL") {
        currentFiltered = allResults;
      } else {
        currentFiltered = allResults.filter(r => r.fullName.toLowerCase() === val);
      }
      renderTable();
    });
  }

  function renderTable() {
    const emptyState = $("#resultsEmpty");
    const tableWrap = $("#resultsTableWrap");

    if (!currentFiltered.length) {
      if (emptyState) emptyState.hidden = false;
      if (tableWrap) tableWrap.hidden = true;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (tableWrap) tableWrap.hidden = false;

    tableBody.innerHTML = currentFiltered.map(r => 
      "<tr>" +
      "<td>" + escapeHtml(r.fullName) + "</td>" +
      "<td>" + escapeHtml(r.group || "—") + "</td>" +
      "<td>" + escapeHtml(r.topicTitle) + "</td>" +
      "<td>" + (r.essayScore !== null ? r.essayScore + "%" : "—") + "</td>" +
      "<td>" + (r.quizScore !== null ? r.quizScore + "%" : "—") + "</td>" +
      "<td>" + (r.average !== null ? r.average + "%" : "—") + "</td>" +
      "</tr>"
    ).join("");
  }

  // Генерация подробного отчета с текстами эссе для одного студента
  function buildStudentPrintReport(studentNameFilter) {
    const reportDiv = $("#printReport");
    if (!reportDiv) return;
    
    if (studentNameFilter === "ALL") {
      document.body.classList.remove("printing-student");
      reportDiv.innerHTML = "";
      return;
    }

    document.body.classList.add("printing-student");
    const records = allResults.filter(r => r.fullName.toLowerCase() === studentNameFilter);
    const studentInfo = records[0];

    let html = `<h2>Detailed Report: ${escapeHtml(studentInfo.fullName)}</h2>`;
    html += `<p><strong>Group:</strong> ${escapeHtml(studentInfo.group || "N/A")}</p>`;
    
    html += `<table class="results print-table"><thead><tr>
                <th>Topic</th><th>Essay Score</th><th>Quiz Score</th><th>Total</th>
             </tr></thead><tbody>`;
    
    records.forEach(r => {
      html += `<tr>
                <td>${escapeHtml(r.topicTitle)}</td>
                <td>${r.essayScore !== null ? r.essayScore + "%" : "—"}</td>
                <td>${r.quizScore !== null ? r.quizScore + "%" : "—"}</td>
                <td>${r.average !== null ? r.average + "%" : "—"}</td>
               </tr>`;
    });
    html += `</tbody></table>`;

    const essays = records.filter(r => r.essayText && r.essayText.trim().length > 0);
    if (essays.length > 0) {
      html += `<div class="print-essay-section"><h3>Submitted Essays</h3>`;
      essays.forEach(r => {
        html += `<div class="print-essay-item">
                  <h4>${escapeHtml(r.topicTitle)}</h4>
                  <p class="text-muted">Simulated AI Score: ${r.essayScore !== null ? r.essayScore + "%" : "Not checked"}</p>
                  <div class="print-essay-text">${escapeHtml(r.essayText)}</div>
                 </div>`;
      });
      html += `</div>`;
    } else {
      html += `<p class="mt-0">No essays submitted.</p>`;
    }

    reportDiv.innerHTML = html;
  }

  renderTable();

  if ($("#printBtn")) {
    $("#printBtn").addEventListener("click", () => {
      const filter = filterSelect ? filterSelect.value : "ALL";
      buildStudentPrintReport(filter);
      window.print();
    });
  }

  if ($("#csvBtn")) {
    $("#csvBtn").addEventListener("click", function () {
      const header = ["Full Name", "Group", "Topic", "Essay Score", "Quiz Score", "Total Average", "Essay Text"];
      const rows = currentFiltered.map(r => 
        [
          r.fullName, 
          r.group || "", 
          r.topicTitle, 
          r.essayScore !== null ? r.essayScore + "%" : "—", 
          r.quizScore !== null ? r.quizScore + "%" : "—", 
          r.average !== null ? r.average + "%" : "—",
          r.essayText || ""
        ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")
      );
      const csv = "\uFEFF" + [header.join(","), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "history-of-kazakhstan-results.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if ($("#clearResultsBtn")) {
    $("#clearResultsBtn").addEventListener("click", function () {
      if (window.confirm("Remove all saved student results from this device? This cannot be undone.")) {
        saveResults([]);
        allResults = [];
        currentFiltered = [];
        renderTable();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  initIndexPage();
  initEssayPage();
  initQuizPage();
  initResultsPage();
});