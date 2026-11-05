// Premiere Pro batch: run many host functions in order. Each edit stays its own undo step.
(function () {
  MMG.fns.pr_batch = function (a) {
    return MMG.runBatch(a.steps || [], 'pr_batch');
  };
})();
