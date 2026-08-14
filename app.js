"use strict";

const CONFIG =
  window.TANDIME_ONUS_CONFIG;

const EYE_MAP =
  window.TANDIME_ONUS_EYE_MAP;

if (!CONFIG) {
  throw new Error(
    "TANDIME-ONUS config missing."
  );
}

if (
  !Array.isArray(EYE_MAP) ||
  EYE_MAP.length === 0
) {
  throw new Error(
    "TANDIME-ONUS detected eye map is unavailable."
  );
}

if (
  !CONFIG.transport ||
  !CONFIG.transport.feedUrl
) {
  throw new Error(
    "TANDIME-ONUS direct transport missing."
  );
}

const runtime = {
  screens: new Map(),
  streamAssignments: new Map(),
  activeStreamIds: new Set(),
  pollTimer: null,
  hlsPlayers: new Map()
};

const byId = (id) =>
  document.getElementById(id);


/* ============================================================
   URL AUTHORITY
   ============================================================ */

function absolutePayloadUrl(value) {
  if (!value) return "";

  try {
    const origin =
      CONFIG.transport.payloadOrigin ||
      "https://ellistrip.com";

    const url =
      new URL(
        value,
        origin
      );

    if (
      url.origin !==
      new URL(origin).origin
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}


/* ============================================================
   STABLE STREAM -> EYE SCREEN ASSIGNMENT
   ============================================================ */

function stableHash(value) {
  let hash = 2166136261;

  const text =
    String(value || "");

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^= text.charCodeAt(index);

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return hash >>> 0;
}


function stableScreenForStream(streamId) {
  if (
    runtime.streamAssignments.has(
      streamId
    )
  ) {
    return runtime.streamAssignments.get(
      streamId
    );
  }

  const start =
    stableHash(streamId) %
    EYE_MAP.length;

  for (
    let offset = 0;
    offset < EYE_MAP.length;
    offset += 1
  ) {
    const screen =
      EYE_MAP[
        (start + offset) %
        EYE_MAP.length
      ];

    const occupied =
      Array.from(
        runtime.streamAssignments.values()
      ).includes(screen.screenId);

    if (!occupied) {
      runtime.streamAssignments.set(
        streamId,
        screen.screenId
      );

      return screen.screenId;
    }
  }

  return EYE_MAP[start].screenId;
}


/* ============================================================
   BUILD THE 165 ONUS EYE SCREENS
   ============================================================ */

function createScreen(screen) {
  const node =
    document.createElement("article");

  node.className =
    "live-screen empty";

  node.dataset.screenId =
    screen.screenId;

  node.dataset.group =
    screen.group;

  const corners =
    Array.isArray(screen.corners)
      ? screen.corners
      : [];

  if (corners.length !== 4) {
    throw new Error(
      "Screen " +
        screen.screenId +
        " does not have four corners."
    );
  }

  const xs =
    corners.map(
      (corner) => Number(corner.x)
    );

  const ys =
    corners.map(
      (corner) => Number(corner.y)
    );

  const minimumX =
    Math.min(...xs);

  const maximumX =
    Math.max(...xs);

  const minimumY =
    Math.min(...ys);

  const maximumY =
    Math.max(...ys);

  const width =
    maximumX - minimumX;

  const height =
    maximumY - minimumY;

  node.style.left =
    minimumX + "%";

  node.style.top =
    minimumY + "%";

  node.style.width =
    width + "%";

  node.style.height =
    height + "%";

  node.style.zIndex =
    String(screen.layer || 1);

  const polygon =
    corners
      .map((corner) => {
        const localX =
          ((Number(corner.x) - minimumX) /
            width) *
          100;

        const localY =
          ((Number(corner.y) - minimumY) /
            height) *
          100;

        return (
          localX.toFixed(5) +
          "% " +
          localY.toFixed(5) +
          "%"
        );
      })
      .join(",");

  node.style.clipPath =
    `polygon(${polygon})`;

  node.style.webkitClipPath =
    `polygon(${polygon})`;

  const id =
    document.createElement("span");

  id.className =
    "screen-id";

  id.textContent =
    screen.screenId;

  node.appendChild(id);

  node.addEventListener(
    "click",
    () => {
      showInspector(
        screen,
        node
      );
    }
  );

  runtime.screens.set(
    screen.screenId,
    {
      definition: screen,
      node,
      streamId: null,
      cargoId: null,
      liveType: null,
      playbackUrl: null
    }
  );

  return node;
}


function buildScreenMap() {
  const screenMap =
    byId("screenMap");

  const fragment =
    document.createDocumentFragment();

  for (const screen of EYE_MAP) {
    fragment.appendChild(
      createScreen(screen)
    );
  }

  screenMap.replaceChildren(fragment);

  byId("screenCount").textContent =
    String(EYE_MAP.length);
}


/* ============================================================
   SCREEN CLEANUP
   ============================================================ */

function destroyHlsForScreen(screenId) {
  const hls =
    runtime.hlsPlayers.get(screenId);

  if (hls) {
    try {
      hls.destroy();
    } catch {}

    runtime.hlsPlayers.delete(
      screenId
    );
  }
}


function clearScreen(screenId) {
  const record =
    runtime.screens.get(screenId);

  if (!record) return;

  destroyHlsForScreen(screenId);

  record.node
    .querySelectorAll(
      "video,img,.live-marker"
    )
    .forEach(
      (node) => {
        if (
          node.tagName === "VIDEO"
        ) {
          try {
            node.pause();
          } catch {}

          try {
            node.removeAttribute("src");
            node.load();
          } catch {}
        }

        node.remove();
      }
    );

  record.node.classList.remove(
    "occupied"
  );

  record.node.classList.add(
    "empty"
  );

  record.streamId = null;
  record.cargoId = null;
  record.liveType = null;
  record.playbackUrl = null;
}


function clearAllScreens() {
  for (
    const screenId of runtime.screens.keys()
  ) {
    clearScreen(screenId);
  }

  runtime.streamAssignments.clear();
  runtime.activeStreamIds.clear();

  updateCounts();
}


/* ============================================================
   LIVE MARKER
   ============================================================ */

function addLiveMarker(node) {
  const marker =
    document.createElement("span");

  marker.className =
    "live-marker";

  marker.textContent =
    "LIVE";

  node.appendChild(marker);
}


/* ============================================================
   HLS / VIDEO PLAYBACK
   ============================================================ */

function attachVideoSource(
  video,
  playbackUrl,
  screenId
) {
  destroyHlsForScreen(screenId);

  const lower =
    String(playbackUrl || "")
      .toLowerCase();

  const isHls =
    lower.includes(".m3u8");

  if (
    isHls &&
    window.Hls &&
    window.Hls.isSupported()
  ) {
    const hls =
      new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30
      });

    runtime.hlsPlayers.set(
      screenId,
      hls
    );

    hls.loadSource(
      playbackUrl
    );

    hls.attachMedia(
      video
    );

    hls.on(
      window.Hls.Events.MANIFEST_PARSED,
      () => {
        video.play().catch(() => {});
      }
    );

    hls.on(
      window.Hls.Events.ERROR,
      (
        event,
        data
      ) => {
        if (
          !data ||
          data.fatal !== true
        ) {
          return;
        }

        console.error(
          "TANDIME-ONUS HLS:",
          data
        );

        try {
          hls.destroy();
        } catch {}

        runtime.hlsPlayers.delete(
          screenId
        );
      }
    );

    return;
  }

  if (
    isHls &&
    video.canPlayType(
      "application/vnd.apple.mpegurl"
    )
  ) {
    video.src =
      playbackUrl;

    return;
  }

  video.src =
    playbackUrl;
}


