// Panel entry: loads the ExtendScript host code, then starts the local HTTP bridge.
(function () {
  var PANEL_VERSION = '0.1.0';
  var cep = window.__adobe_cep__;
  var stateEl = document.getElementById('state');
  var logEl = document.getElementById('log');
  var lines = [];

  function log(msg) {
    var t = new Date().toTimeString().slice(0, 8);
    lines.unshift(t + '  ' + msg);
    if (lines.length > 40) lines.length = 40;
    logEl.textContent = lines.join('\n');
  }
  function setState(text, ok) {
    stateEl.textContent = text;
    stateEl.className = ok ? 'ok' : 'bad';
  }

  if (!cep || typeof require !== 'function') {
    setState('This panel must run inside After Effects or Premiere Pro.', false);
    return;
  }

  var env = JSON.parse(cep.getHostEnvironment());
  var isPremiere = env.appName === 'PPRO';
  var APP = isPremiere
    ? { name: 'Premiere Pro', port: 47822 }
    : { name: 'After Effects', port: 47821 };

  // Same logic as CSInterface.getSystemPath('extension').
  var root = decodeURI(cep.getSystemPath('extension'));
  root = navigator.platform.indexOf('Win') === 0 ? root.replace(/^file:\/{3}/, '') : root.replace(/^file:\/{2}/, '');

  function evalScript(code) {
    return new Promise(function (resolve) { cep.evalScript(code, resolve); });
  }

  function loadHost() {
    var file = JSON.stringify(root + '/host/main.jsx');
    return evalScript(
      'try{$.evalFile(new File(' + file + '));"ok"}catch(e){"ERR: "+e.message+" (line "+e.line+")"}'
    ).then(function (r) {
      if (r !== 'ok') throw new Error('Could not load the host scripts: ' + r);
      log('Host scripts loaded.');
    });
  }

  var bridge = require(root + '/js/bridge.js');

  loadHost()
    .then(function () {
      var server = bridge.start({
        port: APP.port,
        appName: APP.name,
        appVersion: env.appVersion,
        panelVersion: PANEL_VERSION,
        evalScript: evalScript,
        reloadHost: loadHost,
        log: log,
      });
      server.on('listening', function () {
        setState('Connected — ' + APP.name + ' on port ' + APP.port, true);
      });
      server.on('error', function (e) {
        setState(
          e.code === 'EADDRINUSE'
            ? 'Port ' + APP.port + ' is busy. Is another ' + APP.name + ' window or panel open? Close it and reopen this panel.'
            : 'Bridge error: ' + e.message,
          false
        );
      });
    })
    .catch(function (e) {
      setState(e.message, false);
    });
})();
