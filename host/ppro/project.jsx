// Premiere Pro project: read bins, import, organize, sort footage, create/duplicate sequences.
(function () {
  var P = MMG.pr, R = MMG.round;

  MMG.fns.pr_getProjectState = function (a) {
    P.noProject();
    var start = a.bin ? P.findItem(a.bin) : app.project.rootItem;
    if (!P.isBin(start)) MMG.fail('"' + a.bin + '" is not a bin.');
    var items = [], max = 500, truncated = false;
    P.walk(start, function (it) {
      if (items.length >= max) { truncated = true; return; }
      var o = { path: P.itemPath(it), type: P.itemType(it) };
      if (o.type !== 'bin') {
        try { var m = it.getMediaPath(); if (m) o.media = m; } catch (e) {}
        try { o.duration = R(it.getOutPoint().seconds - it.getInPoint().seconds); } catch (e2) {}
      }
      items.push(o);
    });
    var active = app.project.activeSequence;
    return {
      project: app.project.name,
      items: items,
      truncated: truncated,
      sequences: P.seqNames(),
      activeSequence: active ? active.name : null
    };
  };

  function childIds(bin) {
    var ids = {};
    for (var i = 0; i < bin.children.numItems; i++) ids[bin.children[i].nodeId] = true;
    return ids;
  }

  MMG.fns.pr_import = function (a) {
    var bin = P.ensureBin(a.bin), paths = [], missing = [], i;
    for (i = 0; i < a.paths.length; i++) {
      var f = new File(a.paths[i]), d = new Folder(a.paths[i]);
      if (f.exists || d.exists) paths.push(f.fsName);
      else missing.push(a.paths[i]);
    }
    if (!paths.length) MMG.fail('None of these files exist: ' + missing.join(', '));
    var before = childIds(bin);
    app.project.importFiles(paths, true, bin, false);
    var added = [];
    for (i = 0; i < bin.children.numItems; i++) {
      if (!before[bin.children[i].nodeId]) added.push(P.itemPath(bin.children[i]));
    }
    return { bin: P.itemPath(bin) || '(root)', imported: added, missing: missing };
  };

  MMG.fns.pr_organize = function (a) {
    var results = [];
    for (var i = 0; i < a.actions.length; i++) {
      var x = a.actions[i];
      try {
        if (x.action === 'createBin') {
          results.push({ ok: true, bin: P.itemPath(P.ensureBin(x.name)) });
        } else if (x.action === 'move') {
          var it = P.findItem(x.item), bin = P.ensureBin(x.bin);
          it.moveBin(bin);
          results.push({ ok: true, item: P.itemPath(it) });
        } else if (x.action === 'rename') {
          var r = P.findItem(x.item);
          r.name = String(x.name);
          results.push({ ok: true, item: P.itemPath(r) });
        } else if (x.action === 'label') {
          var l = P.findItem(x.item);
          l.setColorLabel(Number(x.color));
          results.push({ ok: true, item: P.itemPath(l), label: x.color });
        } else {
          MMG.fail('Unknown action "' + x.action + '".');
        }
      } catch (e) {
        results.push({ ok: false, action: x.action, error: String(e.message || e) });
      }
    }
    return { results: results };
  };

  /** Import (or find) each file, move it to its bin, add clip markers and a label. */
  MMG.fns.pr_sortFootage = function (a) {
    P.noProject();
    var byMedia = {}, results = [], i, k;
    P.walk(app.project.rootItem, function (it) {
      try { var m = it.getMediaPath(); if (m) byMedia[P.normPath(m)] = it; } catch (e) {}
    });
    for (i = 0; i < a.plan.length; i++) {
      var e = a.plan[i];
      try {
        var f = new File(e.file);
        if (!f.exists) MMG.fail('File not found: ' + e.file);
        var bin = P.ensureBin(e.bin), item = byMedia[P.normPath(f.fsName)], status = 'moved';
        if (!item) {
          var before = childIds(bin);
          app.project.importFiles([f.fsName], true, bin, false);
          for (k = 0; k < bin.children.numItems; k++) {
            if (!before[bin.children[k].nodeId]) item = bin.children[k];
          }
          if (!item) MMG.fail('Premiere did not import ' + e.file);
          byMedia[P.normPath(f.fsName)] = item;
          status = 'imported';
        } else if (!childIds(bin)[item.nodeId]) {
          item.moveBin(bin);
        } else {
          status = 'already there';
        }
        var added = 0;
        if (e.markers && e.markers.length) {
          var ms = item.getMarkers();
          for (k = 0; k < e.markers.length; k++) {
            var mk = e.markers[k], m = ms.createMarker(Number(mk.time));
            if (mk.name) m.name = String(mk.name);
            if (mk.comment) m.comments = String(mk.comment);
            if (mk.color) m.setColorByIndex(P.markerColor(mk.color));
            added++;
          }
        }
        if (e.label !== undefined && e.label !== null) item.setColorLabel(Number(e.label));
        results.push({ file: e.file, ok: true, status: status, item: P.itemPath(item), markers: added });
      } catch (err) {
        results.push({ file: e.file, ok: false, error: String(err.message || err) });
      }
    }
    return { results: results };
  };

  MMG.fns.pr_createSequence = function (a) {
    var name = String(a.name), seq;
    if (a.fromClip) {
      var it = P.findItem(a.fromClip);
      var bin = a.bin ? P.ensureBin(a.bin) : app.project.rootItem;
      seq = app.project.createNewSequenceFromClips(name, [it], bin);
      if (!seq) MMG.fail('Premiere could not make a sequence from "' + a.fromClip + '".');
    } else {
      var src = P.findSequence(a.like);
      seq = P.cloneSequence(src, name);
      // Same settings as the source, but an empty timeline.
      var tracks = P.tracks(seq);
      for (var t = 0; t < tracks.length; t++) {
        var clips = P.fresh(seq, tracks[t]).clips;
        for (var c = clips.numItems - 1; c >= 0; c--) clips[c].remove(false, false);
      }
    }
    app.project.openSequence(seq.sequenceID);
    return { sequence: P.seqSummary(seq) };
  };

  MMG.fns.pr_duplicateSequence = function (a) {
    var src = P.findSequence(a.sequence);
    var copy = P.cloneSequence(src, a.name ? String(a.name) : src.name + ' copy');
    return { original: src.name, sequence: P.seqSummary(copy) };
  };
})();
