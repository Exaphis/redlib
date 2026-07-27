const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../static/playHLSVideo.js", `file://${__filename}`), "utf8");

const createVideoSource = () => {
	const replacement = {
		dataset: {},
		classList: { contains: () => false },
		currentTime: 0,
		readyState: 1,
		querySelectorAll: () => [{ remove() {} }],
		addEventListener() {},
		play() {},
	};
	const video = {
		dataset: {},
		classList: { contains: () => false },
		canPlayType: () => "",
		cloneNode: () => replacement,
		parentNode: {
			replaceChild(next, previous) {
				assert.equal(next, replacement);
				assert.equal(previous, video);
				this.replacement = next;
			},
		},
	};
	const mediaSource = {
		src: "https://v.redd.it/example/HLSPlaylist.m3u8",
		type: "application/vnd.apple.mpegurl",
		parentNode: video,
	};
	return { mediaSource, replacement, video };
};

test("initializes HLS videos added after the initial page scan", () => {
	const initial = createVideoSource();
	const appended = createVideoSource();
	const document = {
		getElementById: () => ({ getAttribute: () => "best" }),
		querySelectorAll: () => [initial.mediaSource],
		createElement: () => {
			throw new Error("quality selector should not be created before playback");
		},
	};
	const window = {};
	const Hls = class {
		static isSupported() {
			return true;
		}
	};
	const context = vm.createContext({ console, document, Hls, window });

	vm.runInContext(source, context);
	assert.equal(initial.video.parentNode.replacement, initial.replacement);
	assert.equal(initial.replacement.dataset.hlsInitialized, "true");

	window.initializeHlsVideos({
		querySelectorAll: () => [appended.mediaSource],
	});
	assert.equal(appended.video.parentNode.replacement, appended.replacement);
	assert.equal(appended.replacement.dataset.hlsInitialized, "true");
});

test("does not initialize a native HLS video twice", () => {
	let playCount = 0;
	const video = {
		dataset: {},
		classList: { contains: () => true },
		canPlayType: () => "probably",
		play: () => {
			playCount += 1;
		},
	};
	const mediaSource = {
		src: "https://v.redd.it/example/HLSPlaylist.m3u8",
		type: "application/vnd.apple.mpegurl",
		parentNode: video,
	};
	const document = {
		getElementById: () => ({ getAttribute: () => "best" }),
		querySelectorAll: () => [mediaSource],
	};
	const window = {};
	const Hls = class {
		static isSupported() {
			return true;
		}
	};

	vm.runInContext(source, vm.createContext({ console, document, Hls, window }));
	window.initializeHlsVideos(document);

	assert.equal(video.dataset.hlsInitialized, "true");
	assert.equal(playCount, 1);
});

test("starts HLS from a native-control click at the selected quality", () => {
	const listeners = {};
	const sequence = [];
	const replacementParent = {
		appendChild() {},
	};
	const replacement = {
		dataset: {},
		classList: { contains: () => false },
		currentTime: 0,
		readyState: 1,
		querySelectorAll: () => [{ remove() {} }],
		parentNode: replacementParent,
		addEventListener(name, handler) {
			listeners[name] = handler;
		},
		removeEventListener(name, handler) {
			if (listeners[name] === handler) delete listeners[name];
		},
		play() {
			sequence.push("play");
		},
	};
	const video = {
		dataset: {},
		classList: { contains: () => false },
		canPlayType: () => "",
		cloneNode: () => replacement,
		parentNode: {
			replaceChild() {},
		},
	};
	const mediaSource = {
		src: "https://v.redd.it/example/HLSPlaylist.m3u8",
		type: "application/vnd.apple.mpegurl",
		parentNode: video,
	};
	const document = {
		getElementById: () => ({ getAttribute: () => "best" }),
		querySelectorAll: () => [mediaSource],
		createElement: () => ({
			classList: { add() {} },
			appendChild() {},
			addEventListener() {},
		}),
	};
	const window = {};
	let hls;
	class Hls {
		static isSupported() {
			return true;
		}

		static Events = {
			MANIFEST_PARSED: "manifestParsed",
			ERROR: "error",
		};

		static ErrorTypes = {
			NETWORK_ERROR: "networkError",
			MEDIA_ERROR: "mediaError",
		};

		constructor(config) {
			assert.equal(config.autoStartLoad, false);
			this.handlers = {};
			this.levels = [
				{ height: 360, width: 640, bitrate: 500_000 },
				{ height: 720, width: 1280, bitrate: 1_500_000 },
			];
			hls = this;
		}

		loadSource(playlist) {
			assert.equal(playlist, mediaSource.src);
		}

		attachMedia(media) {
			assert.equal(media, replacement);
		}

		on(event, handler) {
			this.handlers[event] = handler;
		}

		set startLevel(level) {
			sequence.push(`startLevel:${level}`);
		}

		set autoLevelCapping(level) {
			sequence.push(`autoLevelCapping:${level}`);
		}

		get loadLevel() {
			return 1;
		}

		set nextLevel(level) {
			sequence.push(`nextLevel:${level}`);
		}

		startLoad(position) {
			sequence.push(`startLoad:${position}`);
		}
	}

	vm.runInContext(source, vm.createContext({ console, document, Hls, window }));
	listeners.click();
	hls.handlers[Hls.Events.MANIFEST_PARSED]();

	assert.deepEqual(sequence, ["autoLevelCapping:1", "startLevel:1", "startLoad:0", "play"]);

	hls.handlers[Hls.Events.ERROR](Hls.Events.ERROR, {
		type: Hls.ErrorTypes.MEDIA_ERROR,
		details: "bufferStalledError",
		fatal: false,
	});
	assert.deepEqual(sequence.slice(-3), ["nextLevel:0", "startLoad:0", "play"]);
});
