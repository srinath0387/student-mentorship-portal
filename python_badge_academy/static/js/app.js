/**
 * Python Badge Academy - Single Page Application Controller
 * Handles client routing, state management, learn deck, practice loop,
 * anti-copying test runner, badge modal, skills passport, and instructor portal.
 */

const AppState = {
  student: null,
  levels: [],
  progress: [],
  badges: [],
  currentLevelId: 1,
  currentLearnTopicIdx: 0,
  currentLearnCardIdx: 0,
  currentLessons: [],
  currentPracticeExercises: [],
  activeExerciseIdx: 0,
  activeTestPaper: null,
  activeTestAttemptId: null,
  testTimerInterval: null,
  testSecondsRemaining: 0,
  currentTestQuestionIdx: 0,
  studentTestAnswers: {},
  tabSwitchCount: 0,
  pasteCount: 0,
  instructorLoggedIn: false
};

function getLevelMeta(levelId) {
  if (AppState.levels && AppState.levels.length > 0) {
    const found = AppState.levels.find(l => l.id === levelId);
    if (found) return found;
  }
  const fallbackTitles = {
    1: "Python Basics",
    2: "Decision Maker",
    3: "Loop Master",
    4: "Pattern Builder",
    5: "String Handler",
    6: "List & Tuple Tamer",
    7: "Dictionary & Set Explorer",
    8: "Function Builder",
    9: "Error Handler",
    10: "Object Builder"
  };
  return { id: levelId, title: fallbackTitles[levelId] || `Level ${levelId}`, badge_icon: "🐍" };
}

// ============================================================================
// INITIALIZATION & ROUTING
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  restoreSession();
});

function initTheme() {
  const savedTheme = localStorage.getItem("pba_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.textContent = savedTheme === "dark" ? "☀️" : "🌙";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("pba_theme", next);
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  }
}

function setupEventListeners() {
  // Theme Toggle
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

  // Navigation Links
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetView = e.currentTarget.getAttribute("data-nav");
      switchView(targetView);
    });
  });

  // Login Form
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", handleLogout);

  // Anti-Cheat Window Event Listeners for Test Mode
  window.addEventListener("blur", handleWindowBlur);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("paste", handlePasteEvent);
}

