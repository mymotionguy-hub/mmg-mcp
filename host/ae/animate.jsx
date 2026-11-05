// After Effects animation: keyframes, text animation presets, effects, expressions.
(function () {
  var A = MMG.ae, R = MMG.round;

  function num(v, d) { return v === undefined || v === null ? d : Number(v); }

  // ---------- keyframes ----------

  MMG.fns.ae_setKeyframes = function (a) {
    return A.undo('Set keyframes', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), pr = A.findProp(l, a.property), i;
      if (!pr.canVaryOverTime) MMG.fail('"' + a.property + '" cannot be animated.');
      if (pr.dimensionsSeparated) MMG.fail('Position has separate dimensions on this layer. Use "x position" and "y position".');
      if (a.clear) while (pr.numKeys > 0) pr.removeKey(1);
      var keys = a.keys || [];
      for (i = 0; i < keys.length; i++) pr.setValueAtTime(Number(keys[i].time), A.fitValue(pr, keys[i].value));
      // Ease after all keys exist, since adding keys shifts indexes.
      for (i = 0; i < keys.length; i++) {
        var e = keys[i].ease !== undefined && keys[i].ease !== null ? keys[i].ease : a.ease;
        if (e !== undefined && e !== null) A.applyEase(pr, pr.nearestKeyIndex(Number(keys[i].time)), e);
      }
      return { layer: l.name, property: pr.name, matchName: pr.matchName, keys: A.keysInfo(pr) };
    });
  };

  // ---------- text animation presets ----------

  /** Keys along [t0..t1]. `values` go from hidden to rest; reversed when animating out. */
  function keyRun(prop, times, values, out, eases) {
    var v = values.slice(0);
    if (out) v.reverse();
    for (var i = 0; i < times.length; i++) prop.setValueAtTime(times[i], v[i]);
    for (var j = 0; j < times.length; j++) A.applyEase(prop, prop.nearestKeyIndex(times[j]), eases[j]);
  }

  /** Text animator with a range selector. setup(add) adds animator properties. Returns the selector's Start property. */
  function addAnimator(l, name, basedOn, smoothness, setup) {
    var anims = function () { return l.property('ADBE Text Properties').property('ADBE Text Animators'); };
    anims().addProperty('ADBE Text Animator');
    var idx = anims().numProperties;
    var an = function () { return anims().property(idx); };
    an().name = name;
    setup(function (match, value) {
      an().property('ADBE Text Animator Properties').addProperty(match);
      var p = an().property('ADBE Text Animator Properties').property(match);
      p.setValue(A.fitValue(p, value));
    });
    an().property('ADBE Text Selectors').addProperty('ADBE Text Selector');
    var adv = an().property('ADBE Text Selectors').property(1).property('ADBE Text Range Advanced');
    adv.property('ADBE Text Range Type2').setValue(basedOn);
    an().property('ADBE Text Selectors').property(1).property('ADBE Text Range Advanced')
      .property('ADBE Text Selector Smoothness').setValue(smoothness);
    return an().property('ADBE Text Selectors').property(1).property('ADBE Text Percent Start');
  }

  MMG.fns.ae_animateText = function (a) {
    return A.undo('Animate text', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), o = a.options || {};
      var out = !!o.out, preset = a.preset;
      var t0 = num(a.start, l.inPoint), d = num(a.duration, 0.6), t1 = t0 + d;
      if (d <= 0) MMG.fail('Duration must be more than 0.');
      var tg = l.property('ADBE Transform Group');
      // In: quick start, long settle. Out: slow start, quick exit.
      var e0 = out ? { influenceIn: 33, influenceOut: 75 } : { influenceIn: 33, influenceOut: 10 };
      var e1 = out ? { influenceIn: 10, influenceOut: 33 } : { influenceIn: 75, influenceOut: 33 };
      var op = tg.property('ADBE Opacity');
      var restOp = op.valueAtTime(out ? t0 : t1, false);
      if (restOp === 0) restOp = 100;

      if (preset === 'fade') {
        keyRun(op, [t0, t1], [0, restOp], out, [e0, e1]);
      } else if (preset === 'slide') {
        if (!(l instanceof TextLayer) && !(l instanceof AVLayer)) MMG.fail('This layer cannot slide.');
        var pos = tg.property('ADBE Position');
        if (pos.dimensionsSeparated) MMG.fail('Position has separate dimensions on this layer; slide needs them joined.');
        var rest = pos.valueAtTime(out ? t0 : t1, false), dist = num(o.distance, 100), from = rest.slice(0);
        var dir = o.direction || 'up';
        if (dir === 'up') from[1] += dist;
        else if (dir === 'down') from[1] -= dist;
        else if (dir === 'left') from[0] += dist;
        else if (dir === 'right') from[0] -= dist;
        else MMG.fail('direction must be up, down, left or right.');
        keyRun(pos, [t0, t1], [from, rest], out, [e0, e1]);
        keyRun(op, out ? [t1 - d * 0.6, t1] : [t0, t0 + d * 0.6], [0, restOp], out, [e0, e1]);
      } else if (preset === 'pop') {
        var sc = tg.property('ADBE Scale');
        var restSc = sc.valueAtTime(out ? t0 : t1, false), over = num(o.overshoot, 1.1);
        var zero = [], peak = [];
        for (var i = 0; i < restSc.length; i++) { zero.push(0); peak.push(restSc[i] * over); }
        keyRun(sc, [t0, t0 + d * 0.65, t1], [zero, peak, restSc], out, [e0, 'ease', e1]);
        keyRun(op, out ? [t1 - d * 0.25, t1] : [t0, t0 + d * 0.25], [0, restOp], out, ['linear', 'linear']);
      } else if (preset === 'typeOn' || preset === 'wordByWord') {
        if (!(l instanceof TextLayer)) MMG.fail(preset + ' only works on text layers.');
        var words = preset === 'wordByWord';
        var start = addAnimator(l, words ? 'MMG Word by word' : 'MMG Type on', words ? 3 : 1, words ? 100 : 0,
          function (add) {
            add('ADBE Text Opacity', 0);
            if (words) add('ADBE Text Position 3D', [0, num(o.distance, 30), 0]);
          });
        // Start 0 -> 100 reveals from the left; reversed hides again.
        var ease = words ? [e0, e1] : ['linear', 'linear'];
        keyRun(start, [t0, t1], [0, 100], out, ease);
      } else {
        MMG.fail('Unknown preset "' + preset + '". Use fade, slide, pop, typeOn or wordByWord.');
      }
      return { preset: preset, direction: out ? 'out' : 'in', start: R(t0), end: R(t1), layer: A.layerInfo(l) };
    });
  };

  // ---------- effects ----------

  A.effectInfo = function (e) {
    var params = [];
    for (var i = 1; i <= e.numProperties && params.length < 40; i++) {
      var p = e.property(i);
      if (p.propertyType !== PropertyType.PROPERTY) continue;
      var t = p.propertyValueType;
      if (t === PropertyValueType.NO_VALUE || t === PropertyValueType.CUSTOM_VALUE) continue;
      params.push({ name: p.name, value: A.valueOf(p) });
    }
    return { index: e.propertyIndex, name: e.name, matchName: e.matchName, params: params };
  };

  MMG.fns.ae_addEffect = function (a) {
    return A.undo('Add effect', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer);
      var fx = function () { return l.property('ADBE Effect Parade'); };
      if (!fx()) MMG.fail('"' + l.name + '" cannot have effects.');
      if (!fx().canAddProperty(String(a.effect))) {
        MMG.fail('Effect "' + a.effect + '" not found. Use its match name (e.g. "ADBE Gaussian Blur 2") or its English name.');
      }
      fx().addProperty(String(a.effect));
      var idx = fx().numProperties;
      var eff = function () { return fx().property(idx); };
      if (a.name) eff().name = String(a.name);
      var notes = [];
      if (a.props) {
        for (var k in a.props) {
          if (!Object.prototype.hasOwnProperty.call(a.props, k)) continue;
          try {
            var p = A.walk(eff(), k, 'effect "' + eff().name + '"');
            A.setValue(p, A.fitValue(p, a.props[k]), c.time);
          } catch (err) {
            notes.push(String(err.message || err));
          }
        }
      }
      var out = { layer: l.name, effect: A.effectInfo(eff()) };
      if (notes.length) out.notes = notes;
      return out;
    });
  };

  // ---------- expressions ----------

  function presetExpression(p, o) {
    o = o || {};
    if (p === 'wiggle') return 'wiggle(' + num(o.freq, 2) + ', ' + num(o.amp, 20) + ')';
    if (p === 'loopOut' || p === 'loopIn') {
      var type = o.type || 'cycle';
      if (!/^(cycle|pingpong|offset|continue)$/.test(type)) MMG.fail('Loop type must be cycle, pingpong, offset or continue.');
      return p + '("' + type + '")';
    }
    if (p === 'inertiaBounce') {
      return [
        'var amp = ' + num(o.amp, 0.06) + ', freq = ' + num(o.freq, 3) + ', decay = ' + num(o.decay, 5) + ';',
        'var n = 0;',
        'if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }',
        'var t = n == 0 ? 0 : time - key(n).time;',
        'if (n > 0 && t < 1) {',
        '  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
        '  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);',
        '} else { value; }'
      ].join('\n');
    }
    MMG.fail('Unknown expression preset "' + p + '". Use wiggle, loopOut, loopIn or inertiaBounce.');
  }

  MMG.fns.ae_setExpression = function (a) {
    return A.undo('Set expression', function () {
      var c = A.findComp(a.comp), l = A.findLayer(c, a.layer), pr = A.findProp(l, a.property);
      if (!pr.canSetExpression) MMG.fail('"' + a.property + '" cannot take an expression.');
      var expr = a.preset ? presetExpression(a.preset, a.options)
        : (a.expression === undefined || a.expression === null ? '' : String(a.expression));
      pr.expression = expr;
      var err = null;
      if (expr) {
        try { pr.valueAtTime(c.time, false); } catch (e) {}
        try { err = pr.expressionError || null; } catch (e2) {}
      }
      return { layer: l.name, property: pr.name, expression: expr, enabled: pr.expressionEnabled, error: err };
    });
  };
})();
