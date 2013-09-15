window.addEventListener(
	"load",
	function(e) {
		smplayerview.init();
	},
	false
);

var smplayerview = {
	badPath: "SMPlayer could not be found at the location you specified.",
	notFound: "SMPlayer could not be found in the registry.",
	smplayerPath: "",
	smplayerParams: "",
	smplayerviewBundle: null,
	prefManager: null,
	log: function(aText) {
		var console = Components.classes["@mozilla.org/consoleservice;1"]
		                                 .getService(Components.interfaces.nsIConsoleService);
		console.logStringMessage("SMPlayer View: "+aText);
	},
	init: function(){ // sets up event listeners
		try {
			document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", function(){smplayerview.context();}, false); // call context() when the context menu is opened
		} catch (e) {
		}
	
		this.smplayerviewBundle = document.getElementById("smplayerview_strings");
	
		this.prefManager = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	
		// Get SMPlayer location from preferences
		this.unicodeConverter = Components
			.classes["@mozilla.org/intl/scriptableunicodeconverter"]
			.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		this.unicodeConverter.charset = "UTF-8";
		this.smplayerPath = this.unicodeConverter.ConvertToUnicode(this.prefManager.getCharPref("extensions.smplayerview.smplayerpath"));
		if (this.smplayerPath=="") {
			this.discover();
		}
	},
	parseSMPlayerPath: function() {
		// Post-process SMPlayer location
		var params = "";
		if (this.smplayerPath) {
			var i;
			if (this.smplayerPath.substr(0, 1)=='"') {
				// The string starts with a quote, thus
				// the second quote counts
				this.smplayerPath = this.smplayerPath.substr(1);
				i = this.smplayerPath.indexOf('"');
			} else {
				// The string does not start with a quote,
				// thus the first blank counts
				i = this.smplayerPath.indexOf(" ");
			}
	
			// Cut everything off after the filename
			if (i!=-1) {
				params = this.smplayerPath.substr(i+1);
				this.smplayerPath = this.smplayerPath.substring(0, i);
			}
		}
	
		// Pre-parse parameters
		this.smplayerParams = new Array();
		if (params!="") {
			var p;
			var q = /("(.*?)"|(\S+))/g;
			while (p = q.exec(params)) {
				if (p[1].length>0 && p[1][0]=='"') {
					p[1] = p[1].substr(1, p[1].length-2);
				}
				this.smplayerParams.push(p[1]);
			}
		}
	},
	launch: function (href){
		this.smplayerPath = this.unicodeConverter.ConvertToUnicode(this.prefManager.getCharPref("extensions.smplayerview.smplayerpath"));
		this.parseSMPlayerPath();
		
		// Workaround for the problem with YouTube HTTPS URLs
		// (i.e. for some reason they only work sometimes)
		if (href.indexOf("youtube.com") != -1){
			href = href.replace("https://", "http://");
		}
		
		this._launch(href);
	},
	_launch: function(href) {
		if (!this.smplayerPath) {
			alert(this.notFound);
			return;
		}
	
		var targetFile=Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
		targetFile.initWithPath(this.smplayerPath); // load path from pref into object
		if (!targetFile.exists()) {
			alert(this.smplayerviewBundle.getFormattedString("smplayerview.notexecutable", [this.smplayerPath]));
			return;
		}
		var process=Components.classes['@mozilla.org/process/util;1'].createInstance(Components.interfaces.nsIProcess);
		var params = new Array();
		for (var i=0; i<this.smplayerParams.length; i++) {
			// Add every parameter, replacing %1 by the URL
			params.push(this.smplayerParams[i].replace("%1", href));
		}
		if (params.length==0) {
			// No parameters added yet
			// Add URL
			params.push(href);
		}
		process.init(targetFile);
		process.run(false, params, params.length);
	},
	context: function(){ // control which context menu item is show
		document.getElementById("smplayerview-view-page").hidden = gContextMenu.isTextSelected||gContextMenu.onLink||gContextMenu.onImage||gContextMenu.onTextInput; // hide launch page if on highlighted text, link, image, or input field
		document.getElementById("smplayerview-view-link").hidden = !gContextMenu.onLink; // no link, no item
		if (gContextMenu.onLink) {
			var url = gContextMenu.getLinkURL();
			document.getElementById("smplayerview-view-link").disabled =
				url.indexOf("javascript:")==0
				|| url.indexOf("mailto:")==0;
		}
	},
	test: function(path) {
		this.init();
	
		var oldPath = this.smplayerPath;
		var oldParams = this.smplayerParams;
	
		this.smplayerPath = path;
		this.parseSMPlayerPath();
		this._launch("http://www.youtube.com/watch?v=oHg5SJYRHA0"); // RickRoll
	
		this.smplayerPath = oldPath;
		this.smplayerParams = oldParams;
	},
	discover: function() {
		// Get the path to SMPlayer from the registry
		var winhooks, winhooksAPI;
		if ("@mozilla.org/windows-registry-key;1" in Components.classes) {
			try {
				winhooks = Components.classes["@mozilla.org/windows-registry-key;1"].getService(Components.interfaces.nsIWindowsRegKey);
				winhooksAPI = 2;
			} catch(ex) {
				this.log("Unable to get windows-registry-key service!");
			}
		} else if ("@mozilla.org/winhooks;1" in Components.classes) {
			try {
				winhooks = Components.classes["@mozilla.org/winhooks;1"].getService(Components.interfaces.nsIWindowsRegistry);
				winhooksAPI = 1;
			} catch(ex) {
				this.log("Unable to get winhooks service!");
			}
		} else if ("@mozilla.org/browser/shell-service;1" in Components.classes) {
			try {
				winhooks = Components.classes["@mozilla.org/browser/shell-service;1"].getService(Components.interfaces.nsIWindowsShellService);
				winhooksAPI = 1;
			} catch(ex) {
				this.log("Unable to get browser shell service!");
			}
		} else {
			this.log("Unable to get Components. This only works on Windows!");
			return;
		}
		if (typeof(winhooks) == "undefined" || (winhooksAPI == 1 && typeof(winhooks.getRegistryEntry) != "function") || (winhooksAPI == 2 && typeof(winhooks.open) != "function")) {
			this.log("Registry functions aren't available. This only works on Windows!");
			return;
		}
		try {
			// 0: HKEY_CLASSES_ROOT = 0x80000000
			// 1: HKEY_CURRENT_CONFIG = 0x80000005
			// 2: HKEY_CURRENT_USER = 0x80000001
			// 3: HKEY_LOCAL_MACHINE = 0x80000002
			// 4: HKEY_USERS = 0x80000003
	
			var keys = new Array(
				{key: 0x80000000, path: "MPlayerFileVideo\\shell\\open\\command", name: "", append: ""},
				{key: 0x80000002, path: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SMPlayer", name: "DisplayIcon", append: ' "%1"'}
			);
			this.smplayerPath = false;
			for (var i=0; i<keys.length; i++) {
				this.log("Looking for SMPlayer in registry path "+keys[i].path);
				if (winhooksAPI == 1) {
					this.smplayerPath = winhooks.getRegistryEntry(keys[i].key, keys[i].path, keys[i].name);
				} else if (winhooksAPI == 2) {
					var regkey = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
					try {
						regkey.open(keys[i].key, keys[i].path, Components.interfaces.nsIWindowsRegKey.ACCESS_READ);
						if (regkey.valueCount) {
							try {
								this.smplayerPath = regkey.readStringValue(keys[i].name);
							} catch(ex) {
							}
						}
					} catch(ex) {
					}
				} else {
					alert("Unknown winhooksAPI version");
				}
				if (this.smplayerPath) {
					this.smplayerPath = this.smplayerPath+keys[i].append;
					break;
				}
			}
		} catch(ex) {
			this.smplayerPath = false;
		}
		if (this.smplayerPath) {
			this.log("Found SMPlayer there as "+this.smplayerPath);
			this.prefManager.setCharPref("extensions.smplayerview.smplayerpath", this.smplayerPath);
		} else {
			this.log("SMPlayer not found");
			alert(this.smplayerviewBundle.getFormattedString("smplayerview.notfound"));
		}
	},
	discoverButton: function() {
		this.discover();
		if (this.smplayerPath) {
			document.getElementById("smplayerview-smplayerpath").value = this.smplayerPath;
		}
	}
}