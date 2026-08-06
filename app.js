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

const runtime = {
  screens: new Map(),
  streamAssignments: new Map(),
  activeCargoId: null,
  lastLeaseIdentity: null,
  pollTimer: null
};

const byId = (id) =>
  document.getElementById(id);

function absolutePayloadUrl(value) {
  if (!value) return "";

  try {
    const url =
      new URL(
        value,
        CONFIG.exit.payloadOrigin
      );

    if (
      url.origin !==
      new URL(
        CONFIG.exit.payloadOrigin
      ).origin
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

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
      liveType: null
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

function clearScreen(screenId) {
  const record =
    runtime.screens.get(screenId);

  if (!record) return;

  record.node
    .querySelectorAll(
      "video,img,.live-marker"
    )
    .forEach(
      (node) => node.remove()
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
}

function clearAllScreens() {
  for (
    const screenId of runtime.screens.keys()
  ) {
    clearScreen(screenId);
  }

  runtime.streamAssignments.clear();
  runtime.activeCargoId = null;

  updateCounts();
}

function addLiveMarker(node) {
  const marker =
    document.createElement("span");

  marker.className =
    "live-marker";

  marker.textContent =
    "LIVE";

  node.appendChild(marker);
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
  video.src = playbackUrl;

  video.addEventListener(
    "canplay",
    () => {
      video.play().catch(() => {});
    }
  );

  record.node.prepend(video);
  addLiveMarker(record.node);

  record.node.classList.remove(
    "empty"
  );

  record.node.classList.add(
    "occupied"
  );

  record.streamId = streamId;
  record.cargoId = cargoId;
  record.liveType = liveType;
}

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
    streamId || cargoId || "Cargo";

  record.node.prepend(image);
  addLiveMarker(record.node);

  record.node.classList.remove(
    "empty"
  );

  record.node.classList.add(
    "occupied"
  );

  record.streamId = streamId;
  record.cargoId = cargoId;
  record.liveType = liveType;
}

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

function normalizeCargoPayload(
  payload,
  lease
) {
  const candidates =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload.lives)
        ? payload.lives
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.screens)
            ? payload.screens
            : payload.streamId ||
                payload.playbackUrl ||
                payload.playbackHls
              ? [payload]
              : [];

  return candidates
    .map((item, index) => {
      const streamId =
        String(
          item.streamId ||
          item.id ||
          item.liveId ||
          `${lease.cargoId}-${index}`
        );

      const rawUrl =
        item.playbackHls ||
        item.playbackUrl ||
        item.url ||
        item.src ||
        "";

      return {
        streamId,
        cargoId:
          item.cargoId ||
          lease.cargoId ||
          "",
        liveType:
          normalizedLiveType(item),
        playbackUrl:
          absolutePayloadUrl(rawUrl),
        payloadType:
          String(
            item.payloadType ||
            item.mime ||
            lease.payloadType ||
            ""
          ).toLowerCase()
      };
    })
    .filter(
      (item) =>
        item.streamId &&
        item.playbackUrl
    );
}

async function readJsonPayload(
  payloadUrl
) {
  const response =
    await fetch(
      payloadUrl +
        (payloadUrl.includes("?")
          ? "&"
          : "?") +
        "t=" +
        Date.now(),
      {
        cache: "no-store",
        credentials: "omit"
      }
    );

  if (!response.ok) {
    throw new Error(
      "Cargo payload returned HTTP " +
        response.status
    );
  }

  return response.json();
}

async function applyLease(lease) {
  const payloadUrl =
    absolutePayloadUrl(
      lease.payloadUrl
    );

  if (!payloadUrl) {
    throw new Error(
      "Exit 11 returned an invalid payload URL."
    );
  }

  const payloadType =
    String(
      lease.payloadType || ""
    ).toLowerCase();

  runtime.activeCargoId =
    lease.cargoId || null;

  if (
    payloadType.includes("json")
  ) {
    const payload =
      await readJsonPayload(
        payloadUrl
      );

    const lives =
      normalizeCargoPayload(
        payload,
        lease
      );

    clearAllScreens();

    for (const live of lives) {
      const screenId =
        stableScreenForStream(
          live.streamId
        );

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

    updateCounts();
    return;
  }

  const screenId =
    stableScreenForStream(
      lease.cargoId ||
      payloadUrl
    );

  if (
    payloadType.startsWith(
      "image/"
    )
  ) {
    placeImage({
      screenId,
      streamId:
        lease.cargoId,
      cargoId:
        lease.cargoId,
      liveType:
        "A_PRESENT_LIVE",
      playbackUrl:
        payloadUrl
    });
  } else if (
    payloadType.startsWith(
      "video/"
    )
  ) {
    placeVideo({
      screenId,
      streamId:
        lease.cargoId,
      cargoId:
        lease.cargoId,
      liveType:
        "A_PRESENT_LIVE",
      playbackUrl:
        payloadUrl
    });
  }

  updateCounts();
}

function updateCounts() {
  let occupied = 0;
  let present = 0;
  let pastPresent = 0;

  for (
    const record of runtime.screens.values()
  ) {
    if (!record.streamId) continue;

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

  byId("occupiedCount").textContent =
    String(occupied);

  byId("presentCount").textContent =
    String(present);

  byId(
    "pastPresentCount"
  ).textContent =
    String(pastPresent);
}

function setExitState(
  label,
  state
) {
  const target =
    byId("exitState");

  target.textContent =
    label;

  target.dataset.state =
    state;
}

async function pollExit11() {
  try {
    const response =
      await fetch(
        CONFIG.exit.leaseUrl +
          "?t=" +
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
        "Exit 11 returned HTTP " +
          response.status
      );
    }

    const lease =
      await response.json();

    if (
      !lease ||
      lease.active !== true
    ) {
      setExitState(
        "WAITING",
        "waiting"
      );

      if (runtime.activeCargoId) {
        clearAllScreens();
      }

      runtime.lastLeaseIdentity =
        null;

      return;
    }

    setExitState(
      "ACTIVE",
      "active"
    );

    const identity = [
      lease.cargoId || "",
      lease.payloadUrl || "",
      lease.expiresAt || ""
    ].join("|");

    if (
      identity !==
      runtime.lastLeaseIdentity
    ) {
      runtime.lastLeaseIdentity =
        identity;

      await applyLease(lease);
    }
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

function showInspector(
  definition,
  node
) {
  const record =
    runtime.screens.get(
      definition.screenId
    );

  byId("inspectId").textContent =
    definition.screenId;

  byId("inspectGroup").textContent =
    definition.group;

  byId("inspectRegion").textContent =
    definition.region;

  byId(
    "inspectPosition"
  ).textContent =
    Array.isArray(definition.corners)
      ? definition.corners
          .map(
            (corner) =>
              `${corner.x}%,${corner.y}%`
          )
          .join(" · ")
      : "UNKNOWN";

  byId(
    "inspectRotation"
  ).textContent =
    "FOUR-CORNER PERSPECTIVE";

  byId("inspectStream").textContent =
    record &&
    record.streamId
      ? record.streamId
      : "EMPTY";

  byId(
    "screenInspector"
  ).hidden = false;
}

function start() {
  buildScreenMap();
  updateCounts();
  pollExit11();

  runtime.pollTimer =
    window.setInterval(
      pollExit11,
      CONFIG.exit.pollMilliseconds
    );
}

byId(
  "closeInspector"
).addEventListener(
  "click",
  () => {
    byId(
      "screenInspector"
    ).hidden = true;
  }
);

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
  }
);