function switchView(viewName) {
  document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  const targetSec = document.getElementById(`view-${viewName}`);
  if (targetSec) targetSec.classList.add("active");

  const navBtn = document.querySelector(`[data-nav="${viewName}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (viewName === "dashboard") {
    loadDashboard();
  } else if (viewName === "passport") {
    renderPassport();
  } else if (viewName === "instructor") {
    renderInstructorPortal();
  }

  window.scrollTo(0, 0);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container") || createToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "error" ? "⚠️" : "✨"}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function createToastContainer() {
  const c = document.createElement("div");
  c.id = "toast-container";
  c.className = "toast-container";
  document.body.appendChild(c);
  return c;
}

// ============================================================================
// AUTHENTICATION & SESSION
// ============================================================================

async function restoreSession() {
  const saved = localStorage.getItem("pba_student_session");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      await loginStudent(parsed.name, parsed.roll_or_email);
      return;
    } catch (e) {
      localStorage.removeItem("pba_student_session");
    }
  }
  switchView("auth");
}

async function handleLogin(e) {
  e.preventDefault();
  const name = document.getElementById("login-name").value.trim();
  const roll = document.getElementById("login-roll").value.trim();
  if (!name || !roll) {
    showToast("Please fill in both Name and Roll Number / Email.", "error");
    return;
  }
  await loginStudent(name, roll);
}

async function loginStudent(name, roll) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, roll_or_email: roll })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || "Login failed.", "error");
      return;
    }

    AppState.student = data.student;
    AppState.progress = data.progress;
    AppState.badges = data.badges;
    localStorage.setItem("pba_student_session", JSON.stringify({ name, roll_or_email: roll }));

    updateNavHeader();
    switchView("dashboard");
    showToast(`Welcome back, ${data.student.name}!`, "success");
  } catch (err) {
    showToast("Server error during login.", "error");
  }
}

function handleLogout() {
  localStorage.removeItem("pba_student_session");
  AppState.student = null;
  AppState.progress = [];
  AppState.badges = [];
  updateNavHeader();
  switchView("auth");
}

function updateNavHeader() {
  const userPill = document.getElementById("nav-user-pill");
  const navLinks = document.getElementById("nav-links-logged-in");
  const studentNameEl = document.getElementById("nav-student-name");
  const studentXpEl = document.getElementById("nav-student-xp");

  if (AppState.student) {
    if (userPill) userPill.style.display = "flex";
    if (navLinks) navLinks.style.display = "flex";
    if (studentNameEl) studentNameEl.textContent = AppState.student.name;
    if (studentXpEl) studentXpEl.textContent = `${AppState.student.xp} XP`;
  } else {
    if (userPill) userPill.style.display = "none";
    if (navLinks) navLinks.style.display = "none";
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================

async function loadDashboard() {
  if (!AppState.student) return;

  try {
    const res = await fetch(`/api/student/${AppState.student.id}/dashboard`);
    const data = await res.json();
    if (!data.success) return;

    AppState.student = data.student;
    AppState.progress = data.progress;
    AppState.badges = data.badges;
    AppState.levels = data.levels;
    updateNavHeader();

    // Render Stats
    document.getElementById("dash-xp").textContent = data.student.xp;
    document.getElementById("dash-badges-count").textContent = data.badges.length;
    document.getElementById("dash-current-level").textContent = `Level ${data.student.current_level}`;

    // Continue where left off button
    const contBtn = document.getElementById("dash-continue-btn");
    const target = data.continue_target;
    if (contBtn) {
      contBtn.onclick = () => {
        if (target.step === "learn") startLearnLevel(target.level_id);
        else if (target.step === "practice") startPracticeLevel(target.level_id);
        else if (target.step === "test") startTestLevel(target.level_id);
      };
      contBtn.textContent = `Continue Level ${target.level_id}: ${target.step.toUpperCase()} ▶`;
    }

    renderLevelsGrid(data.levels, data.progress);
  } catch (err) {
    console.error("Dashboard load failed:", err);
  }
}

function renderLevelsGrid(levels, progressList) {
  const grid = document.getElementById("levels-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const progMap = {};
  progressList.forEach(p => progMap[p.level_id] = p);

  levels.forEach(lvl => {
    const p = progMap[lvl.id] || {};
    const isUnlocked = (lvl.id <= AppState.student.current_level) || p.unlocked_at;
    const isEarned = p.test_passed;
    const isAvailableContent = (lvl.id <= 3);

    let statusPill = "";
    if (isEarned) {
      statusPill = `<span class="level-status-pill status-earned">Badge Earned ✓</span>`;
    } else if (isUnlocked && isAvailableContent) {
      statusPill = `<span class="level-status-pill status-unlocked">Active</span>`;
    } else if (!isAvailableContent) {
      statusPill = `<span class="level-status-pill status-locked">Coming Soon</span>`;
    } else {
      statusPill = `<span class="level-status-pill status-locked">Locked 🔒</span>`;
    }

    const card = document.createElement("div");
    card.className = `level-card ${isEarned ? "earned" : ""} ${!isUnlocked ? "locked" : ""}`;

    card.innerHTML = `
      <div class="level-card-header">
        <div class="level-icon-badge">${lvl.badge_icon}</div>
        <div class="level-meta">
          <h3>Level ${lvl.id}: ${lvl.title}</h3>
          ${statusPill}
        </div>
      </div>
      <p style="font-size:0.88rem;color:var(--text-muted);">${lvl.summary}</p>

      <div class="level-step-indicator">
        <div class="step-chip ${p.learn_completed ? "completed" : (isUnlocked ? "active" : "")}">1. Learn</div>
        <div class="step-chip ${p.practice_completed ? "completed" : (p.learn_completed ? "active" : "")}">2. Practise</div>
        <div class="step-chip ${p.test_passed ? "completed" : (p.practice_completed ? "active" : "")}">3. Test</div>
      </div>

      <div class="level-skills-preview">
        <p>Badge Skills to Earn:</p>
        <ul>
          ${lvl.skills.slice(0, 3).map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:auto;">
        ${isUnlocked && isAvailableContent ? `
          <button class="btn btn-outline btn-sm" onclick="startLearnLevel(${lvl.id})">Learn</button>
          <button class="btn btn-outline btn-sm" onclick="startPracticeLevel(${lvl.id})" ${p.learn_completed ? "" : "disabled"}>Practise</button>
          <button class="btn btn-primary btn-sm" onclick="startTestLevel(${lvl.id})" ${p.practice_completed ? "" : "disabled"}>Take Test</button>
        ` : `
          <button class="btn btn-outline btn-sm" disabled>${isAvailableContent ? "Pass previous test to unlock" : "Unlocks in next phase"}</button>
        `}
      </div>
    `;
    grid.appendChild(card);
  });

  // Render Final Exam Card
  const examUnlocked = (progMap[1]?.test_passed && progMap[2]?.test_passed && progMap[3]?.test_passed);
  const examCard = document.getElementById("final-exam-card");
  if (examCard) {
    examCard.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:1.4rem;font-weight:800;display:flex;align-items:center;gap:0.5rem;">
            🏆 Comprehensive Final Exam (Levels 1 - 3)
          </h2>
          <p style="color:var(--text-muted);margin-top:0.3rem;">
            Timed 90-minute exam covering all foundation levels. Pass mark: 70%. Earn the "Python Foundations Certified" badge!
          </p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="startFinalExam()" ${examUnlocked ? "" : "disabled"}>
            ${examUnlocked ? "Begin Final Exam ▶" : "Complete Levels 1-3 to Unlock 🔒"}
          </button>
        </div>
      </div>
    `;
  }
}

// ============================================================================
// 1. LEARN STEP (10-Part Teaching Style Cards)
// ============================================================================

async function startLearnLevel(levelId) {
  AppState.currentLevelId = levelId;
  AppState.currentLearnTopicIdx = 0;
  AppState.currentLearnCardIdx = 0;

  try {
    const res = await fetch(`/api/learn/${levelId}`);
    const data = await res.json();
    if (!data.success || data.is_placeholder) {
      showToast(data.message || "Level content coming soon.", "info");
      return;
    }

    AppState.currentLessons = data.lessons;
    switchView("learn");
    renderLearnView();
  } catch (err) {
    console.error("Learn view render error:", err);
    showToast("Failed to load lesson cards: " + (err.message || "Unknown error"), "error");
  }
}

function renderLearnView() {
  const levelTitle = getLevelMeta(AppState.currentLevelId).title;
  document.getElementById("learn-level-heading").textContent = `Level ${AppState.currentLevelId}: ${levelTitle}`;

  // Render Topic Sidebar
  const topicList = document.getElementById("learn-topic-list");
  topicList.innerHTML = "";
  AppState.currentLessons.forEach((topic, idx) => {
    const li = document.createElement("li");
    li.className = `topic-item ${idx === AppState.currentLearnTopicIdx ? "active" : ""}`;
    li.textContent = `${idx + 1}. ${topic.title}`;
    li.onclick = () => {
      AppState.currentLearnTopicIdx = idx;
      AppState.currentLearnCardIdx = 0;
      renderLearnView();
    };
    topicList.appendChild(li);
  });

  const curTopic = AppState.currentLessons[AppState.currentLearnTopicIdx];
  if (!curTopic) return;

  // Render "Ask the Logic" Panel
  const askPanel = document.getElementById("learn-ask-logic-panel");
  if (curTopic.ask_the_logic) {
    askPanel.style.display = "block";
    const askData = curTopic.ask_the_logic;
    askPanel.innerHTML = `
      <h3>💡 Ask the Logic</h3>
      <p class="ask-logic-q">${askData.question}</p>
      <div id="ask-opts-container">
        ${askData.options.map((opt, oIdx) => `
          <button class="ask-opt-btn" onclick="checkAskLogic(${oIdx}, ${askData.correct_index})">${opt}</button>
        `).join("")}
      </div>
      <div class="ask-explanation" id="ask-explanation-box">
        <strong>Explanation:</strong> ${askData.explanation}
      </div>
    `;
  } else {
    askPanel.style.display = "none";
  }

  renderCurrentCard();
}

function checkAskLogic(selectedIdx, correctIdx) {
  const expBox = document.getElementById("ask-explanation-box");
  const opts = document.querySelectorAll(".ask-opt-btn");
  opts.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correctIdx) {
      btn.style.background = "var(--accent-light)";
      btn.style.borderColor = "var(--accent)";
      btn.style.fontWeight = "700";
    } else if (idx === selectedIdx) {
      btn.style.background = "var(--danger-light)";
      btn.style.borderColor = "var(--danger)";
    }
  });
  if (expBox) expBox.style.display = "block";
}

