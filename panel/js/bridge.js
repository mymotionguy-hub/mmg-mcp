// Local HTTP bridge that runs inside the app's panel (CEP Node).
// POST /call {fn, args}  -> runs MMG.call(fn, argsJson) in ExtendScript, returns its JSON.
// GET  /ping             -> {ok, app, appVersion, panelVersion, port}
// Only listens on 127.0.0.1 and refuses browser requests, so web pages can't drive the app.
'use strict';
var http = require('http');

var MAX_BODY = 20 * 1024 * 1024;

/** Build the ExtendScript line for a call. Args travel as a JSON string literal. */
function toCall(fn, args) {
  var lit = JSON.stringify(JSON.stringify(args || {}))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return 'MMG.call(' + JSON.stringify(fn) + ',' + lit + ')';
}

function send(res, status, body) {
  var text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

function fail(res, status, message) {
  send(res, status, { ok: false, error: { message: message, kind: 'bridge' } });
}

function start(opts) {
  var log = opts.log || function () {};

  function run(fn, args, retried) {
    return opts.evalScript(toCall(fn, args)).then(function (result) {
      if (typeof result === 'string' && result.charAt(0) === '{') return result;
      // "EvalScript error." usually means the host scripts were unloaded: reload once and retry.
      if (!retried && opts.reloadHost) {
        log('Script engine reset, reloading host scripts…');
        return opts.reloadHost().then(function () { return run(fn, args, true); });
      }
      return JSON.stringify({
        ok: false,
        error: {
          message: 'The app could not run the script (' + String(result) + '). Close and reopen the MMG MCP panel.',
          kind: 'bridge',
        },
      });
    });
  }

  var server = http.createServer(function (req, res) {
    // Browsers always send Origin on cross-site requests; our server client never does.
    if (req.headers.origin) return fail(res, 403, 'Requests from web pages are not allowed.');

    var url = (req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/ping') {
      return send(res, 200, {
        ok: true,
        app: opts.appName,
        appVersion: opts.appVersion,
        panelVersion: opts.panelVersion,
        port: opts.port,
      });
    }
    if (req.method !== 'POST' || url !== '/call') return fail(res, 404, 'Not found.');
    if (String(req.headers['content-type'] || '').indexOf('application/json') !== 0) {
      return fail(res, 415, 'Content-Type must be application/json.');
    }

    var chunks = [];
    var size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { fail(res, 413, 'Request too large.'); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      if (size > MAX_BODY) return;
      var body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return fail(res, 400, 'Bad JSON.'); }
      if (!body || typeof body.fn !== 'string' || !/^[A-Za-z0-9_]+$/.test(body.fn)) {
        return fail(res, 400, 'Missing or bad "fn".');
      }
      var started = Date.now();
      run(body.fn, body.args, false).then(
        function (json) {
          var ok = json.indexOf('{"ok":true') === 0;
          log((ok ? 'ok   ' : 'FAIL ') + body.fn + ' (' + (Date.now() - started) + ' ms)');
          send(res, 200, json);
        },
        function (e) {
          log('FAIL ' + body.fn + ': ' + e.message);
          fail(res, 500, e.message);
        }
      );
    });
  });

  server.listen(opts.port, '127.0.0.1');
  return server;
}

module.exports = { start: start, toCall: toCall };
