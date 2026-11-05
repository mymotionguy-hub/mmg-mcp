// After Effects batch: run many host functions in one undo group. Stops at the first failing step.
(function () {
  MMG.fns.ae_batch = function (a) {
    var steps = a.steps || [], results = [];
    return MMG.ae.undo('Batch (' + steps.length + ' steps)', function () {
      for (var i = 0; i < steps.length; i++) {
        var name = steps[i].fn, f = MMG.fns[name];
        if (typeof f !== 'function' || name === 'ae_batch') {
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
    });
  };
})();