function renderCurrentCard() {
  const curTopic = AppState.currentLessons[AppState.currentLearnTopicIdx];
  const card = curTopic.cards[AppState.currentLearnCardIdx];
  const container = document.getElementById("learn-card-content");
  if (!container || !card) return;

  let dynamicContent = "";

  // 1. Logic First, Code Second
  if (card.logic_plan && card.code) {
    dynamicContent += `
      <div class="logic-vs-code-grid">
        <div class="logic-box">
          <h4>Plain English Plan</h4>
          <ol>
            ${card.logic_plan.map(step => `<li>${step}</li>`).join("")}
          </ol>
        </div>
        <div class="code-side">
          <h4>Python Implementation</h4>
          <div class="code-box">${escapeHtml(card.code)}</div>
        </div>
      </div>
    `;
  } else if (card.code) {
    dynamicContent += `<div class="code-box">${escapeHtml(card.code)}</div>`;
  }

  // 2. Interactive Step Visualizer
  if (card.visualizer) {
    dynamicContent += `<div id="interactive-vis-container"></div>`;
  }

  // 3. Flowchart Diagram
  if (card.diagram && card.diagram.type === "flowchart") {
    dynamicContent += `
      <div class="diagram-flow">
        ${card.diagram.steps.map((st, i) => `
          <div class="flow-step">${st}</div>
          ${i < card.diagram.steps.length - 1 ? '<div class="flow-arrow">↓</div>' : ''}
        `).join("")}
      </div>
    `;
  }

  // 4. Memory Box Diagram
  if (card.diagram && card.diagram.type === "memory_box") {
    dynamicContent += `
      <div class="memory-grid" style="margin: 1.5rem 0;">
        ${card.diagram.boxes.map(b => `
          <div class="memory-box">
            <div class="box-label">${b.label}</div>
            <div class="box-val">${b.val}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // 5. Check Yourself Interactive Questions
  if (card.questions) {
    dynamicContent += `
      <div style="margin: 1.5rem 0;">
        ${card.questions.map((q, qIdx) => `
          <div style="background:var(--bg-muted);padding:1rem;border-radius:var(--radius-sm);margin-bottom:1rem;">
            <p style="font-weight:700;margin-bottom:0.5rem;">Q${qIdx + 1}: ${q.q}</p>
            <div>
              ${q.options.map((opt, oIdx) => `
                <button class="ask-opt-btn" onclick="checkCardQuestion(this, ${oIdx}, ${q.ans}, '${escapeHtml(q.why)}')">${opt}</button>
              `).join("")}
            </div>
            <div class="card-q-feedback" style="display:none;margin-top:0.6rem;padding:0.6rem;border-radius:var(--radius-sm);font-size:0.85rem;"></div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // 6. Skill Recap
  if (card.badge_link) {
    dynamicContent += `
      <div style="background:var(--accent-light);border:2px solid var(--accent);padding:1.2rem;border-radius:var(--radius-sm);margin:1.5rem 0;text-align:center;">
        <h4 style="color:var(--accent);font-size:1.1rem;font-weight:800;margin-bottom:0.3rem;">🎯 Skill Earned</h4>
        <p style="font-weight:700;font-size:1.05rem;">${card.badge_link}</p>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card-header-meta">
      <span class="card-step-badge">Step ${card.step_number} of 10: ${card.step_name}</span>
      <span style="font-size:0.85rem;color:var(--text-muted);font-weight:600;">
        Card ${AppState.currentLearnCardIdx + 1} of ${curTopic.cards.length}
      </span>
    </div>
    <h2 class="card-title">${card.title}</h2>
    <p class="card-text">${card.text}</p>
    ${dynamicContent}
  `;

  // Attach interactive step visualizer if present
  if (card.visualizer) {
    const visEl = document.getElementById("interactive-vis-container");
    if (visEl && window.mountCodeVisualizer) {
      window.mountCodeVisualizer(visEl, card.visualizer);
    }
  }

  // Update Stepper Navigation Buttons
  const prevBtn = document.getElementById("learn-btn-prev");
  const nextBtn = document.getElementById("learn-btn-next");
  const isLastCard = (AppState.currentLearnCardIdx === curTopic.cards.length - 1);
  const isLastTopic = (AppState.currentLearnTopicIdx === AppState.currentLessons.length - 1);

  if (prevBtn) {
    prevBtn.disabled = (AppState.currentLearnCardIdx === 0 && AppState.currentLearnTopicIdx === 0);
    prevBtn.onclick = learnStepPrev;
  }

  if (nextBtn) {
    if (isLastCard && isLastTopic) {
      nextBtn.textContent = "Finish Lessons & Unlock Practice 🎉";
      nextBtn.onclick = finishLearnLevel;
    } else if (isLastCard) {
      nextBtn.textContent = "Next Topic ▶";
      nextBtn.onclick = learnStepNext;
    } else {
      nextBtn.textContent = "Next Card ▶";
      nextBtn.onclick = learnStepNext;
    }
  }
}

function checkCardQuestion(btn, chosen, correct, reason) {
  const parent = btn.parentElement;
  const feedback = parent.parentElement.querySelector(".card-q-feedback");
  parent.querySelectorAll(".ask-opt-btn").forEach((b, idx) => {
    b.disabled = true;
    if (idx === correct) {
      b.style.background = "var(--accent-light)";
      b.style.borderColor = "var(--accent)";
      b.style.fontWeight = "700";
    }
  });

  if (feedback) {
    feedback.style.display = "block";
    if (chosen === correct) {
      feedback.style.background = "var(--accent-light)";
      feedback.style.color = "var(--accent)";
      feedback.innerHTML = `<strong>Correct!</strong> ${reason}`;
    } else {
      feedback.style.background = "var(--danger-light)";
      feedback.style.color = "var(--danger)";
      feedback.innerHTML = `<strong>Not quite.</strong> ${reason}`;
    }
  }
}

function learnStepNext() {
  const curTopic = AppState.currentLessons[AppState.currentLearnTopicIdx];
  if (AppState.currentLearnCardIdx < curTopic.cards.length - 1) {
    AppState.currentLearnCardIdx++;
    renderCurrentCard();
  } else if (AppState.currentLearnTopicIdx < AppState.currentLessons.length - 1) {
    AppState.currentLearnTopicIdx++;
    AppState.currentLearnCardIdx = 0;
    renderLearnView();
  }
}

function learnStepPrev() {
  if (AppState.currentLearnCardIdx > 0) {
    AppState.currentLearnCardIdx--;
    renderCurrentCard();
  } else if (AppState.currentLearnTopicIdx > 0) {
    AppState.currentLearnTopicIdx--;
    const prevTopic = AppState.currentLessons[AppState.currentLearnTopicIdx];
    AppState.currentLearnCardIdx = prevTopic.cards.length - 1;
    renderLearnView();
  }
}

async function finishLearnLevel() {
  try {
    const res = await fetch("/api/learn/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: AppState.student.id,
        level_id: AppState.currentLevelId
      })
    });
    const data = await res.json();
    if (data.success) {
      AppState.student = data.student;
      updateNavHeader();
      showToast("Level lessons completed! +50 XP. Practice unlocked!", "success");
      startPracticeLevel(AppState.currentLevelId);
    }
  } catch (err) {
    showToast("Error updating learn completion.", "error");
  }
}