function placeVideo({
  screenId,
  streamId,
  cargoId,
  liveType,
  playbackUrl
}) {
  const record =
    runtime.screens.get(screenId);

  if (!record) return;

  clearScreen(screenId);

  const video =
    document.createElement("video");

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = "metadata";

  attachVideoSource(
    video,
    playbackUrl,
    screenId
  );

  video.addEventListener(
    "canplay",
    () => {
      video.play().catch(() => {});
    }
  );

  record.node.prepend(video);

  addLiveMarker(
    record.node
  );

  record.node.classList.remove(
    "empty"
  );

  record.node.classList.add(
    "occupied"
  );

  record.streamId =
    streamId;

  record.cargoId =
    cargoId;

  record.liveType =
    liveType;

  record.playbackUrl =
    playbackUrl;
}


/* ============================================================
   IMAGE PAYLOAD SUPPORT
   ============================================================ */

function placeImage({
  screenId,
  streamId,
  cargoId,
  liveType,
  playbackUrl
}) {
  const record =
    runtime.screens.get(screenId);

  if (!record) return;

  clearScreen(screenId);

  const image =
    document.createElement("img");

  image.src =
    playbackUrl;

  image.alt =
    streamId ||
    cargoId ||
    "Live";

  record.node.prepend(image);

  addLiveMarker(
    record.node
  );

  record.node.classList.remove(
    "empty"
  );

  record.node.classList.add(
    "occupied"
  );

  record.streamId =
    streamId;

  record.cargoId =
    cargoId;

  record.liveType =
    liveType;

  record.playbackUrl =
    playbackUrl;
}


