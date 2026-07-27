// @license http://www.gnu.org/licenses/agpl-3.0.html AGPL-3.0
(function () {
    const configElement = document.getElementById('video_quality');
    const qualitySetting = configElement.getAttribute('data-value');
    function initializeHlsVideos(root) {
        if (Hls.isSupported()) {
            var videoSources = root.querySelectorAll("video source[type='application/vnd.apple.mpegurl']");
            videoSources.forEach(function (source) {
                var playlist = source.src;

                var oldVideo = source.parentNode;
                if (oldVideo.dataset.hlsInitialized === "true") {
                    return;
                }
                var autoplay = oldVideo.classList.contains("hls_autoplay");

                // If HLS is supported natively then don't use hls.js
                if (oldVideo.canPlayType(source.type) === "probably") {
                    oldVideo.dataset.hlsInitialized = "true";
                    if (autoplay) {
                        oldVideo.play();
                    }
                    return;
                }

                // Replace video with copy that will have all "source" elements removed
                var newVideo = oldVideo.cloneNode(true);
                var allSources = newVideo.querySelectorAll("source");
                allSources.forEach(function (source) {
                    source.remove();
                });

                // Empty source to enable play event
                newVideo.src = "about:blank";
                newVideo.dataset.hlsInitialized = "true";

                oldVideo.parentNode.replaceChild(newVideo, oldVideo);

                function getIndexOfDefault(length) {
                    switch (qualitySetting) {
                        case 'best':
                            return length - 1;
                        case 'medium':
                            return Math.floor(length / 2);
                        case 'worst':
                            return 0;
                        default:
                            return length - 1;
                    }
                }

                function initializeHls() {
                    newVideo.removeEventListener('play', initializeHls);
                    newVideo.removeEventListener('click', initializeHls);
                    var hls = new Hls({ autoStartLoad: false });
                    var preferredLevel = 0;
                    var recoveredInitialStall = false;
                    hls.loadSource(playlist);
                    hls.attachMedia(newVideo);
                    hls.on(Hls.Events.MANIFEST_PARSED, function () {
                        var defaultIndex = getIndexOfDefault(hls.levels.length);
                        preferredLevel = defaultIndex;
                        hls.autoLevelCapping = defaultIndex;
                        // A concrete start level ensures the first fragment is
                        // appended. With startLevel=-1, short Reddit CMAF videos
                        // can use fragment zero only as a bandwidth test and then
                        // buffer from fragment one, leaving playback stuck at 0.
                        hls.startLevel = defaultIndex;
                        var availableLevels = hls.levels.map(function(level) {
                            return {
                                height: level.height,
                                width: level.width,
                                bitrate: level.bitrate,
                            };
                        });

                        addQualitySelector(newVideo, hls, availableLevels);

                        hls.startLoad(0);
                        newVideo.play();
                    });

                    hls.on(Hls.Events.ERROR, function (event, data) {
                        var errorType = data.type;
                        var errorFatal = data.fatal;
                        if (
                            !errorFatal &&
                            data.details === "bufferStalledError" &&
                            !recoveredInitialStall &&
                            newVideo.currentTime < 0.1 &&
                            newVideo.readyState < 3
                        ) {
                            recoveredInitialStall = true;
                            hls.nextLevel = Math.max(0, preferredLevel - 1);
                            hls.startLoad(0);
                            newVideo.play();
                            return;
                        }
                        if (errorFatal) {
                            switch (errorType) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    hls.destroy();
                                    break;
                            }
                        }

                        console.error(
                            "HLS error",
                            data.type,
                            data.details,
                            "fatal=" + data.fatal,
                            data.response ? "status=" + data.response.code : "",
                            data.frag ? "fragment=" + data.frag.url : ""
                        );
                    });
                }

                function addQualitySelector(videoElement, hlsInstance, availableLevels) {
                    var qualitySelector = document.createElement('select');
                    qualitySelector.classList.add('quality-selector');
                    var defaultIndex = getIndexOfDefault(availableLevels.length);
                    availableLevels.forEach(function (level, index) {
                        var option = document.createElement('option');
                        option.value = index.toString();
                        var bitrate = (level.bitrate / 1_000).toFixed(0);
                        option.text = level.height + 'p (' + bitrate + ' kbps)';
                        if (index === defaultIndex) {
                            option.selected = "selected";
                        }
                        qualitySelector.appendChild(option);
                    });
                    qualitySelector.selectedIndex = defaultIndex;
                    qualitySelector.addEventListener('change', function () {
                        var selectedIndex = qualitySelector.selectedIndex;
                        hlsInstance.nextLevel = selectedIndex;
                        hlsInstance.startLoad();
                    });

                    videoElement.parentNode.appendChild(qualitySelector);
                }

                newVideo.addEventListener('play', initializeHls);
                // Chromium does not consistently emit a play event for the
                // about:blank placeholder. A direct click on the native
                // controls is a reliable signal that the user wants playback.
                newVideo.addEventListener('click', initializeHls);

                if (autoplay) {
                    initializeHls();
                }
            });
        } else {
            var videos = root.querySelectorAll("video.hls_autoplay");
            videos.forEach(function (video) {
                video.setAttribute("autoplay", "");
            });
        }
    }
    window.initializeHlsVideos = initializeHlsVideos;
    initializeHlsVideos(document);
})();
// @license-end