// ============================================================================
// 2. PRACTISE STEP (Problem, Plan, Code)
// ============================================================================

async function startPracticeLevel(levelId) {
  AppState.currentLevelId = levelId;
  AppState.activeExerciseIdx = 0;

  try {
    const res = await fetch(`/api/practice/${levelId}?student_id=${AppState.student.id}`);
    const data = await res.json();
    if (!data.success || data.is_placeholder) {
      showToast(data.message || "Practice exercises coming soon.", "info");
      return;
    }

    AppState.currentPracticeExercises = data.exercises;
    switchView("practice");
    renderPracticeView();
  } catch (err) {
    showToast("Failed to load practice exercises.", "error");
  }
}

function renderPracticeView() {
  const levelTitle = getLevelMeta(AppState.currentLevelId).title;
  document.getElementById("practice-level-heading").textContent = `Level ${AppState.currentLevelId} Practise: ${levelTitle}`;

  // Render Exercise Navigator Tabs
  const navWrap = document.getElementById("practice-ex-tabs");
  navWrap.innerHTML = "";
  AppState.currentPracticeExercises.forEach((ex, idx) => {
    const btn = document.createElement("button");
    btn.className = `btn btn-sm ${idx === AppState.activeExerciseIdx ? "btn-primary" : "btn-outline"}`;
    btn.innerHTML = `${ex.passed ? "✓ " : ""}${ex.title.split(":")[0]}`;
    btn.onclick = () => {
      AppState.activeExerciseIdx = idx;
      renderPracticeView();
    };
    navWrap.appendChild(btn);
  });

  const ex = AppState.currentPracticeExercises[AppState.activeExerciseIdx];
  if (!ex) return;

  // Render Problem Card
  document.getElementById("ex-title").textContent = ex.title;
  document.getElementById("ex-skill-badge").textContent = `Skill: ${ex.badge_skill}`;
  document.getElementById("ex-problem-text").textContent = ex.problem;

  // Render Plan Choices (interactive plain-English planner)
  const planContainer = document.getElementById("ex-plan-options");
  planContainer.innerHTML = "";
  ex.plan_options.forEach((opt) => {
    const optDiv = document.createElement("div");
    optDiv.className = `plan-choice-card ${ex.plan_choice === opt.id ? "selected" : ""}`;
    optDiv.innerHTML = `<span>📝</span> <span>${opt.text}</span>`;
    optDiv.onclick = () => {
      ex.plan_choice = opt.id;
      document.querySelectorAll(".plan-choice-card").forEach(c => c.classList.remove("selected"));
      optDiv.classList.add("selected");
    };
    planContainer.appendChild(optDiv);
  });

  // Hints Buttons & Area
  const planHintBtn = document.getElementById("btn-plan-hint");
  const codeHintBtn = document.getElementById("btn-code-hint");
  const hintDisplay = document.getElementById("ex-hint-display");
  hintDisplay.style.display = "none";
  hintDisplay.textContent = "";

  planHintBtn.onclick = () => {
    hintDisplay.style.display = "block";
    hintDisplay.innerHTML = `<strong>Plan Hint (-5 XP):</strong> ${ex.plan_hint}`;
    ex.hints_used = (ex.hints_used || 0) + 1;
  };

  codeHintBtn.onclick = () => {
    hintDisplay.style.display = "block";
    hintDisplay.innerHTML = `<strong>Code Hint (-10 XP):</strong> <code>${escapeHtml(ex.code_hint)}</code>`;
    ex.hints_used = (ex.hints_used || 0) + 1;
  };

  // Code Editor Textarea
  const codeInput = document.getElementById("ex-code-editor");
  codeInput.value = ex.saved_code || ex.starter_code || "";

  // Visible Test Cases Preview
  renderVisibleTestCases(ex.visible_test_cases, []);

  // Run Button
  const runBtn = document.getElementById("btn-run-practice");
  runBtn.onclick = () => runAndTestPractice(ex);
}

function renderVisibleTestCases(cases, testResults) {
  const tcContainer = document.getElementById("ex-test-cases");
  tcContainer.innerHTML = "";

  cases.forEach((tc, idx) => {
    const res = testResults.find(r => r.test_case === idx + 1);
    const tcDiv = document.createElement("div");
    tcDiv.className = "tc-card";

    let statusTag = `<span style="color:var(--text-muted);">Not Run</span>`;
    let actualHtml = `-`;

    if (res) {
      statusTag = res.passed
        ? `<span class="tc-tag-pass">PASS ✓</span>`
        : `<span class="tc-tag-fail">FAIL ✗</span>`;
      actualHtml = `<code>${escapeHtml(res.actual)}</code>`;
    }

    tcDiv.innerHTML = `
      <div class="tc-header">
        <span>Test Case ${idx + 1}</span>
        ${statusTag}
      </div>
      <div class="tc-details">
        <div>
          <span style="color:var(--text-muted);display:block;">Input:</span>
          <code>${escapeHtml(tc.input || "(none)")}</code>
        </div>
        <div>
          <span style="color:var(--text-muted);display:block;">Expected Output:</span>
          <code>${escapeHtml(tc.expected)}</code>
        </div>
      </div>
      ${res ? `
        <div style="margin-top:0.4rem;padding-top:0.4rem;border-top:1px solid var(--border-color);">
          <span style="color:var(--text-muted);display:block;">Your Output:</span>
          ${actualHtml}
        </div>
      ` : ""}
    `;
    tcContainer.appendChild(tcDiv);
  });
}

