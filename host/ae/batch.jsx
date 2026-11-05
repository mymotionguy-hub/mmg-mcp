// After Effects batch: run many host functions in one undo group. Stops at the first failing step.
(function () {
  MMG.fns.ae_batch = function (a) {
    var steps = a.steps || [];
    return MMG.ae.undo('Batch (' + steps.length + ' steps)', function () {
      return MMG.runBatch(steps, 'ae_batch');
    });
  };
})();
