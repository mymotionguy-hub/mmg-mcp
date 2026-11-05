// After Effects: read comp state, export a frame. Also exposes layer/comp info helpers on MMG.ae.
(function () {
  var A = MMG.ae, R = MMG.round;

  function layerType(l) {
    if (l instanceof TextLayer) return 'text';
    if (l instanceof ShapeLayer) return 'shape';
    if (l instanceof CameraLayer) return 'camera';
    if (l instanceof LightLayer) return 'light';
    if (l.nullLayer) return 'null';
    if (l.adjustmentLayer) return 'adjustment';
    var s = l.source;
    if (!s) return 'other';
    if (s instanceof CompItem) return 'precomp';
    if (s.mainSource instanceof SolidSource) return 'solid';
    if (s.mainSource && s.mainSource.isStill) return 'image';
    if (!s.hasVideo) return 'audio';
    return 'video';
  }

  function effectsOf(l) {
    var out = [], fx = l.property('ADBE Effect Parade');
    if (!fx) return out;
    for (var i = 1; i <= fx.numProperties; i++) {
      var e = fx.property(i);
      out.push({ index: i, name: e.name, matchName: e.matchName, enabled: e.enabled });
    }
    return out;
  }

  A.transformInfo = function (l) {
    var tg = l.property('ADBE Transform Group');
    if (!tg) return null;
    var o = {}, keyed = [];
    var map = [['position', 'ADBE Position'], ['anchor', 'ADBE Anchor Point'], ['scale', 'ADBE Scale'],
      ['rotation', 'ADBE Rotate Z'], ['opacity', 'ADBE Opacity']];
    for (var i = 0; i < map.length; i++) {
      var p = tg.property(map[i][1]);
      if (!p) continue;
      o[map[i][0]] = A.valueOf(p);
      if (p.numKeys > 0 || (p.dimensionsSeparated && tg.property('ADBE Position_0').numKeys > 0)) keyed.push(map[i][0]);
      if (p.expressionEnabled) keyed.push(map[i][0] + ' (expression)');
    }
    if (keyed.length) o.animated = keyed;
    return o;
  };

  A.layerInfo = function (l) {
    var o = {
      index: l.index,
      name: l.name,
      type: layerType(l),
      enabled: l.enabled,
      inPoint: R(l.inPoint),
      outPoint: R(l.outPoint),
      startTime: R(l.startTime),
      parent: l.parent ? l.parent.index : null,
      label: l.label,
      locked: l.locked,
      shy: l.shy,
      solo: l.solo
    };
    if (l instanceof AVLayer) {
      o.is3D = l.threeDLayer;
      if (l.source) o.source = l.source.name;
      o.blendMode = l.blendingMode;
      if (l.hasTrackMatte) o.trackMatte = l.trackMatteType;
    }
    if (l instanceof TextLayer) {
      try { o.text = l.property('ADBE Text Properties').property('ADBE Text Document').value.text; } catch (e) {}
    }
    o.transform = A.transformInfo(l);
    o.effects = effectsOf(l);
    return o;
  };

  A.compSummary = function (c) {
    return {
      name: c.name,
      width: c.width,
      height: c.height,
      pixelAspect: c.pixelAspect,
      fps: c.frameRate,
      duration: R(c.duration),
      time: R(c.time),
      workAreaStart: R(c.workAreaStart),
      workAreaDuration: R(c.workAreaDuration),
      bgColor: A.r(c.bgColor),
      numLayers: c.numLayers
    };
  };

  /** Short index/name list, returned after edits that change layer order. */
  A.layerList = function (c) {
    var out = [];
    for (var i = 1; i <= c.numLayers; i++) out.push({ index: i, name: c.layer(i).name });
    return out;
  };

  MMG.fns.ae_getCompState = function (a) {
    var c = A.findComp(a.comp);
    var layers = [];
    for (var i = 1; i <= c.numLayers; i++) layers.push(A.layerInfo(c.layer(i)));
    return { comp: A.compSummary(c), layers: layers, otherComps: A.compNames(50) };
  };

  MMG.fns.ae_exportFrame = function (a) {
    var c = A.findComp(a.comp);
    if (!a.path) MMG.fail('Missing output path.');
    var t = a.time === undefined || a.time === null ? c.time : Number(a.time);
    if (isNaN(t) || t < 0 || t >= c.duration) {
      MMG.fail('Time ' + a.time + 's is outside "' + c.name + '" (0 to ' + R(c.duration - c.frameDuration) + 's).');
    }
    if (!c.saveFrameToPng) MMG.fail('This After Effects version cannot save frames from scripts.');
    var f = new File(a.path);
    c.saveFrameToPng(t, f);
    return { comp: c.name, time: R(t), width: c.width, height: c.height };
  };
})();