async function runAndTestPractice(ex) {
  const code = document.getElementById("ex-code-editor").value;
  const runBtn = document.getElementById("btn-run-practice");
  runBtn.disabled = true;
  runBtn.textContent = "Testing Code...";

  try {
    const res = await fetch("/api/practice/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: AppState.student.id,
        level_id: AppState.currentLevelId,
        exercise_id: ex.id,
        code: code,
        plan_choice: ex.plan_choice || "",
        hints_used: ex.hints_used || 0
      })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || "Submission failed.", "error");
      return;
    }

    renderVisibleTestCases(ex.visible_test_cases, data.test_results);

    // Model Plan comparison
    const modelPlanBox = document.getElementById("ex-model-plan-box");
    if (data.model_plan) {
      modelPlanBox.style.display = "block";
      modelPlanBox.innerHTML = `
        <h4 style="font-size:0.88rem;color:var(--primary);text-transform:uppercase;margin-bottom:0.4rem;">
          Compare with Model Plan:
        </h4>
        <pre style="font-family:var(--font-sans);font-size:0.92rem;line-height:1.5;white-space:pre-wrap;">${escapeHtml(data.model_plan)}</pre>
      `;
    }

    if (data.all_passed) {
      ex.passed = true;
      ex.saved_code = code;
      AppState.student = data.student;
      updateNavHeader();
      showToast("All test cases passed! +XP awarded.", "success");

      // Check if all exercises are completed
      const allDone = AppState.currentPracticeExercises.every(e => e.passed);
      if (allDone) {
        showToast("Level practice complete! Level Test is now UNLOCKED!", "success");
      }
    } else {
      showToast("Some test cases failed. Review outputs below and refine your code.", "error");
    }
  } catch (err) {
    showToast("Error executing practice code.", "error");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run & Test Code ▶";
  }
}

// ============================================================================
// 3. LEVEL TEST & FINAL EXAM (ANTI-COPYING, TIMED, SERVER-GRADED)
// ============================================================================

async function startTestLevel(levelId) {
  AppState.currentLevelId = levelId;
  await initiateExam("level_test", levelId);
}

async function startFinalExam() {
  await initiateExam("final_exam", 1);
}

async function initiateExam(testType, levelId) {
  try {
    const res = await fetch("/api/test/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: AppState.student.id,
        test_type: testType,
        level_id: levelId
      })
    });
    const data = await res.json();

    if (!data.success) {
      if (data.cooldown) {
        showToast(data.error, "error");
      } else {
        showToast(data.error || "Cannot start test.", "error");
      }
      return;
    }

    AppState.activeTestAttemptId = data.attempt_id;
    AppState.activeTestPaper = data.paper;
    AppState.currentTestQuestionIdx = 0;
    AppState.studentTestAnswers = {};
    AppState.tabSwitchCount = 0;
    AppState.pasteCount = 0;
    AppState.testSecondsRemaining = (data.duration_minutes || 15) * 60;

    switchView("test");
    renderTestInterface();
    startTestTimer();
    showToast(`Test started. You have ${data.duration_minutes} minutes.`, "info");
  } catch (err) {
    showToast("Network error starting test.", "error");
  }
}

function startTestTimer() {
  if (AppState.testTimerInterval) clearInterval(AppState.testTimerInterval);

  const timerEl = document.getElementById("test-timer-display");
  AppState.testTimerInterval = setInterval(() => {
    AppState.testSecondsRemaining--;

    if (AppState.testSecondsRemaining <= 0) {
      clearInterval(AppState.testTimerInterval);
      showToast("Time expired! Submitting your answers automatically...", "warning");
      submitActiveTest();
      return;
    }

    const mins = Math.floor(AppState.testSecondsRemaining / 60);
    const secs = AppState.testSecondsRemaining % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if (timerEl) {
      timerEl.textContent = `⏱ ${timeStr}`;
      if (AppState.testSecondsRemaining < 120) {
        timerEl.classList.add("warning");
      } else {
        timerEl.classList.remove("warning");
      }
    }
  }, 1000);
}

function renderTestInterface() {
  const paper = AppState.activeTestPaper;
  if (!paper) return;

  const isFinal = paper.test_type === "final_exam";
  document.getElementById("test-title-heading").textContent = isFinal
    ? "Python Foundations Final Certification Exam"
    : `Level ${paper.level_id} Test`;

  // Render Navigator Strip
  const navStrip = document.getElementById("test-q-nav-strip");
  navStrip.innerHTML = "";
  paper.questions.forEach((q, idx) => {
    const pill = document.createElement("div");
    pill.className = `q-nav-pill ${idx === AppState.currentTestQuestionIdx ? "active" : ""} ${AppState.studentTestAnswers[q.q_id] !== undefined ? "answered" : ""}`;
    pill.textContent = idx + 1;
    pill.onclick = () => {
      saveCurrentQuestionAnswer();
      AppState.currentTestQuestionIdx = idx;
      renderTestInterface();
    };
    navStrip.appendChild(pill);
  });

  renderTestQuestion();
}

