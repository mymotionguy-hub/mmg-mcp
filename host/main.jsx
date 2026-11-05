// Entry for the ExtendScript side. The panel runs: $.evalFile(".../host/main.jsx")
// Loads host/lib/*.jsx, then host/ae/*.jsx or host/ppro/*.jsx depending on the app.
// ES3 only: no let/const, arrow functions, template strings or native JSON.
$.global.MMG = $.global.MMG || {};

(function () {
  var hostDir = File($.fileName).parent;

  function loadFolder(name) {
    var folder = new Folder(hostDir.fsName + '/' + name);
    if (!folder.exists) return;
    var files = folder.getFiles('*.jsx');
    files.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    for (var i = 0; i < files.length; i++) $.evalFile(files[i]);
  }

  // lib files load in a fixed order: json first, then core, then finders.
  $.evalFile(new File(hostDir.fsName + '/lib/json.jsx'));
  $.evalFile(new File(hostDir.fsName + '/lib/core.jsx'));
  $.evalFile(new File(hostDir.fsName + '/lib/find.jsx'));
  $.evalFile(new File(hostDir.fsName + '/lib/ae-props.jsx'));

  if (BridgeTalk.appName === 'aftereffects') loadFolder('ae');
  else if (BridgeTalk.appName === 'premierepro') loadFolder('ppro');
})();
