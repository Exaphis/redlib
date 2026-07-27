/*
 * Host URL matching and embed transformations are adapted from the
 * Reddit Enhancement Suite host modules:
 * https://github.com/honestbleeps/Reddit-Enhancement-Suite/tree/master/lib/modules/hosts
 * RES is licensed under GPL-3.0.
 */
(() => {
	"use strict";

	const supportedHosts = Object.freeze([
		"Direct images",
		"Direct video",
		"Direct audio",
		"YouTube",
		"Imgur",
		"Redgifs",
		"Streamable",
		"Twitch",
		"Twitch Clips",
		"Vimeo",
		"Dailymotion",
		"Giphy",
		"Tenor",
		"GIFs.com",
		"Coub",
		"Gyazo",
		"Flickr",
		"PeerTube",
		"Pornhub",
		"Instagram",
		"Twitter/X",
		"Bluesky",
		"SoundCloud",
		"Spotify",
		"Tumblr",
	]);

	const peerTubeDomains = new Set([
		"peervideo.net",
		"peertube.social",
		"peertube.mastodon.host",
		"evertron.tv",
		"mplayer.demouliere.eu",
		"cloud.allplayer.tk",
		"video.tedomum.net",
		"peertube.fr",
		"hostyour.tv",
		"videobit.cc",
		"videoshare.cc",
		"peertube.openstreetmap.fr",
		"video.ploud.fr",
		"tube.kdy.ch",
		"lostpod.space",
		"pe.ertu.be",
		"peertube.live",
		"peer.tube",
		"watching.cypherpunk.observer",
		"queertube.org",
		"exode.me",
		"framatube.org",
	]);

	const hostMatches = (hostname, domain) => hostname === domain || hostname.endsWith(`.${domain}`);
	const pathParts = (url) => url.pathname.split("/").filter(Boolean);
	const firstMatch = (value, pattern) => value.match(pattern)?.[1] || null;

	const iframe = (provider, src, options = {}) => ({
		provider,
		type: "iframe",
		src,
		aspectRatio: "16 / 9",
		height: 405,
		...options,
	});

	const image = (provider, src, options = {}) => ({ provider, type: "image", src, ...options });
	const video = (provider, src, options = {}) => ({ provider, type: "video", src, ...options });
	const audio = (provider, src, options = {}) => ({
		provider,
		type: "audio",
		src,
		height: 80,
		width: 700,
		...options,
	});

	const directMedia = (url) => {
		const extension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
		if (["webp", "gif", "jpg", "jpeg", "png", "svg", "avif", "bmp"].includes(extension)) {
			return image("Direct image", url.href);
		}
		if (["webm", "mp4", "ogv", "3gp", "mkv", "mov", "m4v"].includes(extension)) {
			return video("Direct video", url.href);
		}
		if (["opus", "weba", "ogg", "wav", "mp3", "flac", "m4a", "aac"].includes(extension)) {
			return audio("Direct audio", url.href);
		}
		return null;
	};

	const parseTime = (value) => {
		if (!value) return null;
		if (/^\d+$/.test(value)) return Number.parseInt(value, 10);

		const units = { h: 3600, m: 60, s: 1 };
		const segments = value.match(/\d+[hms]/gi);
		if (!segments) return null;
		return segments.reduce(
			(total, segment) => total + Number.parseInt(segment, 10) * units[segment.slice(-1).toLowerCase()],
			0,
		);
	};

	const resolveYouTube = (url) => {
		if (
			!hostMatches(url.hostname, "youtube.com")
			&& !hostMatches(url.hostname, "youtube-nocookie.com")
			&& !hostMatches(url.hostname, "youtu.be")
		) {
			return null;
		}

		const parts = pathParts(url);
		const list = url.searchParams.get("list");
		let id = hostMatches(url.hostname, "youtu.be") ? parts[0] : url.searchParams.get("v");
		let liveChannel = null;

		if (!id && ["shorts", "embed", "v", "live"].includes(parts[0])) id = parts[1];
		if (!id && parts[0] === "channel" && parts[2] === "live") liveChannel = parts[1];

		let embedUrl;
		if (id) {
			embedUrl = new URL(`https://www.youtube.com/embed/${id}`);
		} else if (liveChannel) {
			embedUrl = new URL("https://www.youtube.com/embed/live_stream");
			embedUrl.searchParams.set("channel", liveChannel);
		} else if (list) {
			embedUrl = new URL("https://www.youtube.com/embed/videoseries");
		} else {
			return null;
		}

		embedUrl.searchParams.set("rel", "0");
		embedUrl.searchParams.set("autoplay", "1");
		embedUrl.searchParams.set("mute", "1");
		embedUrl.searchParams.set("playsinline", "1");
		if (list) embedUrl.searchParams.set("list", list);

		const start = parseTime(url.searchParams.get("t") || url.searchParams.get("start"));
		if (start !== null) embedUrl.searchParams.set("start", String(start));
		const end = url.searchParams.get("end");
		if (end) embedUrl.searchParams.set("end", end);

		return iframe("YouTube", embedUrl.href);
	};

	const resolveImgur = (url) => {
		if (!hostMatches(url.hostname, "imgur.com")) return null;
		if (["/rules", "/inbox", "/random", "/removalrequest"].includes(url.pathname.replace(/\/$/, ""))) return null;

		const parts = pathParts(url);
		const id = parts.at(-1)?.match(/^([a-z0-9]{5,})(?:\.[a-z0-9]+)?$/i)?.[1];
		if (!id) return null;

		const extension = url.pathname.match(/\.(jpe?g|png|gif|gifv|webm|mp4)$/i)?.[1]?.toLowerCase();
		if (extension === "gifv") return video("Imgur", `https://i.imgur.com/${id}.mp4`, { loop: true, muted: true });
		if (["webm", "mp4"].includes(extension)) return video("Imgur", url.href, { loop: true });
		if (extension) return image("Imgur", url.href);

		const route = ["a", "gallery"].includes(parts[0]) ? `${parts[0]}/${id}` : id;
		return iframe("Imgur", `https://imgur.com/${route}/embed`, { height: 550, aspectRatio: null });
	};

	const resolveRedgifs = (url) => {
		if (!hostMatches(url.hostname, "redgifs.com")) return null;
		const id = firstMatch(url.pathname, /^\/(?:ifr|watch)\/([\w-]+)/i);
		return id ? iframe("Redgifs", `https://redgifs.com/ifr/${id}?autoplay=1&muted=1`, { height: 540 }) : null;
	};

	const resolveStreamable = (url) => {
		if (!hostMatches(url.hostname, "streamable.com")) return null;
		const id = firstMatch(url.pathname, /^\/(?:[es]\/)?(\w+)(?:\/|$)/i);
		return id ? iframe("Streamable", `https://streamable.com/e/${id}?autoplay=1&muted=1`, { height: 315 }) : null;
	};

	const resolveTwitch = (url) => {
		if (!hostMatches(url.hostname, "twitch.tv")) return null;
		const parts = pathParts(url);
		const clip = url.hostname === "clips.twitch.tv"
			? firstMatch(url.pathname, /^\/([\w-]+)(?:\/|$)/)
			: firstMatch(url.pathname, /^\/\w+\/clip\/([\w-]+)(?:\/|$)/);

		if (clip) {
			const embed = new URL("https://clips.twitch.tv/embed");
			embed.searchParams.set("clip", clip);
			embed.searchParams.set("parent", window.location.hostname);
			embed.searchParams.set("autoplay", "true");
			embed.searchParams.set("muted", "true");
			return iframe("Twitch Clips", embed.href);
		}

		let target = null;
		if (parts[0] === "videos" && parts[1]) target = `video=v${parts[1]}`;
		else if (parts[1] && /^[bcv]$/.test(parts[1]) && parts[2]) target = `video=${parts[1].replace("b", "a")}${parts[2]}`;
		else if (parts[0] && !["directory", "downloads", "jobs", "p", "settings", "subscriptions"].includes(parts[0])) {
			target = `channel=${parts[0]}`;
		}
		if (!target) return null;

		const embed = new URL("https://player.twitch.tv/");
		const [key, value] = target.split("=");
		embed.searchParams.set(key, value);
		embed.searchParams.set("parent", window.location.hostname);
		embed.searchParams.set("autoplay", "true");
		embed.searchParams.set("muted", "true");
		const time = url.searchParams.get("t");
		if (time) embed.searchParams.set("time", time);
		return iframe("Twitch", embed.href);
	};

	const resolveVimeo = (url) => {
		if (!hostMatches(url.hostname, "vimeo.com")) return null;
		const id = pathParts(url).find((part) => /^\d+$/.test(part));
		return id ? iframe("Vimeo", `https://player.vimeo.com/video/${id}?autoplay=1&muted=1`) : null;
	};

	const resolveDailymotion = (url) => {
		if (!hostMatches(url.hostname, "dailymotion.com") && !hostMatches(url.hostname, "dai.ly")) return null;
		const id = hostMatches(url.hostname, "dai.ly")
			? pathParts(url)[0]
			: firstMatch(url.pathname, /(?:^|\/)(?:video|embed\/video)\/([a-z0-9]+)/i);
		return id ? iframe("Dailymotion", `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=1`) : null;
	};

	const resolveGiphy = (url) => {
		if (!hostMatches(url.hostname, "giphy.com")) return null;
		const parts = pathParts(url);
		let id = null;
		if (parts[0] === "media") id = parts[1];
		else if (["gifs", "clips", "embed"].includes(parts[0])) id = parts.at(-1)?.split("-").at(-1);
		else if (parts.length === 1) id = parts[0].split("-").at(-1);
		return id ? iframe("Giphy", `https://giphy.com/embed/${id}`, { height: 480 }) : null;
	};

	const decodeTenorShortId = (value) => {
		const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let result = 0;
		for (const character of value) {
			const position = alphabet.indexOf(character);
			if (position === -1) return null;
			result = result * alphabet.length + position;
		}
		return result;
	};

	const resolveTenor = (url) => {
		if (!hostMatches(url.hostname, "tenor.com") && !hostMatches(url.hostname, "tenor.co")) return null;
		if (url.hostname.startsWith("media.") || url.hostname === "c.tenor.com") {
			return image("Tenor", url.href);
		}

		let id = firstMatch(url.pathname, /^\/view\/.+-(\d+)(?:\.gif)?\/?$/i);
		if (!id && hostMatches(url.hostname, "tenor.co")) {
			const shortId = firstMatch(url.pathname, /^\/([a-z0-9]+)\.gif$/i);
			if (shortId) id = String(decodeTenorShortId(shortId));
		}
		return id ? iframe("Tenor", `https://tenor.com/embed/${id}`, { height: 500 }) : null;
	};

	const resolveGifsCom = (url) => {
		if (!["gifs.com", "gifyoutube.com", "gifyt.com"].some((domain) => hostMatches(url.hostname, domain))) return null;
		const parts = pathParts(url);
		let id = null;
		if (["gif", "embed"].includes(parts[0])) id = parts[1]?.split("-").at(-1);
		else if (url.hostname.startsWith("share.")) id = parts[0]?.replace(/\.(?:gif|mp4|webm)$/i, "");
		return id ? iframe("GIFs.com", `https://gifs.com/embed/${id}`) : null;
	};

	const resolveCoub = (url) => {
		if (!hostMatches(url.hostname, "coub.com")) return null;
		const match = url.pathname.match(/^\/(?:view|embed)\/([\w-]+)(\.gifv)?/i);
		if (!match) return null;
		const src = match[2]
			? `https://coub.com/view/${match[1]}.gifv?res=true`
			: `https://coub.com/embed/${match[1]}?autoplay=true&muted=true&res=true`;
		return iframe("Coub", src);
	};

	const resolveGyazo = (url) => {
		if (!hostMatches(url.hostname, "gyazo.com")) return null;
		const id = firstMatch(url.pathname, /^\/([a-f0-9]{32})(?:\/|$)/i);
		return id
			? video("Gyazo", `https://i.gyazo.com/${id}.mp4`, {
				fallbackImage: `https://i.gyazo.com/${id}.png`,
				loop: true,
				muted: true,
			})
			: null;
	};

	const resolveFlickr = (url) => {
		if (!["flickr.com", "flic.kr", "staticflickr.com"].some((domain) => hostMatches(url.hostname, domain))) return null;
		if (hostMatches(url.hostname, "staticflickr.com")) return image("Flickr", url.href);
		return {
			provider: "Flickr",
			type: "oembed-image",
			endpoint: `/res-oembed/flickr?format=json&url=${encodeURIComponent(url.href)}`,
		};
	};

	const resolvePeerTube = (url) => {
		const match = url.pathname.match(/^\/(?:videos\/(?:watch|embed)\/|w\/)([\w-]+)(?:\/|$)/i);
		if (!match) return null;
		if (!peerTubeDomains.has(url.hostname) && !/^\/videos\/(?:watch|embed)\//i.test(url.pathname)) return null;
		return iframe("PeerTube", `${url.origin}/videos/embed/${match[1]}?autoplay=1&muted=1`);
	};

	const resolvePornhub = (url) => {
		if (!hostMatches(url.hostname, "pornhub.com") && !hostMatches(url.hostname, "pornhubpremium.com")) return null;
		const key = url.searchParams.get("viewkey") || firstMatch(url.pathname, /^\/embed\/([\w-]+)/i);
		return key ? iframe("Pornhub", `https://www.pornhub.com/embed/${key}?autoplay=1&mute=1`) : null;
	};

	const resolveInstagram = (url) => {
		if (!hostMatches(url.hostname, "instagram.com") && !hostMatches(url.hostname, "instagr.am")) return null;
		const id = firstMatch(url.pathname, /^\/(?:p|reel|reels|tv)\/([\w-]+)/i);
		return id
			? iframe("Instagram", `https://www.instagram.com/p/${id}/embed/captioned/`, {
				aspectRatio: null,
				height: 700,
				width: 600,
			})
			: null;
	};

	const resolveTwitter = (url) => {
		if (!hostMatches(url.hostname, "twitter.com") && !hostMatches(url.hostname, "x.com")) return null;
		const id = firstMatch(url.pathname, /^\/(?:#!\/)?[^/]+\/status(?:es)?\/(\d+)/i);
		return id
			? iframe("Twitter/X", `https://platform.twitter.com/embed/Tweet.html?id=${id}`, {
				aspectRatio: null,
				height: 650,
				width: 550,
			})
			: null;
	};

	const resolveBluesky = (url) => {
		if (!hostMatches(url.hostname, "bsky.app")) return null;
		const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([\w-]+)(?:\/|$)/i);
		return match
			? {
				provider: "Bluesky",
				type: "bluesky",
				handle: match[1],
				post: match[2],
				height: 500,
				width: 600,
			}
			: null;
	};

	const resolveSoundCloud = (url) => hostMatches(url.hostname, "soundcloud.com")
		? iframe("SoundCloud", `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}`, {
			aspectRatio: null,
			height: 166,
			width: 700,
		})
		: null;

	const resolveSpotify = (url) => {
		if (!hostMatches(url.hostname, "spotify.com")) return null;
		const match = url.pathname.match(
			/^\/(?:embed\/)?((?:track|artist|album|playlist|show|episode|user\/[^/]+\/playlist)\/[\w]+)(?:\/|$)/i,
		);
		return match
			? iframe("Spotify", `https://open.spotify.com/embed/${match[1]}`, {
				aspectRatio: null,
				height: 352,
				width: 700,
			})
			: null;
	};

	const resolveTumblr = (url) => {
		if (!hostMatches(url.hostname, "tumblr.com")) return null;
		const parts = pathParts(url);
		let blog;
		let id;
		if (["www", "at"].includes(url.hostname.split(".")[0]) && parts.length >= 2 && /^\d+$/.test(parts[1])) {
			[blog, id] = parts;
		} else {
			blog = url.hostname.split(".")[0];
			id = firstMatch(url.pathname, /^\/(?:post|image)\/(\d+)(?:\/|$)/i);
		}
		if (!blog || !id) return null;
		return iframe("Tumblr", `https://${blog}.tumblr.com/post/${id}/embed`, {
			aspectRatio: null,
			height: 650,
			width: 700,
		});
	};

	const resolvers = [
		resolveYouTube,
		resolveImgur,
		resolveRedgifs,
		resolveStreamable,
		resolveTwitch,
		resolveVimeo,
		resolveDailymotion,
		resolveGiphy,
		resolveTenor,
		resolveGifsCom,
		resolveCoub,
		resolveGyazo,
		resolveFlickr,
		resolvePeerTube,
		resolvePornhub,
		resolveInstagram,
		resolveTwitter,
		resolveBluesky,
		resolveSoundCloud,
		resolveSpotify,
		resolveTumblr,
	];

	const resolve = (href) => {
		let url;
		try {
			url = new URL(href, window.location.href);
		} catch {
			return null;
		}
		if (!["http:", "https:"].includes(url.protocol)) return null;

		for (const resolver of resolvers) {
			const result = resolver(url);
			if (result) return { ...result, original: url.href };
		}

		const direct = directMedia(url);
		if (direct) return { ...direct, original: url.href };
		return null;
	};

	window.RESHostExpander = Object.freeze({
		supportedHosts,
		resolve,
	});
})();
