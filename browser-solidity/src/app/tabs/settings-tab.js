/* global Option, Worker */
var $ = require('jquery')
var yo = require('yo-yo')
var QueryParams = require('../../lib/query-params')
var remixLib = require('remix-lib')
var Storage = remixLib.Storage
var styleGuide = remixLib.ui.themeChooser

// -------------- styling ----------------------
var csjs = require('csjs-inject')
var styles = styleGuide.chooser()
var helper = require('../../lib/helper')
var modal = require('../ui/modal-dialog-custom')

var css = csjs`
  .settingsTabView {
    padding: 2%;
    display: flex;
  }
  .info {
    ${styles.rightPanel.settingsTab.box_SolidityVersionInfo}
    margin-bottom: 2em;
    word-break: break-word;
  }
  .crow {
    display: flex;
    overflow: auto;
    clear: both;
    padding: .5em;
    font-weight: bold;
  }
  .crow label {
    cursor:pointer;
  }
  .crowNoFlex {
    overflow: auto;
    clear: both;
    padding: .5em;
    font-weight: bold;
  }
  .select {
    ${styles.rightPanel.settingsTab.dropdown_SelectCompiler}
  }
  .heading {
    margin-bottom: 0;
  }
  .explaination {
    margin-top: 3px;
    margin-bottom: 3px;
  }
  input {
    margin-right: 5px;
    cursor: pointer;
  }
  input[type=radio] {
    margin-top: 2px;
  }
  .pluginTextArea {
    font-family: unset;
    margin-top: 5px;
  }
  .pluginLoad {
    vertical-align: top;
  }
  i.warnIt {
    color: ${styles.appProperties.warningText_Color};
  }
}
`
module.exports = SettingsTab

