// Premiere Pro timeline: read, place, cut, trim/move, markers, transitions, clip properties, frame export.
// Each edit is its own undo step in Premiere.
(function () {
  var P = MMG.pr, R = MMG.round;
  var NOTE = 'Clip indexes may have changed: read pr_getSequenceState before the next edit.';

  MMG.fns.pr_getSequenceState = function (a) {
    var seq = P.findSequence(a.sequence), tracks = [], all = P.tracks(seq);
    for (var i = 0; i < all.length; i++) {
      var clips = all[i].track.clips, list = [];
      for (var j = 0; j < clips.numItems && j < 300; j++) list.push(P.clipInfo(clips[j], j));
      var o = { track: all[i].name, clips: list };
      if (P.isLocked(all[i])) o.locked = true;
      try { if (all[i].track.isMuted()) o.muted = true; } catch (e) {}
      if (clips.numItems > 300) o.totalClips = clips.numItems;
      tracks.push(o);
    }
    return { sequence: P.seqSummary(seq), tracks: tracks, markers: P.markers(seq) };
  };

  MMG.fns.pr_placeClip = function (a) {
    var seq = P.findSequence(a.sequence), it = P.findItem(a.item), t = P.getTrack(seq, a.track);
    if (P.isBin(it)) MMG.fail('"' + a.item + '" is a bin, not a clip.');
    var time = P.snap(seq, a.time), oldIn = null, oldOut = null;
    var hasIn = a.inPoint !== undefined && a.inPoint !== null, hasOut = a.outPoint !== undefined && a.outPoint !== null;
    if (hasIn || hasOut) {
      oldIn = it.getInPoint().seconds;
      oldOut = it.getOutPoint().seconds;
      if (hasIn) it.setInPoint(Number(a.inPoint), 4);
      if (hasOut) it.setOutPoint(Number(a.outPoint), 4);
    }
    try {
      if (a.mode === 'insert') t.track.insertClip(it, time);
      else t.track.overwriteClip(it, time);
    } finally {
      // Put the source in/out back so the project item is unchanged.
      if (hasIn || hasOut) {
        it.setInPoint(oldIn, 4);
        it.setOutPoint(oldOut, 4);
      }
    }
    var clips = P.fresh(seq, t).clips, eps = 0.5 / P.fps(seq), placed = null;
    for (var i = 0; i < clips.numItems; i++) {
      if (Math.abs(clips[i].start.seconds - time) < eps) placed = P.clipInfo(clips[i], i);
    }
    return { track: t.name, mode: a.mode || 'overwrite', clip: placed, note: NOTE };
  };

  /** Razor at times and/or remove a range (closing the gap by default). */
  MMG.fns.pr_cut = function (a) {
    var seq = P.findSequence(a.sequence), q = P.activate(seq), eps = 0.5 / P.fps(seq);
    var all = P.tracks(seq, a.tracks), live = [], skipped = [], i, j, k;
    for (i = 0; i < all.length; i++) {
      if (P.isLocked(all[i])) skipped.push(all[i].name);
      else live.push(all[i]);
    }
    function razorAt(sec) {
      var tc = P.tc(seq, sec);
      for (var n = 0; n < live.length; n++) P.qeTrack(q, live[n]).razor(tc);
    }
    var out = { tracks: [], lockedTracksSkipped: skipped };
    for (i = 0; i < live.length; i++) out.tracks.push(live[i].name);

    if (a.times && a.times.length) {
      out.cutAt = [];
      for (i = 0; i < a.times.length; i++) {
        var s0 = P.snap(seq, a.times[i]);
        razorAt(s0);
        out.cutAt.push(R(s0));
      }
    }

    if (a.range) {
      var s = P.snap(seq, a.range.start), e = P.snap(seq, a.range.end), dur = e - s;
      if (!(dur > eps)) MMG.fail('The range end must be after its start.');
      razorAt(s);
      razorAt(e);
      // Safety: if a cut didn't happen, stop before removing or shifting anything.
      for (i = 0; i < live.length; i++) {
        var cl = P.fresh(seq, live[i]).clips;
        for (j = 0; j < cl.numItems; j++) {
          var cs = cl[j].start.seconds, ce = cl[j].end.seconds;
          if ((cs < s - eps && ce > s + eps) || (cs < e - eps && ce > e + eps)) {
            MMG.fail('Premiere did not cut "' + cl[j].name + '" on ' + live[i].name + ' at the range edge. Nothing was removed.');
          }
        }
      }
      var removed = 0, shifted = 0;
      for (i = 0; i < live.length; i++) {
        var tr = P.fresh(seq, live[i]).clips;
        for (j = tr.numItems - 1; j >= 0; j--) {
          if (tr[j].start.seconds >= s - eps && tr[j].end.seconds <= e + eps) {
            tr[j].remove(false, false);
            removed++;
          }
        }
      }
      if (a.ripple !== false) {
        // Close the gap. Snapshot targets first: moving a linked clip may also move its partner.
        var plan = [];
        for (i = 0; i < live.length; i++) {
          var later = P.fresh(seq, live[i]).clips;
          for (j = 0; j < later.numItems; j++) {
            if (later[j].start.seconds >= e - eps) plan.push({ id: later[j].nodeId, target: later[j].start.seconds - dur, t: live[i] });
          }
        }
        plan.sort(function (x, y) { return x.target - y.target; });
        for (k = 0; k < plan.length; k++) {
          var c = P.clipById(seq, plan[k].t, plan[k].id);
          if (!c) continue;
          var delta = plan[k].target - c.start.seconds;
          if (Math.abs(delta) > eps) {
            c.move(P.T(delta));
            shifted++;
          }
        }
      }
      out.removedRange = { start: R(s), end: R(e), duration: R(dur), clipsRemoved: removed, clipsShifted: shifted, gapClosed: a.ripple !== false };
    }
    out.sequence = P.seqSummary(seq);
    out.note = NOTE;
    return out;
  };

  MMG.fns.pr_trimMove = function (a) {
    var seq = P.findSequence(a.sequence), f = P.findClip(seq, a.clip), c = f.clip, act = a.action;
    var eps = 0.5 / P.fps(seq), t, d, removed = false;
    function need() {
      if (a.time === undefined || a.time === null) MMG.fail('"' + act + '" needs a time.');
      return P.snap(seq, a.time);
    }
    if (act === 'trimStart') {
      t = need();
      var oldEnd = c.end.seconds, oldIn = c.inPoint.seconds;
      d = t - c.start.seconds;
      c.start = P.T(t);
      // Keep the end where it was, and make sure the source in point moved with the trim.
      if (Math.abs(c.end.seconds - oldEnd) > eps) c.end = P.T(oldEnd);
      if (Math.abs(d) > eps && Math.abs(c.inPoint.seconds - oldIn) < 0.0001) c.inPoint = P.T(oldIn + d);
    } else if (act === 'trimEnd') {
      t = need();
      var oldOut = c.outPoint.seconds;
      d = t - c.end.seconds;
      c.end = P.T(t);
      if (Math.abs(d) > eps && Math.abs(c.outPoint.seconds - oldOut) < 0.0001) c.outPoint = P.T(oldOut + d);
    } else if (act === 'move') {
      t = need();
      c.move(P.T(t - c.start.seconds));
    } else if (act === 'enable' || act === 'disable') {
      c.disabled = act === 'disable';
    } else if (act === 'rename') {
      if (!a.name) MMG.fail('rename needs a name.');
      c.name = String(a.name);
    } else if (act === 'remove') {
      c.remove(!!a.ripple, true);
      removed = true;
    } else {
      MMG.fail('Unknown action "' + act + '".');
    }
    var out = { track: f.track.name, action: act, note: NOTE };
    if (!removed) out.clip = P.clipInfo(c, P.indexOfClip(seq, f.track, c));
    return out;
  };

  MMG.fns.pr_markers = function (a) {
    var seq = P.findSequence(a.sequence), ms = seq.markers, results = [];
    for (var i = 0; i < a.items.length; i++) {
      var x = a.items[i];
      if (x.action === 'remove') {
        if (!x.name && (x.time === undefined || x.time === null)) MMG.fail('To remove a marker, give its name or time.');
        var kill = [], m = ms.getFirstMarker();
        while (m) {
          if ((x.name && m.name === x.name) || (x.time !== undefined && x.time !== null && Math.abs(m.start.seconds - x.time) < 0.02)) kill.push(m);
          m = ms.getNextMarker(m);
        }
        for (var k = 0; k < kill.length; k++) ms.deleteMarker(kill[k]);
        results.push({ removed: kill.length });
      } else {
        var mk = ms.createMarker(Number(x.time));
        if (x.name) mk.name = String(x.name);
        if (x.comment) mk.comments = String(x.comment);
        if (x.end !== undefined && x.end !== null && x.end > x.time) {
          try { mk.end = Number(x.end); } catch (e) { mk.end = P.T(x.end); }
        }
        if (x.color) mk.setColorByIndex(P.markerColor(x.color));
        results.push({ added: P.sec(mk.start) });
      }
    }
    return { results: results, markers: P.markers(seq) };
  };

  MMG.fns.pr_transition = function (a) {
    var seq = P.findSequence(a.sequence), q = P.activate(seq), t = P.getTrack(seq, a.track || 'V1');
    var eps = 0.5 / P.fps(seq);
    var name = a.name || (t.video ? 'Cross Dissolve' : 'Constant Power');
    var tr = t.video ? qe.project.getVideoTransitionByName(name) : qe.project.getAudioTransitionByName(name);
    if (!tr) MMG.fail('No ' + (t.video ? 'video' : 'audio') + ' transition named "' + name + '". Use the English name, e.g. "Cross Dissolve", "Dip to Black", "Constant Power".');
    var dur = P.tc(seq, a.duration || 0.5), zero = P.tc(seq, 0);
    var clips = P.fresh(seq, t).clips, qt = P.qeTrack(q, t), items = [], i;
    // QE lists gaps as "Empty" items: keep only real clips, so index n matches clips[n].
    for (i = 0; i < qt.numItems; i++) {
      var qi = qt.getItemAt(i);
      if (qi && qi.type !== 'Empty') items.push(qi);
    }
    if (items.length !== clips.numItems) MMG.fail('Could not match clips on ' + t.name + ' for transitions.');
    var added = [], notes = [];
    function add(idx, atEnd, time) {
      items[idx].addTransition(tr, atEnd, dur, zero, 0.5, false, true);
      added.push(R(time));
    }
    if (!a.cuts || a.cuts === 'all') {
      for (i = 0; i + 1 < clips.numItems; i++) {
        if (Math.abs(clips[i + 1].start.seconds - clips[i].end.seconds) < eps) add(i, true, clips[i].end.seconds);
      }
    } else {
      for (var c = 0; c < a.cuts.length; c++) {
        var at = Number(a.cuts[c]), done = false;
        for (i = 0; i < clips.numItems && !done; i++) {
          if (Math.abs(clips[i].end.seconds - at) < eps) { add(i, true, at); done = true; }
        }
        for (i = 0; i < clips.numItems && !done; i++) {
          if (Math.abs(clips[i].start.seconds - at) < eps) { add(i, false, at); done = true; }
        }
        if (!done) notes.push('No clip starts or ends at ' + at + 's on ' + t.name + '.');
      }
    }
    var out = { track: t.name, transition: name, duration: a.duration || 0.5, addedAt: added };
    if (notes.length) out.notes = notes;
    return out;
  };

  function component(c, names) {
    for (var i = 0; i < c.components.numItems; i++) {
      var k = c.components[i];
      for (var n = 0; n < names.length; n++) if (k.displayName === names[n] || k.matchName === names[n]) return k;
    }
    return null;
  }

  function param(k, name) {
    for (var i = 0; i < k.properties.numItems; i++) if (k.properties[i].displayName === name) return k.properties[i];
    return null;
  }

  MMG.fns.pr_setClipProps = function (a) {
    var seq = P.findSequence(a.sequence), f = P.findClip(seq, a.clip), c = f.clip, p = a.props || {};
    var done = {}, notes = [];
    function set(k, label, name, v, shown) {
      if (!k) MMG.fail('This clip has no ' + label + ' settings' + (label === 'Volume' ? ' (pick the clip on its A track).' : ' (pick the clip on its V track).'));
      var pr = param(k, name);
      if (!pr) MMG.fail('No "' + name + '" setting on this clip.');
      if (pr.isTimeVarying()) { notes.push(name + ' has keyframes, so it was left alone.'); return; }
      pr.setValue(v, true);
      done[name] = shown;
    }
    var motion = function () { return component(c, ['Motion', 'AE.ADBE Motion']); };
    if (p.scale !== undefined) set(motion(), 'Motion', 'Scale', Number(p.scale), p.scale);
    if (p.rotation !== undefined) set(motion(), 'Motion', 'Rotation', Number(p.rotation), p.rotation);
    if (p.position !== undefined) {
      // Premiere stores position as a fraction of the frame size.
      set(motion(), 'Motion', 'Position', [p.position[0] / seq.frameSizeHorizontal, p.position[1] / seq.frameSizeVertical], p.position);
    }
    if (p.opacity !== undefined) set(component(c, ['Opacity', 'AE.ADBE Opacity']), 'Opacity', 'Opacity', Number(p.opacity), p.opacity);
    if (p.volume !== undefined) {
      // Level is stored as a gain value: 0 dB = 0.1778.
      set(component(c, ['Volume', 'audioVolume']), 'Volume', 'Level', Math.pow(10, (Number(p.volume) - 15) / 20), p.volume + ' dB');
    }
    var out = { track: f.track.name, clip: P.clipInfo(c, P.indexOfClip(seq, f.track, c)), set: done };
    if (notes.length) out.notes = notes;
    return out;
  };

  MMG.fns.pr_exportFrame = function (a) {
    var seq = P.findSequence(a.sequence), q = P.activate(seq);
    if (!a.path) MMG.fail('Missing output path.');
    var t = a.time === undefined || a.time === null ? seq.getPlayerPosition().seconds : Number(a.time);
    q.exportFramePNG(P.tc(seq, t), a.path);
    return { sequence: seq.name, time: R(t), width: seq.frameSizeHorizontal, height: seq.frameSizeVertical };
  };
})();
