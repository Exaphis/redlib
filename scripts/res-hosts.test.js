const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(new URL("../static/res-hosts.js", `file://${__filename}`), "utf8");
const window = {
	location: new URL("http://127.0.0.1:8080/r/videos"),
};
const context = vm.createContext({
	URL,
	URLSearchParams,
	window,
});
vm.runInContext(source, context);

const { resolve, supportedHosts } = window.RESHostExpander;

const resolves = (name, href, provider, type, check) => {
	test(name, () => {
		const result = resolve(href);
		assert.ok(result, `${href} should resolve`);
		assert.equal(result.provider, provider);
		assert.equal(result.type, type);
		if (check) check(result);
	});
};

test("publishes the pared-down host list", () => {
	assert.equal(supportedHosts.length, 25);
	assert.ok(supportedHosts.includes("YouTube"));
	assert.ok(supportedHosts.includes("Tumblr"));
});

resolves("direct image", "https://cdn.example/image.avif?size=large", "Direct image", "image");
resolves("direct video", "https://cdn.example/video.webm", "Direct video", "video");
resolves("direct audio", "https://cdn.example/audio.flac", "Direct audio", "audio");

resolves("YouTube watch URL with timestamp", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m2s", "YouTube", "iframe", (result) => {
	const embed = new URL(result.src);
	assert.equal(embed.pathname, "/embed/dQw4w9WgXcQ");
	assert.equal(embed.searchParams.get("start"), "62");
	assert.equal(embed.searchParams.get("autoplay"), "1");
	assert.equal(embed.searchParams.get("mute"), "1");
});
resolves("YouTube short URL", "https://youtu.be/dQw4w9WgXcQ", "YouTube", "iframe");
resolves("YouTube playlist", "https://www.youtube.com/playlist?list=PL123", "YouTube", "iframe", (result) => {
	assert.equal(new URL(result.src).searchParams.get("list"), "PL123");
});

resolves("Imgur direct image", "https://i.imgur.com/abcde.png", "Imgur", "image");
resolves("Imgur gifv", "https://imgur.com/abcde.gifv", "Imgur", "video", (result) => {
	assert.equal(result.src, "https://i.imgur.com/abcde.mp4");
});
resolves("Imgur album", "https://imgur.com/a/abcde", "Imgur", "iframe");
resolves("Redgifs", "https://www.redgifs.com/watch/FancySlug", "Redgifs", "iframe", (result) => {
	assert.equal(new URL(result.src).searchParams.get("autoplay"), "1");
});
resolves("Streamable", "https://streamable.com/abcd1", "Streamable", "iframe", (result) => {
	assert.equal(new URL(result.src).searchParams.get("autoplay"), "1");
});

resolves("Twitch channel", "https://www.twitch.tv/twitch", "Twitch", "iframe", (result) => {
	const embed = new URL(result.src);
	assert.equal(embed.searchParams.get("parent"), "127.0.0.1");
	assert.equal(embed.searchParams.get("autoplay"), "true");
	assert.equal(embed.searchParams.get("muted"), "true");
});
resolves("Twitch clip", "https://clips.twitch.tv/FancyClip", "Twitch Clips", "iframe");
resolves("Vimeo", "https://vimeo.com/channels/staffpicks/123456", "Vimeo", "iframe");
resolves("Dailymotion", "https://www.dailymotion.com/video/x123ab", "Dailymotion", "iframe");
resolves("Dailymotion short URL", "https://dai.ly/x123ab", "Dailymotion", "iframe");
resolves("Giphy", "https://giphy.com/gifs/reaction-cat-AbC123", "Giphy", "iframe");
resolves("Tenor", "https://tenor.com/view/example-gif-16622901", "Tenor", "iframe");
resolves("GIFs.com", "https://gifs.com/gif/example-AbC123", "GIFs.com", "iframe");
resolves("Coub", "https://coub.com/view/abc123", "Coub", "iframe");
resolves("Gyazo", "https://gyazo.com/ce10ba8a66472d0cdc31947124eed92c", "Gyazo", "video");
resolves("Flickr page", "https://www.flickr.com/photos/bees/2341623661/", "Flickr", "oembed-image");
resolves("Flickr CDN image", "https://live.staticflickr.com/3123/example.jpg", "Flickr", "image");
resolves("PeerTube", "https://framatube.org/videos/watch/123e4567-e89b-12d3-a456-426614174000", "PeerTube", "iframe");
resolves("Pornhub", "https://www.pornhub.com/view_video.php?viewkey=ph123", "Pornhub", "iframe");
resolves("Instagram", "https://www.instagram.com/reel/AbCdEf12345/", "Instagram", "iframe");
resolves("Twitter/X", "https://x.com/example/status/1234567890", "Twitter/X", "iframe");
resolves("Bluesky", "https://bsky.app/profile/bsky.app/post/3mizb7z3cg22p", "Bluesky", "bluesky");
resolves("SoundCloud", "https://soundcloud.com/example/track", "SoundCloud", "iframe");
resolves("Spotify", "https://open.spotify.com/track/0123456789AbCd", "Spotify", "iframe");
resolves("Tumblr subdomain", "https://example.tumblr.com/post/123456789/title", "Tumblr", "iframe");
resolves("Tumblr canonical URL", "https://www.tumblr.com/example/123456789/title", "Tumblr", "iframe");

test("does not create a generic iframe fallback", () => {
	assert.equal(resolve("https://example.com/article"), null);
	assert.equal(resolve("javascript:alert(1)"), null);
});
