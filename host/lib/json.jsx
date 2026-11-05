// Small JSON for ExtendScript (ES3 has no native JSON). Exposed as MMG.JSON.
$.global.MMG = $.global.MMG || {};

MMG.JSON = (function () {
  var meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
  var escRx = /[\\"\u0000-\u001f\u007f\u2028\u2029]/g;

  function quote(s) {
    return '"' + s.replace(escRx, function (c) {
      var m = meta[c];
      return typeof m === 'string' ? m : '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
  }

  function str(v) {
    var t = typeof v, i, parts, k, s;
    if (v === null) return 'null';
    if (t === 'undefined' || t === 'function') return undefined;
    if (t === 'string') return quote(v);
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (Object.prototype.toString.call(v) === '[object Array]') {
      parts = [];
      for (i = 0; i < v.length; i++) {
        s = str(v[i]);
        parts.push(s === undefined ? 'null' : s);
      }
      return '[' + parts.join(',') + ']';
    }
    parts = [];
    for (k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      s = str(v[k]);
      if (s !== undefined) parts.push(quote(String(k)) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }

  // Validation from json2.js: only eval text that is plain JSON.
  var rxOne = /^[\],:{}\s]*$/;
  var rxTwo = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
  var rxThree = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
  var rxFour = /(?:^|:|,)(?:\s*\[)+/g;

  function parse(text) {
    text = String(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    if (rxOne.test(text.replace(rxTwo, '@').replace(rxThree, ']').replace(rxFour, ''))) {
      return eval('(' + text + ')');
    }
    throw new Error('Bad JSON input.');
  }

  return { stringify: str, parse: parse };
})();
