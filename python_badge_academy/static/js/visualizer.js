/**
 * Interactive Code & Memory Visualizer for Python Badge Academy
 * Powers:
 * - Line-by-line stepping with synchronized line highlights
 * - Live memory state box rendering
 * - Trace tables for loops and decisions
 * - Visual flowchart diagram generator
 */

class CodeVisualizer {
  constructor(containerElement, data) {
    this.container = containerElement;
    this.data = data;
    this.currentStep = 0;
    this.init();
  }

  init() {
    if (!this.data || !this.data.steps || this.data.steps.length === 0) {
      this.container.innerHTML = '<p class="text-muted">No visualization data available for this card.</p>';
      return;
    }

    this.renderLayout();
    this.updateStep(0);
  }

  renderLayout() {
    const linesHtml = this.data.lines
      .map((line, idx) => `<div class="vis-line" id="vis-line-${idx}"><span style="color:#64748b;margin-right:8px;">${idx + 1}</span>${this.escapeHtml(line)}</div>`)
      .join("");

    let traceTableHtml = "";
    if (this.data.trace_table && this.data.trace_table.length > 0) {
      traceTableHtml = `
        <div style="margin-top: 1.25rem;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Execution Trace Table</h4>
          <table class="trace-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Statement</th>
                <th>Condition Evaluated</th>
                <th>Result</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              ${this.data.trace_table.map((row, idx) => `
                <tr id="trace-row-${idx}">
                  <td>${row.step}</td>
                  <td><code>${this.escapeHtml(row.line)}</code></td>
                  <td>${row.condition}</td>
                  <td><strong>${row.result}</strong></td>
                  <td><code>${row.output}</code></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="visualizer-card">
        <div class="visualizer-controls">
          <div>
            <strong style="font-size:0.95rem;">Step <span id="vis-step-num">1</span> of ${this.data.steps.length}</strong>
          </div>
          <div style="display:flex;gap:0.4rem;">
            <button class="btn btn-outline btn-sm" id="vis-btn-prev" disabled>◀ Prev</button>
            <button class="btn btn-primary btn-sm" id="vis-btn-next">Next Step ▶</button>
            <button class="btn btn-outline btn-sm" id="vis-btn-reset">Reset</button>
          </div>
        </div>

        <div class="vis-code-panel">
          ${linesHtml}
        </div>

        <div>
          <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">Computer Memory (Variables)</h4>
          <div class="memory-grid" id="vis-memory-panel"></div>
        </div>

        <div style="margin-top: 0.8rem; background: var(--bg-surface); padding: 0.75rem 1rem; border-radius: var(--radius-sm); border-left: 3px solid var(--primary);">
          <strong style="font-size:0.85rem;color:var(--primary);text-transform:uppercase;">What's happening:</strong>
          <p id="vis-step-explanation" style="font-size:0.92rem;margin-top:0.2rem;color:var(--text-main);"></p>
        </div>

        <div id="vis-output-wrap" style="margin-top: 0.8rem; display: none;">
          <h4 style="font-size:0.85rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.2rem;">Console Output:</h4>
          <pre id="vis-console-out" style="background:var(--bg-code);color:var(--text-code);padding:0.6rem 0.8rem;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.88rem;"></pre>
        </div>

        ${traceTableHtml}
      </div>
    `;

    this.btnPrev = this.container.querySelector("#vis-btn-prev");
    this.btnNext = this.container.querySelector("#vis-btn-next");
    this.btnReset = this.container.querySelector("#vis-btn-reset");

    this.btnPrev.addEventListener("click", () => this.stepPrev());
    this.btnNext.addEventListener("click", () => this.stepNext());
    this.btnReset.addEventListener("click", () => this.updateStep(0));
  }

  updateStep(stepIdx) {
    this.currentStep = stepIdx;
    const step = this.data.steps[stepIdx];

    // Update step counter
    const stepNumEl = this.container.querySelector("#vis-step-num");
    if (stepNumEl) stepNumEl.textContent = stepIdx + 1;

    // Highlight code line
    this.container.querySelectorAll(".vis-line").forEach(l => l.classList.remove("highlight"));
    if (step.line !== undefined && step.line !== null) {
      const activeLine = this.container.querySelector(`#vis-line-${step.line}`);
      if (activeLine) activeLine.classList.add("highlight");
    }

    // Update memory panel
    const memPanel = this.container.querySelector("#vis-memory-panel");
    if (memPanel) {
      memPanel.innerHTML = "";
      const keys = Object.keys(step.memory || {});
      if (keys.length === 0) {
        memPanel.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Memory empty</span>';
      } else {
        keys.forEach(k => {
          const val = step.memory[k];
          memPanel.innerHTML += `
            <div class="memory-box">
              <div class="box-label">${this.escapeHtml(k)}</div>
              <div class="box-val">${this.escapeHtml(String(val))}</div>
            </div>
          `;
        });
      }
    }

    // Update explanation
    const expEl = this.container.querySelector("#vis-step-explanation");
    if (expEl) expEl.textContent = step.explanation || "";

    // Update console output
    const outWrap = this.container.querySelector("#vis-output-wrap");
    const outPre = this.container.querySelector("#vis-console-out");
    if (step.output && step.output.trim() !== "") {
      outWrap.style.display = "block";
      outPre.textContent = step.output;
    } else {
      outWrap.style.display = "none";
      outPre.textContent = "";
    }

    // Buttons state
    if (this.btnPrev) this.btnPrev.disabled = (stepIdx === 0);
    if (this.btnNext) {
      if (stepIdx === this.data.steps.length - 1) {
        this.btnNext.textContent = "Finished ✓";
        this.btnNext.disabled = true;
      } else {
        this.btnNext.textContent = "Next Step ▶";
        this.btnNext.disabled = false;
      }
    }
  }

  stepNext() {
    if (this.currentStep < this.data.steps.length - 1) {
      this.updateStep(this.currentStep + 1);
    }
  }

  stepPrev() {
    if (this.currentStep > 0) {
      this.updateStep(this.currentStep - 1);
    }
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Global helper to attach visualizer
window.mountCodeVisualizer = function(element, data) {
  return new CodeVisualizer(element, data);
};
