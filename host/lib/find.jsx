// Finders and helpers. AE parts only touch AE classes when called, so this file loads in Premiere too.
$.global.MMG = $.global.MMG || {};
MMG.ae = MMG.ae || {};

MMG.ae.comps = function () {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem) out.push(it);
  }
  return out;
};

MMG.ae.compNames = function (max) {
  var cs = MMG.ae.comps(), names = [];
  for (var i = 0; i < cs.length && i < (max || 30); i++) names.push('"' + cs[i].name + '"');
  if (cs.length > names.length) names.push('...and' + (cs.length - names.length) + ' more');
  return names.join(', ');
};

/** Comp by name, or the active comp, or the only comp in the project. */
MMG.ae.findComp = function (name) {
  var cs;
  if (name === undefined || name === null || name === '') {
    var a = app.project.activeItem;
    if (a && a instanceof CompItem) return a;
    cs = MMG.ae.comps();
    if (cs.length === 1) return cs[0];
    if (!cs.length) MMG.fail('This project has no comps yet.');
    MMG.fail('No comp is open. Open one in After Effects, or give its name. Comps: ' + MMG.ae.compNames());
  }
  cs = MMG.ae.comps();
  for (var i = 0; i < cs.length; i++) if (cs[i].name === String(name)) return cs[i];
  MMG.fail('No comp named "' + name + '". Comps: ' + (cs.length ? MMG.ae.compNames() : 'none'));
};

/** Layer by 1-based index or by name. */
MMG.ae.findLayer = function (comp, ref) {
  if (typeof ref === 'number') {
    if (ref < 1 || ref > comp.numLayers) MMG.fail('Layer ' + ref + ' does not exist in "' + comp.name + '" (it has ' + comp.numLayers + ' layers).');
    return comp.layer(ref);
  }
  var l = comp.layer(String(ref));
  if (!l) MMG.fail('No layer named "' + ref + '" in "' + comp.name + '". Read the comp state to see layer names.');
  return l;
};

/** Run fn inside one undo group. Use for every AE edit. Nested calls (batch) share the outer group. */
MMG.ae.undoDepth = 0;
MMG.ae.undo = function (label, fn) {
  var outer = MMG.ae.undoDepth === 0;
  if (outer) app.beginUndoGroup('MMG: ' + label);
  MMG.ae.undoDepth++;
  try {
    return fn();
  } finally {
    MMG.ae.undoDepth--;
    if (outer) app.endUndoGroup();
  }
};
