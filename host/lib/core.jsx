// Core: the MMG.call entry point, error helper, and the shared status function.
$.global.MMG = $.global.MMG || {};
MMG.fns = MMG.fns || {};

/** Throw an error meant for the user (plain words, no script line shown). */
MMG.fail = function (message) {
  var e = new Error(message);
  e.mmgUser = true;
  throw e;
};

MMG.round = function (n) {
  return Math.round(n * 1000) / 1000;
};

/** Entry point used by the panel. Always returns a JSON string {ok:true,data} or {ok:false,error}. */
MMG.call = function (fn, argsJson) {
  var out;
  try {
    var args = argsJson ? MMG.JSON.parse(argsJson) : {};
    var f = MMG.fns[fn];
    if (typeof f !== 'function') MMG.fail('Unknown host function "' + fn + '". The panel may be older than the server: reinstall MMG MCP.');
    out = { ok: true, data: f(args || {}) };
  } catch (e) {
    out = {
      ok: false,
      error: {
        message: String(e && e.message ? e.message : e),
        kind: e && e.mmgUser ? 'user' : 'script',
        line: e && e.line ? e.line : null,
        fn: fn
      }
    };
  }
  return MMG.JSON.stringify(out);
};

/** Run steps [{fn, args}] in order; stop at the first failure. Used by ae_batch and pr_batch. */
MMG.runBatch = function (steps, self) {
  var results = [];
  for (var i = 0; i < steps.length; i++) {
    var name = steps[i].fn, f = MMG.fns[name];
    if (typeof f !== 'function' || name === self) {
      return { completed: i, results: results, error: { step: i + 1, message: 'Unknown step "' + name + '".' } };
    }
    try {
      results.push(f(steps[i].args || {}));
    } catch (e) {
      return {
        completed: i,
        results: results,
        error: { step: i + 1, fn: name, message: String(e && e.message ? e.message : e), line: e && !e.mmgUser ? e.line : null }
      };
    }
  }
  return { completed: steps.length, results: results };
};

MMG.fns.common_status = function () {
  var name = BridgeTalk.appName;
  var r = { app: name, version: String(app.version) };
  var p = app.project;
  if (name === 'aftereffects') {
    r.project = p.file ? p.file.displayName : '(unsaved project)';
    r.projectPath = p.file ? p.file.fsName : null;
    r.activeComp = p.activeItem && p.activeItem instanceof CompItem ? p.activeItem.name : null;
    r.numItems = p.numItems;
  } else if (name === 'premierepro') {
    r.project = p ? p.name : null;
    r.projectPath = p ? p.path : null;
    r.activeSequence = p && p.activeSequence ? p.activeSequence.name : null;
  }
  return r;
};
