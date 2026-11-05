// AE property helpers: colors, property paths, values, easing. Only touch AE classes when called.
$.global.MMG = $.global.MMG || {};
MMG.ae = MMG.ae || {};

(function () {
  var A = MMG.ae;

  function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }

  /** "#RRGGBB" or [r,g,b] (0-1) -> [r,g,b] (or [r,g,b,1] with alpha). */
  A.color = function (v, withAlpha) {
    var c;
    if (typeof v === 'string') {
      var h = v.replace(/^#/, '');
      if (!/^[0-9a-fA-F]{6}$/.test(h)) MMG.fail('Bad color "' + v + '". Use "#RRGGBB" or [r,g,b] from 0 to 1.');
      c = [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
    } else if (v && v.length >= 3) {
      c = [Number(v[0]), Number(v[1]), Number(v[2])];
    } else {
      MMG.fail('Bad color. Use "#RRGGBB" or [r,g,b] from 0 to 1.');
    }
    if (withAlpha) c.push(1);
    return c;
  };

  /** Round numbers and arrays of numbers for compact output. */
  A.r = function (v) {
    if (typeof v === 'number') return MMG.round(v);
    if (v && typeof v === 'object' && v.length !== undefined) {
      var out = [];
      for (var i = 0; i < v.length; i++) out.push(typeof v[i] === 'number' ? MMG.round(v[i]) : v[i]);
      return out;
    }
    return v;
  };

  var ALIASES = {
    'position': 'ADBE Transform Group/ADBE Position',
    'x position': 'ADBE Transform Group/ADBE Position_0',
    'y position': 'ADBE Transform Group/ADBE Position_1',
    'z position': 'ADBE Transform Group/ADBE Position_2',
    'scale': 'ADBE Transform Group/ADBE Scale',
    'rotation': 'ADBE Transform Group/ADBE Rotate Z',
    'x rotation': 'ADBE Transform Group/ADBE Rotate X',
    'y rotation': 'ADBE Transform Group/ADBE Rotate Y',
    'orientation': 'ADBE Transform Group/ADBE Orientation',
    'opacity': 'ADBE Transform Group/ADBE Opacity',
    'anchor': 'ADBE Transform Group/ADBE Anchor Point',
    'anchor point': 'ADBE Transform Group/ADBE Anchor Point',
    'source text': 'ADBE Text Properties/ADBE Text Document'
  };
  var GROUPS = {
    'effects': 'ADBE Effect Parade',
    'transform': 'ADBE Transform Group',
    'text': 'ADBE Text Properties',
    'masks': 'ADBE Mask Parade',
    'contents': 'ADBE Root Vectors Group'
  };

  /** Walk "A/B/C" from a property group, by display name, match name, or 1-based index. */
  A.walk = function (start, path, label) {
    var parts = String(path).split('/'), cur = start;
    for (var i = 0; i < parts.length; i++) {
      var part = trim(parts[i]), next = null;
      if (GROUPS[part.toLowerCase()]) next = cur.property(GROUPS[part.toLowerCase()]);
      if (!next) next = cur.property(part);
      if (!next && /^\d+$/.test(part)) next = cur.property(parseInt(part, 10));
      if (!next) MMG.fail('"' + path + '" not found on ' + label + ' (stuck at "' + part + '").');
      cur = next;
    }
    return cur;
  };

  /** A layer property by friendly name ("opacity") or path ("Effects/Gaussian Blur/Blurriness"). */
  A.findProp = function (layer, path) {
    var alias = ALIASES[trim(path).toLowerCase()];
    var p = A.walk(layer, alias || path, 'layer "' + layer.name + '"');
    if (p.propertyType !== PropertyType.PROPERTY) MMG.fail('"' + path + '" is a group, not a property. Add the property name after a "/".');
    return p;
  };

  /** Make a value fit the property: hex colors, a single number for every dimension, missing z kept. */
  A.fitValue = function (prop, v) {
    if (prop.propertyValueType === PropertyValueType.COLOR) return A.color(v, true);
    if (typeof v === 'boolean') return v ? 1 : 0;
    var cur = prop.value, i, out;
    if (cur && typeof cur === 'object' && cur.length !== undefined) {
      out = [];
      if (typeof v === 'number') {
        for (i = 0; i < cur.length; i++) out.push(v);
        return out;
      }
      for (i = 0; i < cur.length; i++) out.push(v && i < v.length ? Number(v[i]) : cur[i]);
      return out;
    }
    if (v && typeof v === 'object' && v.length !== undefined) return Number(v[0]);
    return v;
  };

  /** Set a value; if the property is keyframed, set it at `time` instead. Returns true if keyframed. */
  A.setValue = function (prop, v, time) {
    if (prop.numKeys > 0) {
      prop.setValueAtTime(time, v);
      return true;
    }
    prop.setValue(v);
    return false;
  };

  function clampInfluence(n, d) {
    n = n === undefined || n === null ? d : Number(n);
    return Math.max(0.1, Math.min(100, n));
  }

  /**
   * Easing on key k. ease: "linear" | "hold" | "ease" (both sides) |
   * "easeIn" (slows arriving at this key, AE Easy Ease In) | "easeOut" (starts slowly leaving it) |
   * {influenceIn, influenceOut} in percent.
   */
  A.applyEase = function (prop, k, ease) {
    if (ease === undefined || ease === null) return;
    var KI = KeyframeInterpolationType;
    if (ease === 'linear') { prop.setInterpolationTypeAtKey(k, KI.LINEAR, KI.LINEAR); return; }
    if (ease === 'hold') { prop.setInterpolationTypeAtKey(k, KI.HOLD, KI.HOLD); return; }
    var iIn, iOut, linIn = false, linOut = false;
    if (ease === 'ease') { iIn = 33.33; iOut = 33.33; }
    else if (ease === 'easeIn') { iIn = 33.33; iOut = 33.33; linOut = true; }
    else if (ease === 'easeOut') { iIn = 33.33; iOut = 33.33; linIn = true; }
    else if (typeof ease === 'object') { iIn = clampInfluence(ease.influenceIn, 33.33); iOut = clampInfluence(ease.influenceOut, 33.33); }
    else MMG.fail('Unknown ease "' + ease + '". Use linear, ease, easeIn, easeOut, hold, or {influenceIn, influenceOut}.');

    var t = prop.propertyValueType, PV = PropertyValueType;
    var dims = (t === PV.TwoD_SPATIAL || t === PV.ThreeD_SPATIAL) ? 1 : (prop.value && prop.value.length ? prop.value.length : 1);
    function eases(infl, n) {
      var a = [];
      for (var i = 0; i < n; i++) a.push(new KeyframeEase(0, infl));
      return a;
    }
    try { prop.setTemporalEaseAtKey(k, eases(iIn, dims), eases(iOut, dims)); }
    catch (e) { prop.setTemporalEaseAtKey(k, eases(iIn, 1), eases(iOut, 1)); }
    prop.setInterpolationTypeAtKey(k, linIn ? KI.LINEAR : KI.BEZIER, linOut ? KI.LINEAR : KI.BEZIER);
  };

  A.keysInfo = function (prop) {
    var out = [];
    for (var k = 1; k <= prop.numKeys && k <= 50; k++) {
      var v;
      try { v = A.r(prop.keyValue(k)); } catch (e) { v = null; }
      out.push({ time: MMG.round(prop.keyTime(k)), value: v });
    }
    return out;
  };

  /** Readable value of a property (null when AE can't give one). */
  A.valueOf = function (prop) {
    try {
      var v = prop.value;
      if (v && typeof v === 'object' && v.text !== undefined) return v.text;
      return A.r(v);
    } catch (e) { return null; }
  };
})();