/* ============================================================
   DIRECT ONUS FEED NORMALIZATION
   ============================================================ */

function normalizedLiveType(item) {
  const source =
    String(
      item.liveType ||
      item.type ||
      item.status ||
      ""
    )
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

  if (
    source.includes(
      "PAST_PRESENT_A_LIVE"
    )
  ) {
    return "PAST_PRESENT_A_LIVE";
  }

  return "A_PRESENT_LIVE";
}


function extractFeedLives(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    payload &&
    Array.isArray(payload.lives)
  ) {
    return payload.lives;
  }

  if (
    payload &&
    Array.isArray(payload.items)
  ) {
    return payload.items;
  }

  if (
    payload &&
    Array.isArray(payload.streams)
  ) {
    return payload.streams;
  }

  if (
    payload &&
    Array.isArray(payload.screens)
  ) {
    return payload.screens;
  }

  if (
    payload &&
    payload.feed &&
    Array.isArray(payload.feed.lives)
  ) {
    return payload.feed.lives;
  }

  if (
    payload &&
    (
      payload.streamId ||
      payload.liveId ||
      payload.playbackHls ||
      payload.playbackUrl
    )
  ) {
    return [payload];
  }

  return [];
}


function normalizeDirectLive(
  item,
  index
) {
  const streamId =
    String(
      item.streamId ||
      item.liveId ||
      item.id ||
      item.sessionId ||
      `onus-live-${index}`
    );

  const rawUrl =
    item.playbackHls ||
    item.playbackUrl ||
    item.hls ||
    item.url ||
    item.src ||
    item.stream?.playbackHls ||
    item.stream?.playbackUrl ||
    "";

  const playbackUrl =
    absolutePayloadUrl(
      rawUrl
    );

  const payloadType =
    String(
      item.payloadType ||
      item.mime ||
      item.contentType ||
      (
        String(rawUrl)
          .toLowerCase()
          .includes(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : ""
      )
    ).toLowerCase();

  return {
    streamId,

    cargoId:
      item.cargoId ||
      item.liveId ||
      streamId,

    liveType:
      normalizedLiveType(item),

    playbackUrl,

    payloadType,

    raw:
      item
  };
}


function normalizeDirectFeed(
  payload
) {
  return extractFeedLives(payload)
    .map(
      (item, index) =>
        normalizeDirectLive(
          item,
          index
        )
    )
    .filter(
      (live) =>
        live.streamId &&
        live.playbackUrl
    );
}


/* ============================================================
   DIRECT FEED APPLICATION
   ============================================================ */

function sameScreenLive(
  record,
  live
) {
  return (
    record &&
    record.streamId ===
      live.streamId &&
    record.playbackUrl ===
      live.playbackUrl
  );
}


function removeEndedStreams(
  activeIds
) {
  for (
    const [
      screenId,
      record
    ] of runtime.screens
  ) {
    if (
      record.streamId &&
      !activeIds.has(
        record.streamId
      )
    ) {
      runtime.streamAssignments.delete(
        record.streamId
      );

      clearScreen(
        screenId
      );
    }
  }
}


function applyDirectFeed(
  payload
) {
  const lives =
    normalizeDirectFeed(
      payload
    );

  const activeIds =
    new Set(
      lives.map(
        (live) =>
          live.streamId
      )
    );

  removeEndedStreams(
    activeIds
  );

  for (const live of lives) {
    const screenId =
      stableScreenForStream(
        live.streamId
      );

    const record =
      runtime.screens.get(
        screenId
      );

    if (
      sameScreenLive(
        record,
        live
      )
    ) {
      record.liveType =
        live.liveType;

      continue;
    }

    if (
      live.payloadType.startsWith(
        "image/"
      )
    ) {
      placeImage({
        ...live,
        screenId
      });
    } else {
      placeVideo({
        ...live,
        screenId
      });
    }
  }

  runtime.activeStreamIds =
    activeIds;

  updateCounts();

  return lives.length;
}


/* ============================================================
   COUNTERS / RECEIVER STATE
   ============================================================ */

function updateCounts() {
  let occupied = 0;
  let present = 0;
  let pastPresent = 0;

  for (
    const record of runtime.screens.values()
  ) {
    if (!record.streamId) {
      continue;
    }

    occupied += 1;

    if (
      record.liveType ===
      "PAST_PRESENT_A_LIVE"
    ) {
      pastPresent += 1;
    } else {
      present += 1;
    }
  }

  const occupiedNode =
    byId("occupiedCount");

  const presentNode =
    byId("presentCount");

  const pastPresentNode =
    byId("pastPresentCount");

  if (occupiedNode) {
    occupiedNode.textContent =
      String(occupied);
  }

  if (presentNode) {
    presentNode.textContent =
      String(present);
  }

  if (pastPresentNode) {
    pastPresentNode.textContent =
      String(pastPresent);
  }
}


function setExitState(
  label,
  state
) {
  const target =
    byId("exitState");

  if (!target) return;

  target.textContent =
    label;

  target.dataset.state =
    state;
}


/* ============================================================
   DIRECT /api/tandime/onus POLLING
   ============================================================ */

async function pollOnusFeed() {
  try {
    const separator =
      CONFIG.transport.feedUrl.includes("?")
        ? "&"
        : "?";

    const response =
      await fetch(
        CONFIG.transport.feedUrl +
          separator +
          "t=" +
          Date.now(),
        {
          cache: "no-store",
          credentials: "omit",
          headers: {
            Accept:
              "application/json"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        "ONUS feed returned HTTP " +
          response.status
      );
    }

    const payload =
      await response.json();

    const liveCount =
      applyDirectFeed(
        payload
      );

    if (liveCount > 0) {
      setExitState(
        "ACTIVE",
        "active"
      );
    } else {
      setExitState(
        "WAITING",
        "waiting"
      );
    }

    console.log(
      "[TANDIME-ONUS DIRECT FEED]",
      {
        liveCount,
        feed:
          CONFIG.transport.feedUrl
      }
    );
  } catch (error) {
    console.error(
      "TANDIME-ONUS:",
      error
    );

    setExitState(
      "CONNECTION ERROR",
      "connection-error"
    );
  }
}


/* ============================================================
   SCREEN INSPECTOR
   ============================================================ */

function showInspector(
  definition,
  node
) {
  const record =
    runtime.screens.get(
      definition.screenId
    );

  const inspectId =
    byId("inspectId");

  const inspectGroup =
    byId("inspectGroup");

  const inspectRegion =
    byId("inspectRegion");

  const inspectPosition =
    byId("inspectPosition");

  const inspectRotation =
    byId("inspectRotation");

  const inspectStream =
    byId("inspectStream");

  const inspector =
    byId("screenInspector");

  if (inspectId) {
    inspectId.textContent =
      definition.screenId;
  }

  if (inspectGroup) {
    inspectGroup.textContent =
      definition.group;
  }

  if (inspectRegion) {
    inspectRegion.textContent =
      definition.region;
  }

  if (inspectPosition) {
    inspectPosition.textContent =
      Array.isArray(
        definition.corners
      )
        ? definition.corners
            .map(
              (corner) =>
                `${corner.x}%,${corner.y}%`
            )
            .join(" · ")
        : "UNKNOWN";
  }

  if (inspectRotation) {
    inspectRotation.textContent =
      "FOUR-CORNER PERSPECTIVE";
  }

  if (inspectStream) {
    inspectStream.textContent =
      record &&
      record.streamId
        ? record.streamId
        : "EMPTY";
  }

  if (inspector) {
    inspector.hidden = false;
  }
}


/* ============================================================
   START
   ============================================================ */

function start() {
  buildScreenMap();
  updateCounts();

  if (
    CONFIG.transport.enabled !== true
  ) {
    setExitState(
      "DISABLED",
      "waiting"
    );

    return;
  }

  pollOnusFeed();

  runtime.pollTimer =
    window.setInterval(
      pollOnusFeed,
      Number(
        CONFIG.transport.pollMilliseconds ||
        3000
      )
    );
}


const closeInspector =
  byId("closeInspector");

if (closeInspector) {
  closeInspector.addEventListener(
    "click",
    () => {
      const inspector =
        byId("screenInspector");

      if (inspector) {
        inspector.hidden = true;
      }
    }
  );
}


window.addEventListener(
  "DOMContentLoaded",
  start
);


window.addEventListener(
  "beforeunload",
  () => {
    if (runtime.pollTimer) {
      window.clearInterval(
        runtime.pollTimer
      );
    }

    for (
      const hls of runtime.hlsPlayers.values()
    ) {
      try {
        hls.destroy();
      } catch {}
    }

    runtime.hlsPlayers.clear();
  }
);
