(() => {
	const expandoAnchors = new WeakMap();
	const hostDescriptors = new WeakMap();

	const showGallerySlide = (gallery, requestedIndex) => {
		const slides = [...gallery.querySelectorAll(":scope > .res-gallery-slide")];
		if (slides.length < 2) return;

		const index = Math.max(0, Math.min(requestedIndex, slides.length - 1));
		gallery.dataset.resGalleryIndex = String(index);

		for (const [slideIndex, slide] of slides.entries()) {
			slide.hidden = slideIndex !== index;
			slide.setAttribute("aria-hidden", String(slideIndex !== index));
		}

		const activeSlide = slides[index];
		const expando = gallery.closest(".res-expando");
		if (!expando || expando.open) {
			for (const media of activeSlide.querySelectorAll("[data-src]")) {
				media.src = media.dataset.src;
				media.removeAttribute("data-src");
			}
		}

		const previous = gallery.querySelector(".res-gallery-previous");
		const next = gallery.querySelector(".res-gallery-next");
		if (previous) previous.disabled = index === 0;
		if (next) next.disabled = index === slides.length - 1;

		const status = gallery.querySelector(".res-gallery-status");
		if (status) status.textContent = `${index + 1} / ${slides.length}`;
	};

	const initializeGalleries = (root = document) => {
		const galleries = [];
		if (root instanceof Element && root.matches(".gallery, .res-expando-gallery")) galleries.push(root);
		galleries.push(...root.querySelectorAll(".gallery, .res-expando-gallery"));

		for (const gallery of galleries) {
			if (gallery.dataset.resGalleryInitialized === "true") continue;
			const slides = [...gallery.querySelectorAll(":scope > figure")];
			if (slides.length < 2) continue;

			gallery.dataset.resGalleryInitialized = "true";
			gallery.classList.add("res-gallery");
			gallery.tabIndex = 0;
			gallery.setAttribute("role", "group");
			gallery.setAttribute("aria-label", `Image gallery, ${slides.length} images`);

			for (const [index, slide] of slides.entries()) {
				slide.classList.add("res-gallery-slide");
				slide.setAttribute("aria-label", `Image ${index + 1} of ${slides.length}`);
			}

			const controls = document.createElement("div");
			controls.className = "res-gallery-controls";

			const previous = document.createElement("button");
			previous.type = "button";
			previous.className = "res-gallery-button res-gallery-previous";
			previous.setAttribute("aria-label", "Previous image");
			previous.textContent = "‹ prev";

			const status = document.createElement("span");
			status.className = "res-gallery-status";
			status.setAttribute("role", "status");
			status.setAttribute("aria-live", "polite");
			status.setAttribute("aria-atomic", "true");

			const next = document.createElement("button");
			next.type = "button";
			next.className = "res-gallery-button res-gallery-next";
			next.setAttribute("aria-label", "Next image");
			next.textContent = "next ›";

			controls.append(previous, status, next);
			gallery.prepend(controls);
			showGallerySlide(gallery, 0);
		}
	};

	initializeGalleries();

	document.addEventListener("click", (event) => {
		const button = event.target.closest?.(".res-gallery-button");
		if (!button) return;
		const gallery = button.closest(".res-gallery");
		if (!gallery) return;

		const current = Number.parseInt(gallery.dataset.resGalleryIndex || "0", 10);
		showGallerySlide(gallery, current + (button.matches(".res-gallery-next") ? 1 : -1));
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const gallery = event.target.closest?.(".res-gallery");
		if (!gallery) return;

		const current = Number.parseInt(gallery.dataset.resGalleryIndex || "0", 10);
		showGallerySlide(gallery, current + (event.key === "ArrowRight" ? 1 : -1));
		event.preventDefault();
	});

	const createHostFrame = (descriptor) => {
		const frame = document.createElement("iframe");
		frame.className = "res-host-frame";
		frame.src = descriptor.src;
		frame.loading = "lazy";
		frame.title = `${descriptor.provider} embed`;
		frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture; web-share";
		frame.allowFullscreen = true;
		frame.referrerPolicy = "strict-origin-when-cross-origin";
		if (descriptor.aspectRatio) frame.style.aspectRatio = descriptor.aspectRatio;
		return frame;
	};

	const createHostImage = (descriptor) => {
		const link = document.createElement("a");
		link.href = descriptor.original || descriptor.src;
		link.target = "_blank";
		link.rel = "nofollow noreferrer";

		const img = document.createElement("img");
		img.src = descriptor.src;
		img.alt = descriptor.alt || `${descriptor.provider} image`;
		img.loading = "lazy";
		link.append(img);
		return link;
	};

	const showHostError = (content, descriptor, message = "This embed could not be loaded.") => {
		content.replaceChildren();
		const error = document.createElement("p");
		error.className = "res-host-error";
		error.append(`${message} `);

		const link = document.createElement("a");
		link.href = descriptor.original;
		link.target = "_blank";
		link.rel = "nofollow noreferrer";
		link.textContent = "Open the original link";
		error.append(link, ".");
		content.append(error);
	};

	const renderHostExpando = async (details) => {
		if (details.dataset.hostRendered === "true") return;
		const descriptor = hostDescriptors.get(details);
		const content = details.querySelector(".res-host-content");
		const panel = details.querySelector(".res-expando-host");
		if (!descriptor || !content || !panel) return;

		details.dataset.hostRendered = "true";
		content.classList.add("loading");
		content.textContent = `Loading ${descriptor.provider}…`;

		const isVideoPanel = descriptor.type === "video" || (descriptor.type === "iframe" && descriptor.aspectRatio);
		if (isVideoPanel) {
			panel.style.width = `${Math.min(descriptor.width || 480, 560)}px`;
			panel.style.height = `${Math.min(descriptor.height || 270, 270, Math.max(200, window.innerHeight * 0.45)) + 35}px`;
		} else {
			if (descriptor.width) panel.style.width = `${descriptor.width}px`;
			if (descriptor.height) panel.style.height = `${descriptor.height + 35}px`;
		}

		try {
			let media;
			switch (descriptor.type) {
				case "iframe":
					media = createHostFrame(descriptor);
					break;
				case "image":
					media = createHostImage(descriptor);
					break;
				case "video": {
					const video = document.createElement("video");
					video.src = descriptor.src;
					video.controls = true;
					video.preload = "metadata";
					video.autoplay = true;
					video.muted = true;
					video.playsInline = true;
					video.loop = descriptor.loop === true;
					if (descriptor.fallbackImage) {
						video.addEventListener(
							"error",
							() => {
								const fallback = createHostImage({ ...descriptor, type: "image", src: descriptor.fallbackImage });
								video.replaceWith(fallback);
							},
							{ once: true },
						);
					}
					media = video;
					break;
				}
				case "audio": {
					const audio = document.createElement("audio");
					audio.src = descriptor.src;
					audio.controls = true;
					audio.preload = "metadata";
					media = audio;
					break;
				}
				case "oembed-image": {
					const response = await fetch(descriptor.endpoint, {
						credentials: "same-origin",
						headers: { Accept: "application/json" },
					});
					if (!response.ok) throw new Error(`oEmbed returned HTTP ${response.status}`);
					const metadata = await response.json();
					const src = metadata.url || metadata.thumbnail_url;
					const parsed = new URL(src);
					if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid oEmbed media URL");
					media = createHostImage({
						...descriptor,
						src: parsed.href,
						alt: metadata.title,
					});
					break;
				}
				case "bluesky": {
					const endpoint = new URL("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle");
					endpoint.searchParams.set("handle", descriptor.handle);
					const response = await fetch(endpoint);
					if (!response.ok) throw new Error(`Bluesky returned HTTP ${response.status}`);
					const { did } = await response.json();
					if (!/^did:[a-z0-9:._%-]+$/i.test(did)) throw new Error("Invalid Bluesky DID");
					media = createHostFrame({
						...descriptor,
						src: `https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${encodeURIComponent(descriptor.post)}`,
						aspectRatio: null,
					});
					break;
				}
				default:
					throw new Error(`Unsupported host media type: ${descriptor.type}`);
			}

			content.classList.remove("loading");
			content.replaceChildren(media);
			if (media instanceof HTMLVideoElement) media.play().catch(() => {});
		} catch (error) {
			console.error(`Could not load ${descriptor.provider} expando`, error);
			content.classList.remove("loading");
			showHostError(content, descriptor);
		}
	};

	const initializeHostExpandos = (root = document) => {
		const candidates = [];
		if (root instanceof Element && root.matches(".res-host-expando")) candidates.push(root);
		candidates.push(...root.querySelectorAll(".res-host-expando[data-host-url]"));

		for (const details of candidates) {
			if (hostDescriptors.has(details)) continue;
			const descriptor = window.RESHostExpander?.resolve(details.dataset.hostUrl);
			if (!descriptor) {
				details.closest(".post")?.querySelector(".res-host-expando-toggle")?.remove();
				details.remove();
				continue;
			}

			hostDescriptors.set(details, descriptor);
			details.hidden = false;
			details.dataset.host = descriptor.provider.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
			const post = details.closest(".post");
			post?.classList.add("has_expando");

			const provider = details.querySelector(".res-host-provider");
			if (provider) provider.textContent = descriptor.provider;

			const summary = details.querySelector(":scope > summary");
			if (summary) {
				summary.title = `Expand ${descriptor.provider}`;
				summary.setAttribute("aria-label", `Expand ${descriptor.provider}`);
			}

			const toggle = post?.querySelector(".res-host-expando-toggle");
			if (toggle) {
				toggle.hidden = false;
				toggle.title = `Expand ${descriptor.provider}`;
				toggle.setAttribute("aria-label", `Expand ${descriptor.provider}`);
			}
		}
	};

	initializeHostExpandos();

	document.addEventListener("pointerdown", (event) => {
		const control = event.target.closest?.(".res-expando-toggle, .res-expando > summary");
		if (!control) return;
		const details = control.matches(".res-expando-toggle")
			? control.closest(".post")?.querySelector(".res-expando")
			: control.parentElement;
		if (!(details instanceof HTMLDetailsElement)) return;

		expandoAnchors.set(details, {
			control,
			top: control.getBoundingClientRect().top,
			expires: performance.now() + 1500,
		});
	});

	const pinExpando = (details) => {
		const anchor = expandoAnchors.get(details);
		if (!anchor || performance.now() > anchor.expires) return;

		const delta = anchor.control.getBoundingClientRect().top - anchor.top;
		if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
	};

	document.addEventListener("click", (event) => {
		const control = event.target.closest?.(".res-expando-toggle");
		if (!control) return;
		const details = control.closest(".post")?.querySelector(".res-expando");
		if (!(details instanceof HTMLDetailsElement)) return;

		details.open = !details.open;
	});

	const hydrateExpando = (details) => {
		for (const gallery of details.querySelectorAll(".res-expando-gallery.res-gallery")) {
			const current = Number.parseInt(gallery.dataset.resGalleryIndex || "0", 10);
			showGallerySlide(gallery, current);
		}

		for (const media of details.querySelectorAll("[data-src]")) {
			if (media.closest(".res-gallery-slide[hidden]")) continue;
			media.src = media.dataset.src;
			media.removeAttribute("data-src");
		}

		for (const video of details.querySelectorAll("video[data-poster]")) {
			video.poster = video.dataset.poster;
			video.removeAttribute("data-poster");
		}
	};

	const sizeExpando = (details) => {
		const frame = details.querySelector(".res-expando-single");
		const media = frame?.querySelector("img, video");
		if (!frame || !media || frame.dataset.sized === "true") return;

		const applySize = () => {
			const width = media.naturalWidth || media.videoWidth;
			const height = media.naturalHeight || media.videoHeight;
			if (!width || !height) return;

			const isVideo = media instanceof HTMLVideoElement;
			const maxWidth = Math.min(isVideo ? 480 : 900, document.documentElement.clientWidth - 100);
			const maxHeight = Math.max(isVideo ? 180 : 240, window.innerHeight * (isVideo ? 0.45 : 0.72));
			const scale = Math.min(1, maxWidth / width, maxHeight / height);
			frame.style.width = `${Math.max(180, Math.round(width * scale))}px`;
			frame.style.height = `${Math.max(120, Math.round(height * scale))}px`;
			frame.dataset.sized = "true";
			pinExpando(details);
		};

		if (media instanceof HTMLImageElement) {
			if (media.complete) applySize();
			else media.addEventListener("load", applySize, { once: true });
		} else {
			if (media.readyState >= 1) applySize();
			else media.addEventListener("loadedmetadata", applySize, { once: true });
		}
	};

	document.addEventListener(
		"toggle",
		(event) => {
			const details = event.target;
			if (!(details instanceof HTMLDetailsElement) || !details.matches(".res-expando")) return;

			const control = details.closest(".post")?.querySelector(".res-expando-toggle");
			control?.setAttribute("aria-expanded", String(details.open));

			if (details.open) {
				if (details.matches(".res-host-expando")) renderHostExpando(details);
				hydrateExpando(details);
				sizeExpando(details);
				for (const video of details.querySelectorAll("video")) {
					video.muted = true;
					video.autoplay = true;
					video.playsInline = true;
					video.play().catch(() => {});
				}
			} else {
				for (const video of details.querySelectorAll("video")) video.pause();
			}
			pinExpando(details);
			requestAnimationFrame(() => pinExpando(details));
		},
		true,
	);

	let resizeState = null;

	document.addEventListener("pointerdown", (event) => {
		const handle = event.target.closest?.(".res-resize-handle");
		if (!handle) return;

		const frame = handle.closest(".res-expando-content");
		if (!frame) return;

		const rect = frame.getBoundingClientRect();
		resizeState = {
			frame,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startWidth: rect.width,
			startHeight: rect.height,
		};
		handle.setPointerCapture?.(event.pointerId);
		event.preventDefault();
	});

	document.addEventListener("pointermove", (event) => {
		if (!resizeState || event.pointerId !== resizeState.pointerId) return;

		const left = resizeState.frame.getBoundingClientRect().left;
		const maxWidth = Math.min(900, document.documentElement.clientWidth - left - 8);
		const maxHeight = Math.max(120, window.innerHeight * 0.8);
		const width = Math.min(maxWidth, Math.max(180, resizeState.startWidth + event.clientX - resizeState.startX));
		const height = Math.min(maxHeight, Math.max(120, resizeState.startHeight + event.clientY - resizeState.startY));

		resizeState.frame.style.width = `${width}px`;
		resizeState.frame.style.height = `${height}px`;
		event.preventDefault();
	});

	const stopResizing = (event) => {
		if (!resizeState || (event.pointerId !== undefined && event.pointerId !== resizeState.pointerId)) return;
		resizeState = null;
	};

	document.addEventListener("pointerup", stopResizing);
	document.addEventListener("pointercancel", stopResizing);

	const posts = document.querySelector("#posts");
	const column = document.querySelector("#column_one");
	const footer = column?.querySelector(":scope > footer");
	let nextLink = footer?.querySelector('a[accesskey="N"]');
	if (!column || !footer || !nextLink) return;

	document.body.classList.add("res-infinite-enabled");

	const status = document.createElement("div");
	status.id = "res-infinite-status";
	status.setAttribute("role", "status");
	status.textContent = "Scroll for the next page";
	footer.before(status);

	let loading = false;
	let page = 1;

	const listingItems = (doc) => {
		const nextPosts = doc.querySelector("#posts");
		if (posts && nextPosts) return [...nextPosts.children].filter((node) => node.matches(".post, .comment"));
		return [...doc.querySelectorAll("#column_one > .post, #column_one > .comment")];
	};

	const loadNextPage = async () => {
		if (loading || !nextLink) return;
		loading = true;
		status.classList.add("loading");
		status.textContent = `Loading page ${page + 1}…`;

		let nextUrl = new URL(nextLink.getAttribute("href"), window.location.href);

		try {
			const visitedUrls = new Set();
			while (nextUrl) {
				const pageUrl = nextUrl.href;
				if (visitedUrls.has(pageUrl)) throw new Error("Pagination returned a repeated URL");
				visitedUrls.add(pageUrl);
				status.textContent = `Loading page ${page + 1}…`;

				const response = await fetch(nextUrl, {
					credentials: "same-origin",
					headers: { Accept: "text/html" },
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);

				const doc = new DOMParser().parseFromString(await response.text(), "text/html");
				const items = listingItems(doc);
				const remoteNext = doc.querySelector('#column_one > footer a[accesskey="N"]');
				const followingUrl = remoteNext ? new URL(remoteNext.getAttribute("href"), nextUrl) : null;
				page += 1;

				if (items.length > 0) {
					const divider = document.createElement("div");
					divider.className = "res-page-divider";
					divider.innerHTML = `<span>page ${page}</span><a href="${nextUrl}">permalink</a>`;

					const insertionPoint = posts ? null : footer;
					const target = posts || column;
					target.insertBefore(divider, insertionPoint);

					const knownIds = new Set([...document.querySelectorAll("#posts > [id], #column_one > [id]")].map((node) => node.id));
					for (const item of items) {
						if (item.id && knownIds.has(item.id)) continue;
						const importedItem = document.importNode(item, true);
						target.insertBefore(importedItem, insertionPoint);
						initializeHostExpandos(importedItem);
						initializeGalleries(importedItem);
						window.initializeHlsVideos?.(importedItem);
						if (item.id) knownIds.add(item.id);
					}
				}

				if (!followingUrl) {
					nextLink = null;
					observer.disconnect();
					status.classList.add("finished");
					status.textContent = "End of listing";
					break;
				}

				nextLink.href = followingUrl;
				if (items.length > 0) {
					status.textContent = "Scroll for the next page";
					break;
				}
				nextUrl = followingUrl;
			}
		} catch (error) {
			observer.disconnect();
			status.classList.add("failed");
			status.innerHTML = `Could not load the next page. <a href="${nextUrl}">Continue manually</a>`;
		} finally {
			loading = false;
			status.classList.remove("loading");
		}
	};

	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
		},
		{ rootMargin: "600px 0px" },
	);

	observer.observe(status);
})();