function renderTestQuestion() {
  const paper = AppState.activeTestPaper;
  const q = paper.questions[AppState.currentTestQuestionIdx];
  const qContainer = document.getElementById("test-question-body");
  if (!qContainer || !q) return;

  let inputHtml = "";
  const existingAns = AppState.studentTestAnswers[q.q_id];

  if (q.type in { predict_output: 1, multiple_choice: 1 }) {
    inputHtml = `
      <div style="margin-top:1.25rem;">
        <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.6rem;">Select the Correct Option:</h4>
        ${q.options.map((opt, oIdx) => `
          <label class="plan-choice-card ${existingAns === oIdx ? "selected" : ""}" style="cursor:pointer;">
            <input type="radio" name="test-opt-${q.q_id}" value="${oIdx}" ${existingAns === oIdx ? "checked" : ""} style="margin-right:8px;" onchange="recordOptionChoice('${q.q_id}', ${oIdx})">
            <code>${escapeHtml(opt)}</code>
          </label>
        `).join("")}
      </div>
    `;
  } else if (q.type === "write_code") {
    let sampleCaseHtml = "";
    if (q.sample_input !== undefined && q.sample_output !== undefined) {
      sampleCaseHtml = `
        <div style="background:var(--bg-muted);border:1px solid var(--border-color);border-left:4px solid var(--accent);border-radius:var(--radius-sm);padding:0.75rem 1rem;margin:1rem 0;">
          <strong style="color:var(--accent);font-size:0.82rem;text-transform:uppercase;display:block;margin-bottom:0.35rem;">
            💡 Sample Example (What is Expected):
          </strong>
          <div style="display:flex;flex-wrap:wrap;gap:1.5rem;font-family:var(--font-mono);font-size:0.88rem;">
            <div><span style="color:var(--text-muted);display:block;font-size:0.75rem;">Sample Input:</span> <code>${escapeHtml(q.sample_input || "(none)")}</code></div>
            <div><span style="color:var(--text-muted);display:block;font-size:0.75rem;">Expected Output:</span> <code>${escapeHtml(q.sample_output)}</code></div>
          </div>
        </div>
      `;
    }

    inputHtml = `
      <div style="margin-top:1.25rem;">
        ${sampleCaseHtml}
        <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--text-muted);">Write Your Python Solution (Input is already read for you):</h4>
          <span style="font-size:0.82rem;color:var(--text-muted);">${q.test_cases_count} test cases will verify this</span>
        </div>
        <textarea id="test-code-editor" class="code-textarea" placeholder="Type your code here...">${escapeHtml(existingAns !== undefined ? existingAns : (q.starter_code || ""))}</textarea>
      </div>
    `;
  }

  qContainer.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem;">
      <span style="font-weight:700;color:var(--primary);font-size:0.95rem;">Question ${AppState.currentTestQuestionIdx + 1} of ${paper.total_questions}</span>
      <span style="font-size:0.82rem;background:var(--bg-muted);padding:0.2rem 0.6rem;border-radius:var(--radius-full);font-weight:600;">${q.topic}</span>
    </div>
    <h3 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem;">${q.title}</h3>
    <p style="font-size:1.05rem;line-height:1.6;margin-bottom:1rem;">${q.prompt}</p>
    ${q.code ? `<div class="code-box">${escapeHtml(q.code)}</div>` : ""}
    ${inputHtml}
  `;

  // Update prev / next / submit buttons
  const prevBtn = document.getElementById("test-btn-prev");
  const nextBtn = document.getElementById("test-btn-next");
  const submitBtn = document.getElementById("test-btn-submit");

  prevBtn.disabled = (AppState.currentTestQuestionIdx === 0);
  prevBtn.onclick = () => {
    saveCurrentQuestionAnswer();
    AppState.currentTestQuestionIdx--;
    renderTestInterface();
  };

  if (AppState.currentTestQuestionIdx === paper.total_questions - 1) {
    nextBtn.style.display = "none";
    submitBtn.style.display = "inline-flex";
  } else {
    nextBtn.style.display = "inline-flex";
    submitBtn.style.display = "none";
    nextBtn.onclick = () => {
      saveCurrentQuestionAnswer();
      AppState.currentTestQuestionIdx++;
      renderTestInterface();
    };
  }

  submitBtn.onclick = () => {
    saveCurrentQuestionAnswer();
    if (confirm("Are you sure you want to finish and submit your test?")) {
      submitActiveTest();
    }
  };
}

function recordOptionChoice(qId, oIdx) {
  AppState.studentTestAnswers[qId] = oIdx;
  const navStripPill = document.querySelectorAll(".q-nav-pill")[AppState.currentTestQuestionIdx];
  if (navStripPill) navStripPill.classList.add("answered");
}

function saveCurrentQuestionAnswer() {
  const paper = AppState.activeTestPaper;
  if (!paper) return;
  const q = paper.questions[AppState.currentTestQuestionIdx];
  if (!q) return;

  if (q.type === "write_code") {
    const editor = document.getElementById("test-code-editor");
    if (editor) {
      AppState.studentTestAnswers[q.q_id] = editor.value;
      if (editor.value.trim().length > 0) {
        const navStripPill = document.querySelectorAll(".q-nav-pill")[AppState.currentTestQuestionIdx];
        if (navStripPill) navStripPill.classList.add("answered");
      }
    }
  }
}

// Anti-Cheat Handlers
function handleWindowBlur() {
  if (document.getElementById("view-test").classList.contains("active")) {
    AppState.tabSwitchCount++;
    logIntegrity("tab_switch", `Window blur event. Total: ${AppState.tabSwitchCount}`);
  }
}

function handleVisibilityChange() {
  if (document.hidden && document.getElementById("view-test").classList.contains("active")) {
    AppState.tabSwitchCount++;
    logIntegrity("tab_switch", `Tab visibility hidden. Total: ${AppState.tabSwitchCount}`);
  }
}

function handlePasteEvent() {
  if (document.getElementById("view-test").classList.contains("active")) {
    AppState.pasteCount++;
    logIntegrity("paste", `Paste event detected. Total: ${AppState.pasteCount}`);
  }
}

async function logIntegrity(eventType, details) {
  if (!AppState.activeTestAttemptId || !AppState.student) return;
  try {
    fetch("/api/integrity/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: AppState.student.id,
        attempt_id: AppState.activeTestAttemptId,
        event_type: eventType,
        details: details
      })
    });
  } catch (e) {}
}

async function submitActiveTest() {
  if (AppState.testTimerInterval) clearInterval(AppState.testTimerInterval);

  saveCurrentQuestionAnswer();

  try {
    const res = await fetch("/api/test/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt_id: AppState.activeTestAttemptId,
        answers: AppState.studentTestAnswers,
        duration_seconds: 900 - AppState.testSecondsRemaining,
        tab_switches: AppState.tabSwitchCount,
        pastes: AppState.pasteCount
      })
    });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || "Grading failed.", "error");
      return;
    }

    AppState.student = data.student;
    AppState.badges = data.badges;
    updateNavHeader();

    renderTestResults(data);
  } catch (err) {
    showToast("Error submitting test to server.", "error");
  }
}

function renderTestResults(results) {
  switchView("test-results");
  const container = document.getElementById("test-results-container");

  const passed = results.passed;
  const score = results.score_percentage;

  let failedCasesHtml = "";
  const failedKeys = Object.keys(results.failed_hidden_cases || {});
  if (failedKeys.length > 0) {
    failedCasesHtml = `
      <div style="margin:2rem 0;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius);padding:1.5rem;">
        <h3 style="color:var(--danger);font-size:1.1rem;font-weight:700;margin-bottom:0.8rem;">
          🔍 Review What You Missed (Hidden Test Cases Revealed)
        </h3>
        <p style="font-size:0.92rem;color:var(--text-muted);margin-bottom:1rem;">
          In real engineering, learning from failed tests makes you stronger. Review the inputs and expected outputs below:
        </p>
        ${failedKeys.map(k => {
          const item = results.failed_hidden_cases[k];
          return `
            <div style="background:var(--bg-muted);padding:1rem;border-radius:var(--radius-sm);margin-bottom:0.75rem;">
              <h4 style="font-size:0.95rem;font-weight:700;">${item.question_title}</h4>
              ${item.reason ? `
                <p style="font-size:0.88rem;color:var(--text-muted);">Reason: ${item.reason}</p>
                <p style="font-size:0.88rem;">Your answer: <code>${escapeHtml(item.your_answer)}</code></p>
                <p style="font-size:0.88rem;color:var(--accent);font-weight:700;">Correct answer: <code>${escapeHtml(item.correct_answer)}</code></p>
              ` : `
                <p style="font-size:0.88rem;color:var(--text-muted);">Passed Cases: ${item.passed_cases}</p>
                ${(item.failed_cases || []).map(fc => `
                  <div style="font-family:var(--font-mono);font-size:0.82rem;margin-top:0.4rem;padding:0.4rem;background:var(--bg-code);color:var(--text-code);border-radius:4px;">
                    <div>Input: ${escapeHtml(fc.input || "(none)")}</div>
                    <div>Expected: ${escapeHtml(fc.expected)}</div>
                    <div>Your Output: ${escapeHtml(fc.actual)}</div>
                  </div>
                `).join("")}
              `}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // Topic Breakdown
  const breakdownKeys = Object.keys(results.breakdown || {});
  let breakdownHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;margin:1.5rem 0;">
      ${breakdownKeys.map(k => {
        const b = results.breakdown[k];
        const pct = Math.round((b.earned / b.total) * 100);
        return `
          <div style="background:var(--bg-surface);border:1px solid var(--border-color);padding:1rem;border-radius:var(--radius-sm);text-align:center;">
            <div style="font-size:0.82rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;">${k}</div>
            <div style="font-size:1.4rem;font-weight:800;color:${pct >= 70 ? 'var(--accent)' : 'var(--danger)'};">${pct}%</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${b.earned} / ${b.total} pts</div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  container.innerHTML = `
    <div style="text-align:center;max-width:680px;margin:0 auto 2rem;">
      <div style="font-size:4rem;margin-bottom:0.5rem;">${passed ? "🎉" : "📚"}</div>
      <h1 style="font-size:2rem;font-weight:800;color:${passed ? 'var(--accent)' : 'var(--danger)'};">
        ${passed ? "Congratulations! You Passed!" : "Not Quite - Review and Try Again"}
      </h1>
      <p style="font-size:1.15rem;color:var(--text-muted);margin:0.5rem 0 1.5rem;">
        Your Score: <strong style="color:var(--text-main);font-size:1.5rem;">${score}%</strong> (Pass mark: 70%)
      </p>

      ${passed && results.badge ? `
        <button class="btn btn-accent" onclick='openBadgeModal(${JSON.stringify(results.badge)})'>
          View & Download Your Official Badge 🏅
        </button>
      ` : `
        <p style="color:var(--text-muted);font-size:0.92rem;">
          A fresh set of questions will be prepared for your next attempt after a short 20-second cooldown.
        </p>
      `}
    </div>

    ${breakdownHtml}
    ${failedCasesHtml}

    <div style="text-align:center;margin-top:2rem;">
      <button class="btn btn-outline" onclick="switchView('dashboard')">Back to Dashboard</button>
    </div>
  `;

  if (passed && results.badge) {
    openBadgeModal(results.badge);
  }
}

// ============================================================================
// 4. BADGE MODAL & SKILLS PASSPORT
// ============================================================================

function openBadgeModal(badge) {
  const modal = document.getElementById("badge-modal");
  if (!modal) return;

  document.getElementById("modal-badge-icon").textContent = badge.badge_icon;
  document.getElementById("modal-badge-title").textContent = badge.badge_title;
  document.getElementById("modal-badge-name").textContent = AppState.student.name;
  document.getElementById("modal-badge-score").textContent = `${badge.score}%`;
  document.getElementById("modal-badge-code").textContent = badge.verification_id;

  const skillsListEl = document.getElementById("modal-badge-skills");
  skillsListEl.innerHTML = "";
  let skills = [];
  try {
    skills = Array.isArray(badge.skills) ? badge.skills : JSON.parse(badge.skills_json);
  } catch (e){}
  skills.forEach(s => {
    const li = document.createElement("li");
    li.textContent = `✓ ${s}`;
    skillsListEl.appendChild(li);
  });

  // Action buttons
  document.getElementById("btn-download-badge").onclick = () => {
    window.BadgeCanvas.downloadBadgePNG(badge, AppState.student.name);
  };

  document.getElementById("btn-copy-verify-link").onclick = () => {
    const url = `${window.location.origin}/verify/${badge.verification_id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast("Public verification link copied to clipboard!", "success");
    });
  };

  modal.style.display = "flex";
}

function closeBadgeModal() {
  const modal = document.getElementById("badge-modal");
  if (modal) modal.style.display = "none";
}

function renderPassport() {
  const grid = document.getElementById("passport-badges-grid");
  const skillsList = document.getElementById("passport-all-skills");
  if (!grid) return;

  grid.innerHTML = "";
  skillsList.innerHTML = "";

  if (AppState.badges.length === 0) {
    grid.innerHTML = `<p class="text-muted" style="grid-column:1/-1;">No badges earned yet. Pass Level 1 to earn your first official credential!</p>`;
    return;
  }

  const allSkillsSet = new Set();

  AppState.badges.forEach(b => {
    let skills = [];
    try {
      skills = Array.isArray(b.skills) ? b.skills : JSON.parse(b.skills_json);
    } catch(e){}
    skills.forEach(s => allSkillsSet.add(s));

    const card = document.createElement("div");
    card.className = "level-card earned";
    card.innerHTML = `
      <div class="level-card-header">
        <div class="level-icon-badge">${b.badge_icon}</div>
        <div>
          <h3 style="font-size:1.1rem;font-weight:700;">${b.badge_title}</h3>
          <span class="verification-code">${b.verification_id}</span>
        </div>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);">Score: ${b.score}% • Issued: ${new Date(b.issued_at).toLocaleDateString()}</p>
      <div style="margin-top:1rem;display:flex;gap:0.4rem;">
        <button class="btn btn-outline btn-sm" onclick='window.BadgeCanvas.downloadBadgePNG(${JSON.stringify(b)}, "${AppState.student.name}")'>Download PNG</button>
        <a class="btn btn-outline btn-sm" href="/verify/${b.verification_id}" target="_blank">Verify Link</a>
      </div>
    `;
    grid.appendChild(card);
  });

  allSkillsSet.forEach(skill => {
    const li = document.createElement("li");
    li.style.cssText = "padding:0.4rem 0;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:0.5rem;";
    li.innerHTML = `<span style="color:var(--accent);font-weight:700;">✓</span> <span>${skill}</span>`;
    skillsList.appendChild(li);
  });
}

// ============================================================================
// 5. INSTRUCTOR PORTAL (PIN-PROTECTED, CSV, EXACT PAPERS)
// ============================================================================

async function renderInstructorPortal() {
  const pinModal = document.getElementById("instructor-login-wrap");
  const portalContent = document.getElementById("instructor-portal-content");

  if (!AppState.instructorLoggedIn) {
    pinModal.style.display = "block";
    portalContent.style.display = "none";
    document.getElementById("btn-instructor-pin-submit").onclick = handleInstructorAuth;
  } else {
    pinModal.style.display = "none";
    portalContent.style.display = "block";
    loadInstructorSummary();
  }
}

async function handleInstructorAuth() {
  const pin = document.getElementById("instructor-pin-input").value.trim();
  try {
    const res = await fetch("/api/instructor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      AppState.instructorLoggedIn = true;
      AppState.instructorPin = pin;
      renderInstructorPortal();
      showToast("Instructor access granted.", "success");
    } else {
      showToast("Invalid PIN.", "error");
    }
  } catch (err) {
    showToast("Authentication error.", "error");
  }
}

async function loadInstructorSummary() {
  try {
    const res = await fetch("/api/instructor/summary", {
      headers: { "X-Instructor-PIN": AppState.instructorPin }
    });
    const data = await res.json();
    if (!data.success) return;

    const summary = data.data;

    // Pass Rates Cards
    const passRatesContainer = document.getElementById("inst-pass-rates");
    passRatesContainer.innerHTML = "";
    summary.pass_rates.forEach(pr => {
      const pct = pr.enrolled > 0 ? Math.round((pr.passed / pr.enrolled) * 100) : 0;
      passRatesContainer.innerHTML += `
        <div style="background:var(--bg-surface);border:1px solid var(--border-color);padding:1rem 1.25rem;border-radius:var(--radius-sm);text-align:center;">
          <span style="font-size:0.8rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;">Level ${pr.level_id} Pass Rate</span>
          <h3 style="font-size:1.6rem;font-weight:800;color:var(--primary);margin:0.2rem 0;">${pct}%</h3>
          <span style="font-size:0.75rem;color:var(--text-muted);">${pr.passed} of ${pr.enrolled} students passed</span>
        </div>
      `;
    });

    // Students Roster Table
    const tbody = document.getElementById("inst-students-tbody");
    tbody.innerHTML = "";
    summary.students.forEach(s => {
      tbody.innerHTML += `
        <tr>
          <td><strong>#${s.id}</strong></td>
          <td>${escapeHtml(s.name)}</td>
          <td><code>${escapeHtml(s.roll_or_email)}</code></td>
          <td><strong>${s.xp}</strong></td>
          <td>Level ${s.current_level}</td>
          <td>${s.badges_count}</td>
          <td class="${s.total_tab_switches > 3 ? 'tab-switch-alert' : ''}">${s.total_tab_switches}</td>
          <td>${s.total_pastes}</td>
          <td>${s.final_exam_score ? `${s.final_exam_score}%` : '-'}</td>
          <td><span style="font-size:0.78rem;color:var(--text-muted);">${new Date(s.last_active).toLocaleString()}</span></td>
        </tr>
      `;
    });

    // Recent Tests with Paper View
    const recentTestsTbody = document.getElementById("inst-tests-tbody");
    recentTestsTbody.innerHTML = "";
    summary.recent_tests.forEach(t => {
      recentTestsTbody.innerHTML += `
        <tr>
          <td>#${t.id}</td>
          <td>${escapeHtml(t.student_name)}</td>
          <td>${t.type === 'final_exam' ? 'Final Exam' : `Level ${t.level_id} Test`}</td>
          <td><strong style="color:${t.passed ? 'var(--accent)' : 'var(--danger)'};">${t.score}%</strong></td>
          <td>${t.passed ? 'PASSED' : 'FAILED'}</td>
          <td>${t.tab_switches}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="viewExactStudentPaper(${t.id})">View Paper</button>
          </td>
        </tr>
      `;
    });

    // CSV Export Link
    document.getElementById("btn-export-csv").onclick = () => {
      window.open(`/api/instructor/export_csv?pin=${AppState.instructorPin}`, "_blank");
    };
  } catch (err) {
    console.error("Failed to load instructor summary:", err);
  }
}

async function viewExactStudentPaper(attemptId) {
  try {
    const res = await fetch(`/api/instructor/paper/${attemptId}`, {
      headers: { "X-Instructor-PIN": AppState.instructorPin }
    });
    const data = await res.json();
    if (!data.success) return;

    const record = data.record;
    const modal = document.getElementById("paper-view-modal");
    const body = document.getElementById("paper-modal-body");

    body.innerHTML = `
      <div style="margin-bottom:1.2rem;padding-bottom:0.8rem;border-bottom:1px solid var(--border-color);">
        <p><strong>Student:</strong> ${record.student_name} (${record.roll_or_email})</p>
        <p><strong>Attempt Seed:</strong> <code>${record.seed}</code></p>
        <p><strong>Score:</strong> ${record.score}% (${record.passed ? "PASSED" : "FAILED"})</p>
        <p><strong>Tab Switches Logged:</strong> ${record.tab_switches} | <strong>Pastes:</strong> ${record.pastes}</p>
      </div>
      <div>
        <h4 style="font-size:1rem;margin-bottom:0.8rem;">Questions Served & Student Answers:</h4>
        ${record.paper.questions.map((q, idx) => `
          <div style="background:var(--bg-muted);padding:1rem;border-radius:var(--radius-sm);margin-bottom:0.8rem;">
            <p><strong>Q${idx + 1}: ${q.title}</strong> (${q.topic})</p>
            <p style="font-size:0.92rem;margin:0.4rem 0;">${q.prompt}</p>
            ${q.code ? `<div class="code-box">${escapeHtml(q.code)}</div>` : ""}
            <p style="font-size:0.88rem;margin-top:0.4rem;">
              <strong>Student Submitted:</strong> 
              <code>${escapeHtml(String(record.answers[q.q_id] !== undefined ? record.answers[q.q_id] : "(no answer)"))}</code>
            </p>
          </div>
        `).join("")}
      </div>
    `;

    modal.style.display = "flex";
  } catch (err) {
    showToast("Failed to fetch paper details.", "error");
  }
}

function closePaperModal() {
  const modal = document.getElementById("paper-view-modal");
  if (modal) modal.style.display = "none";
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
