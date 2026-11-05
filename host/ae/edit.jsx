// After Effects edits: comps, layers, text, transform, layer order, precompose, generic property set.
// Every function runs inside one undo group (MMG.ae.undo).
(function () {
  var A = MMG.ae, R = MMG.round;

  function num(v, d) { return v === undefined || v === null ? d : Number(v); }

  // ---------- comps ----------

  MMG.fns.ae_createComp = function (a) {
    return A.undo('Create comp', function () {
      if (!a.name) MMG.fail('Give the comp a name.');
      var c = app.project.items.addComp(String(a.name), Math.round(a.width), Math.round(a.height),
        num(a.pixelAspect, 1), Number(a.duration), Number(a.fps));
      if (a.bgColor) c.bgColor = A.color(a.bgColor);
      try { c.openInViewer(); } catch (e) {}
      return { comp: A.compSummary(c) };
    });
  };

  MMG.fns.ae_duplicateComp = function (a) {
    return A.undo('Duplicate comp', function () {
      var c = A.findComp(a.comp);
      var d = c.duplicate();
      d.name = a.name ? String(a.name) : c.name + ' copy';
      return { original: c.name, comp: A.compSummary(d) };
    });
  };

  // ---------- layers ----------

  MMG.fns.ae_addLayer = function (a) {
    return A.undo('Add layer', function () {
      var c = A.findComp(a.comp), k = a.kind, l;
      var full = k === 'solid' || k === 'adjustment';
      var w = a.size ? Number(a.size[0]) : (full ? c.width : 400);
      var h = a.size ? Number(a.size[1]) : (full ? c.height : 400);
      var col = a.color ? A.color(a.color) : (k === 'solid' ? [0.5, 0.5, 0.5] : [1, 1, 1]);

      if (k === 'solid' || k === 'adjustment') {
        l = c.layers.addSolid(col, a.name ? String(a.name) : (k === 'solid' ? 'Solid' : 'Adjustment'),
          Math.round(w), Math.round(h), c.pixelAspect, c.duration);
        if (k === 'adjustment') l.adjustmentLayer = true;
      } else if (k === 'null') {
        l = c.layers.addNull(c.duration);
      } else if (k === 'camera') {
        l = c.layers.addCamera(a.name ? String(a.name) : 'Camera', [c.width / 2, c.height / 2]);
      } else if (k === 'rectangle' || k === 'ellipse') {
        var rect = k === 'rectangle';
        l = c.layers.addShape();
        // AE invalidates property references after addProperty, so re-fetch every time.
        var root = function () { return l.property('ADBE Root Vectors Group'); };
        var vecs = function () { return root().property(1).property('ADBE Vectors Group'); };
        root().addProperty('ADBE Vector Group');
        root().property(1).name = rect ? 'Rectangle' : 'Ellipse';
        vecs().addProperty(rect ? 'ADBE Vector Shape - Rect' : 'ADBE Vector Shape - Ellipse');
        vecs().addProperty('ADBE Vector Graphic - Fill');
        vecs().property(1).property(rect ? 'ADBE Vector Rect Size' : 'ADBE Vector Ellipse Size').setValue([w, h]);
        if (rect && a.roundness) vecs().property(1).property('ADBE Vector Rect Roundness').setValue(Number(a.roundness));
        vecs().property(2).property('ADBE Vector Fill Color').setValue(A.color(col, true));
        if (!a.name) l.name = rect ? 'Rectangle' : 'Ellipse';
      } else {
        MMG.fail('Unknown layer kind "' + k + '". Use solid, rectangle, ellipse, null, adjustment or camera.');
      }
      if (a.name) l.name = String(a.name);
      return { layer: A.layerInfo(l) };
    });
  };

  // ---------- text ----------

  function justification(al) {
    var P = ParagraphJustification;
    if (al === 'left') return P.LEFT_JUSTIFY;
    if (al === 'right') return P.RIGHT_JUSTIFY;
    return P.CENTER_JUSTIFY;
  }

  function applyStyle(doc, s) {
    if (s.text !== undefined && s.text !== null) doc.text = String(s.text);
    if (s.font) doc.font = String(s.font);
    if (s.size) doc.fontSize = Number(s.size);
    if (s.color) { doc.applyFill = true; doc.fillColor = A.color(s.color); }
    if (s.strokeColor) { doc.applyStroke = true; doc.strokeColor = A.color(s.strokeColor); }
    if (s.strokeWidth !== undefined && s.strokeWidth !== null) {
      if (Number(s.strokeWidth) > 0) { doc.applyStroke = true; doc.strokeWidth = Number(s.strokeWidth); }
      else doc.applyStroke = false;
    }
    if (s.tracking !== undefined && s.tracking !== null) doc.tracking = Number(s.tracking);
    if (s.leading !== undefined && s.leading !== null) { doc.autoLeading = false; doc.leading = Number(s.leading); }
    if (s.align) doc.justification = justification(s.align);
    if (s.allCaps !== undefined && s.allCaps !== null) doc.allCaps = !!s.allCaps;
    return doc;
  }

  function docInfo(doc) {
    var o = { text: doc.text, font: doc.font, size: doc.fontSize, tracking: doc.tracking };
    try { if (doc.applyFill) o.color = A.r(doc.fillColor); } catch (e) {}
    try { if (doc.applyStroke) { o.strokeColor = A.r(doc.strokeColor); o.strokeWidth = doc.strokeWidth; } } catch (e2) {}
    try { o.leading = doc.autoLeading ? 'auto' : doc.leading; } catch (e3) {}
    return o;
  }

  function textDoc(l) { return l.property('ADBE Text Properties').property('ADBE Text Document'); }

  MMG.fns.ae_addText = function (a) {
    return A.undo('Add text', function () {
      var c = A.findComp(a.comp);
      var l = c.layers.addText(String(a.text));
      var prop = textDoc(l);
      prop.setValue(applyStyle(prop.value, {
        font: a.font, size: a.size || 72, color: a.color || [1, 1, 1], align: a.align || 'center'
      }));
      if (a.name) l.name = String(a.name);
      // Anchor in the middle of the text, so scale/rotation animate from the center.
      var r = l.sourceRectAtTime(l.inPoint, false);
      var tg = l.property('ADBE Transform Group');
      tg.property('ADBE Anchor Point').setValue([r.left + r.width / 2, r.top + r.height / 2]);
      tg.property('ADBE Position').setValue(a.position
        ? [Number(a.position[0]), Number(a.position[1])]
        : [c.width / 2, c.height / 2]);
      var fontAsked = a.font ? String(a.font) : null;
      var out = { layer: A.layerInfo(l), style: docInfo(prop.value) };
      if (fontAsked && prop.value.font !== fontAsked) out.note = 'Font "' + fontAsked + '" was not found; AE used "' + prop.value.font + '". Use the PostScript name (e.g. "Montserrat-Bold").';
      return out;
    });
  };

  MMG.fns.ae_styleText = function (a) {
    return A.undo('Style text', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer);
      if (!(l instanceof TextLayer)) MMG.fail('"' + l.name + '" is not a text layer.');
      var prop = textDoc(l), s = a.props || {};
      if (prop.numKeys > 0) {
        for (var k = 1; k <= prop.numKeys; k++) prop.setValueAtKey(k, applyStyle(prop.keyValue(k), s));
      } else {
        prop.setValue(applyStyle(prop.value, s));
      }
      var out = { layer: A.layerInfo(l), style: docInfo(prop.value) };
      if (s.font && prop.value.font !== String(s.font)) out.note = 'Font "' + s.font + '" was not found; AE kept "' + prop.value.font + '". Use the PostScript name.';
      return out;
    });
  };

  // ---------- transform & any property ----------

  MMG.fns.ae_setTransform = function (a) {
    return A.undo('Set transform', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), p = a.props || {};
      var tg = l.property('ADBE Transform Group'), notes = [];
      function set(match, v, label) {
        var pr = tg.property(match);
        if (!pr) MMG.fail('Layer "' + l.name + '" has no ' + label + '.');
        if (A.setValue(pr, A.fitValue(pr, v), c.time)) notes.push(label + ' has keyframes, so it was set at the current time (' + R(c.time) + 's).');
      }
      if (p.position !== undefined) {
        var pos = tg.property('ADBE Position');
        if (pos.dimensionsSeparated) {
          set('ADBE Position_0', p.position[0], 'x position');
          set('ADBE Position_1', p.position[1], 'y position');
          if (p.position.length > 2 && l.threeDLayer) set('ADBE Position_2', p.position[2], 'z position');
        } else {
          set('ADBE Position', p.position, 'position');
        }
      }
      if (p.anchor !== undefined) set('ADBE Anchor Point', p.anchor, 'anchor point');
      if (p.scale !== undefined) set('ADBE Scale', p.scale, 'scale');
      if (p.rotation !== undefined) set('ADBE Rotate Z', p.rotation, 'rotation');
      if (p.opacity !== undefined) set('ADBE Opacity', p.opacity, 'opacity');
      var out = { layer: A.layerInfo(l) };
      if (notes.length) out.notes = notes;
      return out;
    });
  };

  MMG.fns.ae_setProperty = function (a) {
    return A.undo('Set property', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), pr = A.findProp(l, a.property);
      var keyed = A.setValue(pr, A.fitValue(pr, a.value), c.time);
      var out = { layer: l.name, property: pr.name, matchName: pr.matchName, value: A.valueOf(pr) };
      if (keyed) out.note = 'Property has keyframes, so it was set at the current time (' + R(c.time) + 's).';
      return out;
    });
  };

  // ---------- order, parent, rename, trim, duplicate, delete ----------

  MMG.fns.ae_layerOrder = function (a) {
    return A.undo('Layer ' + a.action, function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), act = a.action, result = l, deleted = null;
      function target() {
        if (a.target === undefined || a.target === null) MMG.fail('Action "' + act + '" needs a target layer.');
        var t = A.findLayer(c, a.target);
        if (t === l || t.index === l.index) MMG.fail('The target is the same layer.');
        return t;
      }
      if (act === 'moveTo') {
        if (!a.index) MMG.fail('moveTo needs an index.');
        l.moveTo(Math.max(1, Math.min(c.numLayers, Math.round(a.index))));
      } else if (act === 'moveBefore') l.moveBefore(target());
      else if (act === 'moveAfter') l.moveAfter(target());
      else if (act === 'toTop') l.moveToBeginning();
      else if (act === 'toBottom') l.moveToEnd();
      else if (act === 'parent') l.parent = target();
      else if (act === 'unparent') l.parent = null;
      else if (act === 'rename') {
        if (!a.name) MMG.fail('rename needs a name.');
        l.name = String(a.name);
      } else if (act === 'trim') {
        if (a.inPoint !== undefined && a.inPoint !== null) l.inPoint = Number(a.inPoint);
        if (a.outPoint !== undefined && a.outPoint !== null) l.outPoint = Number(a.outPoint);
      } else if (act === 'shift') {
        if (a.startTime === undefined || a.startTime === null) MMG.fail('shift needs startTime.');
        l.startTime = Number(a.startTime);
      } else if (act === 'duplicate') {
        result = l.duplicate();
        if (a.name) result.name = String(a.name);
      } else if (act === 'delete') {
        deleted = l.name;
        l.remove();
        result = null;
      } else {
        MMG.fail('Unknown action "' + act + '".');
      }
      var out = { layers: A.layerList(c) };
      if (result) out.layer = A.layerInfo(result);
      if (deleted) out.deleted = deleted;
      return out;
    });
  };

  // ---------- precompose ----------

  MMG.fns.ae_precompose = function (a) {
    return A.undo('Precompose', function () {
      var c = A.findComp(a.comp), idx = [], i;
      if (!a.layers || !a.layers.length) MMG.fail('List the layers to precompose.');
      for (i = 0; i < a.layers.length; i++) idx.push(A.findLayer(c, a.layers[i]).index);
      idx.sort(function (x, y) { return x - y; });
      var move = a.moveAttributes === undefined || a.moveAttributes === null ? true : !!a.moveAttributes;
      if (idx.length > 1 && !move) MMG.fail('With more than one layer, moveAttributes must be true.');
      var nc = c.layers.precompose(idx, String(a.name), move);
      var layer = null;
      for (i = 1; i <= c.numLayers; i++) if (c.layer(i).source === nc) layer = c.layer(i);
      return { newComp: A.compSummary(nc), layer: layer ? A.layerInfo(layer) : null, layers: A.layerList(c) };
    });
  };
})();