function SettingsTab (container, appAPI, appEvents, opts) {
  if (typeof container === 'string') container = document.querySelector(container)
  if (!container) throw new Error('no container given')

  var queryParams = new QueryParams()

  var optionVM = yo`<input id="alwaysUseVM" type="checkbox">`
  var el = yo`
    <div class="${css.settingsTabView} "id="settingsView">
      <div class="${css.info}">
        <div>Your current Solidity version is</div>
        <div id="version"></div>
      </div>
      <div class="${css.crow}">
        <select class="${css.select}" id="versionSelector"></select>
      </div>
      <div class="${css.crow}">
        <div><input id="editorWrap" type="checkbox"></div>
        <span class="${css.checkboxText}">Text Wrap</span>
      </div>
      <div class="${css.crow}">
        <div>${optionVM}</div>
        <span class="${css.checkboxText}">Always use VM at Load</span>
      </div>
      <div class="${css.crow}">
        <div><input id="optimize" type="checkbox"></div>
        <span class="${css.checkboxText}">Enable Optimization</span>
      </div>
      <hr>
      <h4 class="${css.heading}">Themes ( Selecting a theme will trigger a page reload )</h4>
      <div class="${css.crow}">
        <input class="${css.col1}" name="theme" id="themeLight" type="radio">
        <label for="themeLight">Light Theme</label>
      </div>
      <div class="${css.crow}">
        <input class="${css.col1}" name="theme" id="themeDark" type="radio">
        <label for="themeDark">Dark Theme</label>
      </div>
      <hr>
      <div class="${css.crowNoFlex}">
        <div>Plugin ( <i title="Do not use this feature yet" class="${css.warnIt} fa fa-exclamation-triangle" aria-hidden="true"></i><span> Do not use this alpha feature if you are not sure what you are doing!</span> )
        </div>
        <div>
          <textarea rows="4" cols="70" id="plugininput" type="text" class="${css.pluginTextArea}" ></textarea>
          <br />
          <input onclick=${loadPlugin} type="button" value="Load" class="${css.pluginLoad}">
        </div>
      </div>
    </div>
  `

  function loadPlugin () {
    var json = el.querySelector('#plugininput').value
    try {
      json = JSON.parse(json)
    } catch (e) {
      modal.alert('cannot parse the plugin definition to JSON')
      return
    }
    appEvents.rhp.trigger('plugin-loadRequest', [json])
  }

  appEvents.compiler.register('compilerLoaded', (version) => {
    setVersionText(version, el)
  })

  optionVM.checked = appAPI.config.get('settings/always-use-vm') || false
  optionVM.addEventListener('change', event => {
    appAPI.config.set('settings/always-use-vm', !appAPI.config.get('settings/always-use-vm'))
  })

  var optimize = el.querySelector('#optimize')
  if ((queryParams.get().optimize === 'true')) {
    optimize.setAttribute('checked', true)
    appAPI.setOptimize(true, false)
  } else {
    queryParams.update({ optimize: false })
    appAPI.setOptimize(false, false)
  }

  optimize.addEventListener('change', function () {
    var optimize = this.checked
    queryParams.update({ optimize: optimize })
    appAPI.setOptimize(optimize, true)
  })

  var themeStorage = new Storage('style:')
  var currTheme = themeStorage.get('theme')
  var themeDark = el.querySelector('#themeDark')
  var themeLight = el.querySelector('#themeLight')

  if (currTheme === 'dark') {
    themeDark.setAttribute('checked', 'checked')
  } else {
    themeLight.setAttribute('checked', 'checked')
  }

  themeDark.addEventListener('change', function () {
    console.log('change dark theme')
    styleGuide.switchTheme('dark')
    window.location.reload()
  })

  themeLight.addEventListener('change', function () {
    console.log('change to light theme')
    styleGuide.switchTheme('light')
    window.location.reload()
  })

  // ----------------- version selector-------------

  // clear and disable the version selector
  var versionSelector = el.querySelector('#versionSelector')
  versionSelector.innerHTML = ''
  versionSelector.setAttribute('disabled', true)

  // load the new version upon change
  versionSelector.addEventListener('change', function () {
    loadVersion(versionSelector.value, queryParams, appAPI, el)
  })

  var header = new Option('Select new compiler version')
  header.disabled = true
  header.selected = true
  versionSelector.appendChild(header)

  $.getJSON('https://ethereum.github.io/solc-bin/bin/list.json').done(function (data) {
    // populate version dropdown with all available compiler versions (descending order)
    $.each(data.builds.slice().reverse(), function (i, build) {
      versionSelector.appendChild(new Option(build.longVersion, build.path))
    })

    versionSelector.removeAttribute('disabled')

    // always include the local version
    versionSelector.appendChild(new Option('latest local version', 'builtin'))

    // find latest release
    var selectedVersion = data.releases[data.latestRelease]

    // override with the requested version
    if (queryParams.get().version) {
      selectedVersion = queryParams.get().version
    }

    loadVersion(selectedVersion, queryParams, appAPI, el)
  }).fail(function (xhr, text, err) {
    // loading failed for some reason, fall back to local compiler
    versionSelector.append(new Option('latest local version', 'builtin'))

    loadVersion('builtin', queryParams, appAPI, el)
  })

  container.appendChild(el)
  return el
}

function setVersionText (text, el) {
  el.querySelector('#version').innerText = text
}

function loadVersion (version, queryParams, appAPI, el) {
  queryParams.update({ version: version })
  var url
  if (version === 'builtin') {
    var location = window.document.location
    location = location.protocol + '//' + location.host + '/' + location.pathname
    if (location.endsWith('index.html')) {
      location = location.substring(0, location.length - 10)
    }
    if (!location.endsWith('/')) {
      location += '/'
    }

    url = location + 'soljson.js'
  } else {
    if (version.indexOf('soljson') !== 0 || helper.checkSpecialChars(version)) {
      console.log('loading ' + version + ' not allowed')
      return
    }
    url = 'https://ethereum.github.io/solc-bin/bin/' + version
  }
  var isFirefox = typeof InstallTrigger !== 'undefined'
  if (document.location.protocol !== 'file:' && Worker !== undefined && isFirefox) {
    // Workers cannot load js on "file:"-URLs and we get a
    // "Uncaught RangeError: Maximum call stack size exceeded" error on Chromium,
    // resort to non-worker version in that case.
    appAPI.loadCompiler(true, url)
    setVersionText('(loading using worker)', el)
  } else {
    appAPI.loadCompiler(false, url)
    setVersionText('(loading)', el)
  }
}
