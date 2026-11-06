/**
 * Python Badge Academy - Python Execution Engine
 * Runs Python code in browser via Pyodide when available,
 * with graceful fallback to server execution (/api/run_python).
 * Enforces timeout protection against infinite loops.
 */

class PythonRunner {
  constructor() {
    this.pyodide = null;
    this.isLoadingPyodide = false;
    this.isPyodideReady = false;
    this.attemptLoadPyodide();
  }

  async attemptLoadPyodide() {
    if (window.loadPyodide && !this.pyodide && !this.isLoadingPyodide) {
      try {
        this.isLoadingPyodide = true;
        this.pyodide = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
        });
        this.isPyodideReady = true;
        console.log("⚡ Pyodide ready in browser.");
      } catch (err) {
        console.warn("Pyodide CDN unavailable, using server execution fallback:", err);
        this.isPyodideReady = false;
      } finally {
        this.isLoadingPyodide = false;
      }
    }
  }

  async runCode(code, inputStr = "", timeoutMs = 3000) {
    // If Pyodide is ready, attempt client-side execution with timeout
    if (this.isPyodideReady && this.pyodide) {
      try {
        return await this.runWithTimeout(this.runInPyodide(code, inputStr), timeoutMs);
      } catch (err) {
        console.warn("Pyodide run failed or timed out, retrying via server:", err);
      }
    }

    // Server fallback (always reliable)
    return await this.runOnServer(code, inputStr);
  }

  runWithTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("TimeoutError: Code exceeded execution time limit (possible infinite loop)."));
      }, ms);

      promise
        .then(res => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async runInPyodide(code, inputStr) {
    const wrappedCode = `
import sys, io

_sys_stdin = sys.stdin
_sys_stdout = sys.stdout
_sys_stderr = sys.stderr

sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

_inputs = ${JSON.stringify(inputStr.split("\n"))}
_input_idx = 0
def _custom_input(prompt=""):
    global _input_idx
    if _input_idx < len(_inputs):
        val = _inputs[_input_idx]
        _input_idx += 1
        return val
    return ""

__builtins__.input = _custom_input

_error_msg = None
try:
    exec(${JSON.stringify(code)})
except Exception as e:
    _error_msg = f"{type(e).__name__}: {str(e)}"

_out = sys.stdout.getvalue()
_err = sys.stderr.getvalue()
if _error_msg:
    _err = f"{_err}\\n{_error_msg}" if _err else _error_msg

sys.stdout = _sys_stdout
sys.stderr = _sys_stderr
sys.stdin = _sys_stdin

{"success": _error_msg is None, "output": _out, "error": _err}
    `;

    const result = await this.pyodide.runPythonAsync(wrappedCode);
    return result.toJs ? result.toJs({ dict_converter: Object.fromEntries }) : result;
  }

  async runOnServer(code, inputStr) {
    try {
      const response = await fetch("/api/run_python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, input: inputStr })
      });
      const data = await response.json();
      return data;
    } catch (err) {
      return {
        success: false,
        output: "",
        error: "Network error connecting to Python execution service."
      };
    }
  }
}

window.pythonRunner = new PythonRunner();
