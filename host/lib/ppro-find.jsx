// Premiere Pro helpers: time, sequences, tracks, clips, project items. Only touch Premiere classes when called.
$.global.MMG = $.global.MMG || {};
MMG.pr = MMG.pr || {};

(function () {
  var P = MMG.pr, R = MMG.round;
  P.TICKS = 254016000000;

  P.T = function (sec) {
    var t = new Time();
    t.seconds = Number(sec);
    return t;
  };

  /** Seconds from a Time object or a ticks string. */
  P.sec = function (t) {
    if (t === undefined || t === null) return null;
    if (typeof t === 'object') return R(t.seconds);
    return R(Number(t) / P.TICKS);
  };

  P.noProject = function () {
    if (!app.project) MMG.fail('No project is open in Premiere Pro.');
  };

  // ---------- sequences ----------

  P.sequences = function () {
    P.noProject();
    var out = [], s = app.project.sequences;
    for (var i = 0; i < s.numSequences; i++) out.push(s[i]);
    return out;
  };

  P.seqNames = function () {
    var s = P.sequences(), names = [];
    for (var i = 0; i < s.length && i < 50; i++) names.push('"' + s[i].name + '"');
    return names.join(', ');
  };

  /** Sequence by name, or the open one. */
  P.findSequence = function (name) {
    P.noProject();
    if (name === undefined || name === null || name === '') {
      if (app.project.activeSequence) return app.project.activeSequence;
      MMG.fail('No sequence is open. Open one in Premiere, or give its name. Sequences: ' + (P.seqNames() || 'none'));
    }
    var all = P.sequences();
    for (var i = 0; i < all.length; i++) if (all[i].name === String(name)) return all[i];
    MMG.fail('No sequence named "' + name + '". Sequences: ' + (P.seqNames() || 'none'));
  };

  /** Make seq the active sequence and return its QE (unofficial API) twin, needed for razor, transitions, frame export. */
  P.activate = function (seq) {
    var a = app.project.activeSequence;
    if (!a || a.sequenceID !== seq.sequenceID) app.project.openSequence(seq.sequenceID);
    app.enableQE();
    var q = qe.project.getActiveSequence();
    if (!q) MMG.fail('Could not open sequence "' + seq.name + '".');
    return q;
  };

  P.fps = function (seq) {
    var fr = seq.getSettings().videoFrameRate;
    return fr && fr.seconds ? R(1 / fr.seconds) : 25;
  };

  /** Snap seconds to the sequence's frame grid. */
  P.snap = function (seq, sec) {
    var fd = seq.getSettings().videoFrameRate.seconds;
    return Math.round(Number(sec) / fd) * fd;
  };

  /** Timecode string in the sequence's own format, for QE calls. */
  P.tc = function (seq, sec) {
    var s = seq.getSettings();
    return P.T(sec).getFormatted(s.videoFrameRate, s.videoDisplayFormat);
  };

  P.seqSummary = function (seq) {
    var o = {
      name: seq.name,
      id: seq.sequenceID,
      fps: P.fps(seq),
      width: seq.frameSizeHorizontal,
      height: seq.frameSizeVertical,
      duration: P.sec(seq.end),
      videoTracks: seq.videoTracks.numTracks,
      audioTracks: seq.audioTracks.numTracks
    };
    try { o.playhead = R(seq.getPlayerPosition().seconds); } catch (e) {}
    return o;
  };

  /** Copy a sequence and give the copy a name. Returns the new Sequence. */
  P.cloneSequence = function (src, name) {
    var before = {}, all = P.sequences(), i;
    for (i = 0; i < all.length; i++) before[all[i].sequenceID] = true;
    src.clone();
    all = P.sequences();
    for (i = 0; i < all.length; i++) {
      if (!before[all[i].sequenceID]) {
        all[i].name = String(name);
        return all[i];
      }
    }
    MMG.fail('Premiere did not make the copy of "' + src.name + '".');
  };

  P.markers = function (seq) {
    var out = [], ms = seq.markers, m = ms.getFirstMarker();
    while (m && out.length < 200) {
      var o = { time: P.sec(m.start), end: P.sec(m.end), name: m.name, comment: m.comments };
      try { o.color = P.COLOR_NAMES[m.getColorByIndex()]; } catch (e) {}
      out.push(o);
      m = ms.getNextMarker(m);
    }
    return out;
  };

  P.COLOR_NAMES = ['green', 'red', 'purple', 'orange', 'yellow', 'white', 'blue', 'cyan'];
  P.markerColor = function (name) {
    for (var i = 0; i < P.COLOR_NAMES.length; i++) if (P.COLOR_NAMES[i] === name) return i;
    MMG.fail('Marker color must be one of: ' + P.COLOR_NAMES.join(', ') + '.');
  };

  // ---------- tracks & clips ----------

  /** "V1" / "A2" -> {track, video, index, name}. */
  P.getTrack = function (seq, ref) {
    var m = /^([VA])(\d+)$/i.exec(String(ref));
    if (!m) MMG.fail('Track must look like "V1" or "A1", got "' + ref + '".');
    var video = m[1].toUpperCase() === 'V', idx = parseInt(m[2], 10) - 1;
    var list = video ? seq.videoTracks : seq.audioTracks;
    if (idx < 0 || idx >= list.numTracks) {
      MMG.fail('Track ' + ref + ' does not exist. This sequence has V1-V' + seq.videoTracks.numTracks + ' and A1-A' + seq.audioTracks.numTracks + '.');
    }
    return { track: list[idx], video: video, index: idx, name: (video ? 'V' : 'A') + (idx + 1) };
  };

  /** Listed tracks, or every track when refs is empty / "all". */
  P.tracks = function (seq, refs) {
    var out = [], i;
    if (refs && refs !== 'all' && refs.length) {
      for (i = 0; i < refs.length; i++) out.push(P.getTrack(seq, refs[i]));
      return out;
    }
    for (i = 0; i < seq.videoTracks.numTracks; i++) out.push(P.getTrack(seq, 'V' + (i + 1)));
    for (i = 0; i < seq.audioTracks.numTracks; i++) out.push(P.getTrack(seq, 'A' + (i + 1)));
    return out;
  };

  /** Track collections go stale after edits: always re-read. */
  P.fresh = function (seq, t) {
    return (t.video ? seq.videoTracks : seq.audioTracks)[t.index];
  };

  P.qeTrack = function (q, t) {
    return t.video ? q.getVideoTrackAt(t.index) : q.getAudioTrackAt(t.index);
  };

  P.isLocked = function (t) {
    try { return !!t.track.isLocked(); } catch (e) { return false; }
  };

  P.clipInfo = function (c, i) {
    var o = {
      index: i + 1,
      name: c.name,
      start: P.sec(c.start),
      end: P.sec(c.end),
      inPoint: P.sec(c.inPoint),
      outPoint: P.sec(c.outPoint)
    };
    try { if (c.disabled) o.disabled = true; } catch (e) {}
    try { if (c.projectItem) o.item = P.itemPath(c.projectItem); } catch (e2) {}
    return o;
  };

  P.indexOfClip = function (seq, t, clip) {
    var clips = P.fresh(seq, t).clips;
    for (var i = 0; i < clips.numItems; i++) if (clips[i].nodeId === clip.nodeId) return i;
    return -1;
  };

  P.clipById = function (seq, t, id) {
    var clips = P.fresh(seq, t).clips;
    for (var i = 0; i < clips.numItems; i++) if (clips[i].nodeId === id) return clips[i];
    return null;
  };

  /** Clip by {track, index} (1-based) or by name. Returns {clip, track}. */
  P.findClip = function (seq, ref) {
    var i, j;
    if (ref && typeof ref === 'object') {
      var t = P.getTrack(seq, ref.track), clips = t.track.clips;
      i = Number(ref.index) - 1;
      if (isNaN(i) || i < 0 || i >= clips.numItems) {
        MMG.fail('Clip ' + ref.index + ' does not exist on ' + t.name + ' (it has ' + clips.numItems + ' clips).');
      }
      return { clip: clips[i], track: t };
    }
    var all = P.tracks(seq);
    for (i = 0; i < all.length; i++) {
      var cs = all[i].track.clips;
      for (j = 0; j < cs.numItems; j++) if (cs[j].name === String(ref)) return { clip: cs[j], track: all[i] };
    }
    MMG.fail('No clip named "' + ref + '" in "' + seq.name + '". Read the sequence state to see clips.');
  };

  // ---------- project items ----------

  P.isBin = function (it) {
    return it.type === ProjectItemType.BIN || it.type === ProjectItemType.ROOT;
  };

  P.itemType = function (it) {
    if (it.type === ProjectItemType.BIN) return 'bin';
    try { if (it.isSequence()) return 'sequence'; } catch (e) {}
    if (it.type === ProjectItemType.CLIP) return 'clip';
    if (it.type === ProjectItemType.FILE) return 'file';
    return 'other';
  };

  /** "Bin/Sub/clip.mp4" from the project root. */
  P.itemPath = function (it) {
    var tp = String(it.treePath || it.name), parts = tp.split('\\'), out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(parts[i]);
    if (out.length > 1) out.shift(); // project file name
    return out.join('/');
  };

  P.child = function (bin, name) {
    if (!bin.children) return null;
    for (var i = 0; i < bin.children.numItems; i++) if (bin.children[i].name === name) return bin.children[i];
    return null;
  };

  P.walk = function (bin, fn, depth) {
    depth = depth || 0;
    if (!bin.children || depth > 20) return;
    for (var i = 0; i < bin.children.numItems; i++) {
      var it = bin.children[i];
      fn(it, depth);
      if (it.type === ProjectItemType.BIN) P.walk(it, fn, depth + 1);
    }
  };

  /** Item by path ("Bin/clip.mp4") or by unique name. */
  P.findItem = function (ref) {
    P.noProject();
    var s = String(ref), i;
    if (s.indexOf('/') >= 0) {
      var parts = s.split('/'), cur = app.project.rootItem;
      for (i = 0; i < parts.length; i++) {
        var next = P.child(cur, parts[i]);
        if (!next) MMG.fail('Nothing at "' + s + '" in the project (stuck at "' + parts[i] + '").');
        cur = next;
      }
      return cur;
    }
    var hits = [];
    P.walk(app.project.rootItem, function (it) { if (it.name === s) hits.push(it); });
    if (!hits.length) MMG.fail('No project item named "' + s + '". Read the project state to see names.');
    if (hits.length > 1) {
      var paths = [];
      for (i = 0; i < hits.length && i < 10; i++) paths.push('"' + P.itemPath(hits[i]) + '"');
      MMG.fail('Several items are named "' + s + '": ' + paths.join(', ') + '. Use the full path.');
    }
    return hits[0];
  };

  /** Bin by path, creating missing bins. Empty path = project root. */
  P.ensureBin = function (path) {
    P.noProject();
    var cur = app.project.rootItem;
    if (!path) return cur;
    var parts = String(path).split('/');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var next = P.child(cur, parts[i]);
      if (next && !P.isBin(next)) MMG.fail('"' + parts[i] + '" is not a bin.');
      if (!next) {
        cur.createBin(parts[i]);
        next = P.child(cur, parts[i]);
        if (!next) MMG.fail('Could not create bin "' + parts[i] + '".');
      }
      cur = next;
    }
    return cur;
  };

  P.normPath = function (p) {
    var s = String(p).replace(/\\/g, '/');
    return $.os.indexOf('Windows') >= 0 ? s.toLowerCase() : s;
  };
})();
