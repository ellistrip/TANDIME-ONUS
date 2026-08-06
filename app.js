/*
==========================================================
TANDIME-ONUS
Public receiver for TANDIME Cloud Exit 11.

This browser never receives or stores the private admin token.
It reads only the public lease and temporary payload routes.
==========================================================
*/

"use strict";

const CONFIG = window.TANDIME_ONUS_CONFIG;

if (!CONFIG) {
  throw new Error(
    "TANDIME-ONUS configuration was not loaded."
  );
}

const receiverState = {
  connected: false,
  active: false,
  cargoId: null,
  payloadType: null,
  payloadUrl: null,
  openedAt: null,
  expiresAt: null,
  trace: null,
  pollTimer: null,
  countdownTimer: null,
  lastPayloadIdentity: null
};

function element(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const target = element(id);

  if (target) {
    target.textContent = String(value);
  }
}

function setReceiverState(value) {
  const target = element("exitState");

  if (!target) return;

  target.textContent = value;
  target.dataset.state =
    String(value).toLowerCase().replace(/\s+/g, "-");
}

function absoluteEllistripUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "";
  }

  try {
    const resolved = new URL(
      value,
      CONFIG.exit.payloadOrigin
    );

    if (
      resolved.origin !==
      new URL(CONFIG.exit.payloadOrigin).origin
    ) {
      return "";
    }

    return resolved.toString();
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "NO ACTIVE LEASE";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatRemainingTime(expiresAt) {
  if (!expiresAt) return "NO ACTIVE LEASE";

  const expiration = Date.parse(expiresAt);

  if (!Number.isFinite(expiration)) {
    return "UNKNOWN";
  }

  const remaining =
    Math.max(0, expiration - Date.now());

  const totalSeconds =
    Math.floor(remaining / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

function updateCountdown() {
  setText(
    "leaseCountdown",
    formatRemainingTime(
      receiverState.expiresAt
    )
  );
}

function beginCountdown() {
  if (receiverState.countdownTimer) {
    window.clearInterval(
      receiverState.countdownTimer
    );
  }

  updateCountdown();

  receiverState.countdownTimer =
    window.setInterval(
      updateCountdown,
      1000
    );
}

function stopCountdown() {
  if (receiverState.countdownTimer) {
    window.clearInterval(
      receiverState.countdownTimer
    );

    receiverState.countdownTimer = null;
  }

  setText(
    "leaseCountdown",
    "NO ACTIVE LEASE"
  );
}

function clearStage() {
  const stage = element("payloadStage");

  if (!stage) return;

  stage.replaceChildren();

  stage.classList.remove("has-cargo");

  const waiting = document.createElement("div");

  waiting.className = "waiting-message";

  waiting.innerHTML = `
    <span>EXIT 11</span>
    <strong>WAITING FOR TRANSPORTED CARGO</strong>
    <p>
      The screens remain empty until WEB11 opens
      the external TANDIME exit.
    </p>
  `;

  stage.appendChild(waiting);
}

function renderImage(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const image = document.createElement("img");

  image.className = "transported-payload";
  image.alt =
    "TANDIME transported cargo " +
    (cargoId || "");

  image.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  image.addEventListener("load", () => {
    stage.classList.add("has-cargo");
  });

  image.addEventListener("error", () => {
    renderUnsupportedPayload(
      "PAYLOAD COULD NOT BE DISPLAYED"
    );
  });

  stage.replaceChildren(image);
}

function renderVideo(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const video = document.createElement("video");

  video.className = "transported-payload";
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  video.setAttribute(
    "aria-label",
    "TANDIME transported cargo " +
      (cargoId || "")
  );

  video.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  video.addEventListener(
    "loadeddata",
    () => {
      stage.classList.add("has-cargo");

      video.play().catch(() => {});
    }
  );

  video.addEventListener("error", () => {
    renderUnsupportedPayload(
      "VIDEO PAYLOAD COULD NOT BE DISPLAYED"
    );
  });

  stage.replaceChildren(video);
}

function renderAudio(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const shell = document.createElement("div");

  shell.className = "audio-payload";

  const label = document.createElement("strong");

  label.textContent =
    cargoId || "TRANSPORTED AUDIO";

  const audio = document.createElement("audio");

  audio.controls = true;
  audio.autoplay = true;
  audio.preload = "auto";

  audio.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  shell.append(label, audio);

  stage.replaceChildren(shell);
  stage.classList.add("has-cargo");
}

function renderJson(payloadUrl) {
  const stage = element("payloadStage");

  if (!stage) return;

  fetch(payloadUrl, {
    method: "GET",
    cache: "no-store"
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          "Payload request failed: " +
            response.status
        );
      }

      return response.json();
    })
    .then((payload) => {
      const output =
        document.createElement("pre");

      output.className = "json-payload";

      output.textContent =
        JSON.stringify(
          payload,
          null,
          2
        );

      stage.replaceChildren(output);
      stage.classList.add("has-cargo");
    })
    .catch((error) => {
      console.error(
        "TANDIME JSON payload:",
        error
      );

      renderUnsupportedPayload(
        "JSON PAYLOAD COULD NOT BE READ"
      );
    });
}

function renderUnsupportedPayload(message) {
  const stage = element("payloadStage");

  if (!stage) return;

  const notice = document.createElement("div");

  notice.className = "unsupported-payload";

  notice.innerHTML = `
    <span>CARGO ARRIVED</span>
    <strong>${message}</strong>
    <p>
      The lease is active, but this version of
      TANDIME-ONUS does not yet render this payload type.
    </p>
  `;

  stage.replaceChildren(notice);
  stage.classList.add("has-cargo");
}

function renderPayload(lease) {
  const payloadUrl =
    absoluteEllistripUrl(
      lease.payloadUrl
    );

  if (!payloadUrl) {
    renderUnsupportedPayload(
      "INVALID PAYLOAD ADDRESS"
    );

    return;
  }

  const payloadType =
    String(
      lease.payloadType ||
      "application/octet-stream"
    ).toLowerCase();

  if (payloadType.startsWith("image/")) {
    renderImage(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (payloadType.startsWith("video/")) {
    renderVideo(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (payloadType.startsWith("audio/")) {
    renderAudio(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (
    payloadType.includes("json")
  ) {
    renderJson(payloadUrl);

    return;
  }

  renderUnsupportedPayload(
    "UNSUPPORTED PAYLOAD TYPE"
  );
}

function renderWaiting() {
  receiverState.active = false;
  receiverState.cargoId = null;
  receiverState.payloadType = null;
  receiverState.payloadUrl = null;
  receiverState.openedAt = null;
  receiverState.expiresAt = null;
  receiverState.trace = null;
  receiverState.lastPayloadIdentity = null;

  setReceiverState("WAITING");

  setText(
    "cargoId",
    "NO CARGO"
  );

  setText(
    "payloadType",
    "NONE"
  );

  setText(
    "openedAt",
    "NOT OPEN"
  );

  setText(
    "expiresAt",
    "NO ACTIVE LEASE"
  );

  stopCountdown();
  clearStage();
}

function renderActive(lease) {
  const payloadUrl =
    absoluteEllistripUrl(
      lease.payloadUrl
    );

  receiverState.active = true;
  receiverState.cargoId =
    lease.cargoId || null;

  receiverState.payloadType =
    lease.payloadType || null;

  receiverState.payloadUrl =
    payloadUrl || null;

  receiverState.openedAt =
    lease.openedAt || null;

  receiverState.expiresAt =
    lease.expiresAt || null;

  receiverState.trace =
    lease.trace || null;

  setReceiverState("ACTIVE");

  setText(
    "cargoId",
    receiverState.cargoId ||
      "UNKNOWN CARGO"
  );

  setText(
    "payloadType",
    receiverState.payloadType ||
      "UNKNOWN"
  );

  setText(
    "openedAt",
    formatDate(
      receiverState.openedAt
    )
  );

  setText(
    "expiresAt",
    formatDate(
      receiverState.expiresAt
    )
  );

  beginCountdown();

  const payloadIdentity = [
    receiverState.cargoId || "",
    receiverState.payloadUrl || "",
    receiverState.expiresAt || ""
  ].join("|");

  if (
    payloadIdentity !==
    receiverState.lastPayloadIdentity
  ) {
    receiverState.lastPayloadIdentity =
      payloadIdentity;

    renderPayload(lease);
  }
}

function renderConnectionError(error) {
  receiverState.connected = false;

  setReceiverState("CONNECTION ERROR");

  setText(
    "connectionDetail",
    error instanceof Error
      ? error.message
      : "EXIT 11 UNREACHABLE"
  );
}

async function readExit11Lease() {
  const requestUrl =
    CONFIG.exit.leaseUrl +
    "?t=" +
    Date.now();

  const response = await fetch(
    requestUrl,
    {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "Exit 11 lease returned HTTP " +
        response.status
    );
  }

  return response.json();
}

async function pollExit11() {
  try {
    const lease =
      await readExit11Lease();

    receiverState.connected = true;

    setText(
      "connectionDetail",
      "CONNECTED TO TANDIME CLOUD EXIT MANAGER"
    );

    if (
      !lease ||
      lease.active !== true
    ) {
      renderWaiting();
      return;
    }

    renderActive(lease);
  } catch (error) {
    console.error(
      "TANDIME Exit 11:",
      error
    );

    renderConnectionError(error);
  }
}

function startExitReceiver() {
  clearStage();

  pollExit11();

  receiverState.pollTimer =
    window.setInterval(
      pollExit11,
      CONFIG.exit.pollMilliseconds
    );
}

function stopExitReceiver() {
  if (receiverState.pollTimer) {
    window.clearInterval(
      receiverState.pollTimer
    );

    receiverState.pollTimer = null;
  }

  stopCountdown();
}

window.addEventListener(
  "DOMContentLoaded",
  startExitReceiver
);

window.addEventListener(
  "beforeunload",
  stopExitReceiver
);/*
==========================================================
TANDIME-ONUS
Public receiver for TANDIME Cloud Exit 11.

This browser never receives or stores the private admin token.
It reads only the public lease and temporary payload routes.
==========================================================
*/

"use strict";

const CONFIG = window.TANDIME_ONUS_CONFIG;

if (!CONFIG) {
  throw new Error(
    "TANDIME-ONUS configuration was not loaded."
  );
}

const receiverState = {
  connected: false,
  active: false,
  cargoId: null,
  payloadType: null,
  payloadUrl: null,
  openedAt: null,
  expiresAt: null,
  trace: null,
  pollTimer: null,
  countdownTimer: null,
  lastPayloadIdentity: null
};

function element(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const target = element(id);

  if (target) {
    target.textContent = String(value);
  }
}

function setReceiverState(value) {
  const target = element("exitState");

  if (!target) return;

  target.textContent = value;
  target.dataset.state =
    String(value).toLowerCase().replace(/\s+/g, "-");
}

function absoluteEllistripUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "";
  }

  try {
    const resolved = new URL(
      value,
      CONFIG.exit.payloadOrigin
    );

    if (
      resolved.origin !==
      new URL(CONFIG.exit.payloadOrigin).origin
    ) {
      return "";
    }

    return resolved.toString();
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "NO ACTIVE LEASE";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function formatRemainingTime(expiresAt) {
  if (!expiresAt) return "NO ACTIVE LEASE";

  const expiration = Date.parse(expiresAt);

  if (!Number.isFinite(expiration)) {
    return "UNKNOWN";
  }

  const remaining =
    Math.max(0, expiration - Date.now());

  const totalSeconds =
    Math.floor(remaining / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

function updateCountdown() {
  setText(
    "leaseCountdown",
    formatRemainingTime(
      receiverState.expiresAt
    )
  );
}

function beginCountdown() {
  if (receiverState.countdownTimer) {
    window.clearInterval(
      receiverState.countdownTimer
    );
  }

  updateCountdown();

  receiverState.countdownTimer =
    window.setInterval(
      updateCountdown,
      1000
    );
}

function stopCountdown() {
  if (receiverState.countdownTimer) {
    window.clearInterval(
      receiverState.countdownTimer
    );

    receiverState.countdownTimer = null;
  }

  setText(
    "leaseCountdown",
    "NO ACTIVE LEASE"
  );
}

function clearStage() {
  const stage = element("payloadStage");

  if (!stage) return;

  stage.replaceChildren();

  stage.classList.remove("has-cargo");

  const waiting = document.createElement("div");

  waiting.className = "waiting-message";

  waiting.innerHTML = `
    <span>EXIT 11</span>
    <strong>WAITING FOR TRANSPORTED CARGO</strong>
    <p>
      The screens remain empty until WEB11 opens
      the external TANDIME exit.
    </p>
  `;

  stage.appendChild(waiting);
}

function renderImage(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const image = document.createElement("img");

  image.className = "transported-payload";
  image.alt =
    "TANDIME transported cargo " +
    (cargoId || "");

  image.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  image.addEventListener("load", () => {
    stage.classList.add("has-cargo");
  });

  image.addEventListener("error", () => {
    renderUnsupportedPayload(
      "PAYLOAD COULD NOT BE DISPLAYED"
    );
  });

  stage.replaceChildren(image);
}

function renderVideo(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const video = document.createElement("video");

  video.className = "transported-payload";
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  video.setAttribute(
    "aria-label",
    "TANDIME transported cargo " +
      (cargoId || "")
  );

  video.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  video.addEventListener(
    "loadeddata",
    () => {
      stage.classList.add("has-cargo");

      video.play().catch(() => {});
    }
  );

  video.addEventListener("error", () => {
    renderUnsupportedPayload(
      "VIDEO PAYLOAD COULD NOT BE DISPLAYED"
    );
  });

  stage.replaceChildren(video);
}

function renderAudio(payloadUrl, cargoId) {
  const stage = element("payloadStage");

  if (!stage) return;

  const shell = document.createElement("div");

  shell.className = "audio-payload";

  const label = document.createElement("strong");

  label.textContent =
    cargoId || "TRANSPORTED AUDIO";

  const audio = document.createElement("audio");

  audio.controls = true;
  audio.autoplay = true;
  audio.preload = "auto";

  audio.src =
    payloadUrl +
    (payloadUrl.includes("?") ? "&" : "?") +
    "t=" +
    Date.now();

  shell.append(label, audio);

  stage.replaceChildren(shell);
  stage.classList.add("has-cargo");
}

function renderJson(payloadUrl) {
  const stage = element("payloadStage");

  if (!stage) return;

  fetch(payloadUrl, {
    method: "GET",
    cache: "no-store"
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          "Payload request failed: " +
            response.status
        );
      }

      return response.json();
    })
    .then((payload) => {
      const output =
        document.createElement("pre");

      output.className = "json-payload";

      output.textContent =
        JSON.stringify(
          payload,
          null,
          2
        );

      stage.replaceChildren(output);
      stage.classList.add("has-cargo");
    })
    .catch((error) => {
      console.error(
        "TANDIME JSON payload:",
        error
      );

      renderUnsupportedPayload(
        "JSON PAYLOAD COULD NOT BE READ"
      );
    });
}

function renderUnsupportedPayload(message) {
  const stage = element("payloadStage");

  if (!stage) return;

  const notice = document.createElement("div");

  notice.className = "unsupported-payload";

  notice.innerHTML = `
    <span>CARGO ARRIVED</span>
    <strong>${message}</strong>
    <p>
      The lease is active, but this version of
      TANDIME-ONUS does not yet render this payload type.
    </p>
  `;

  stage.replaceChildren(notice);
  stage.classList.add("has-cargo");
}

function renderPayload(lease) {
  const payloadUrl =
    absoluteEllistripUrl(
      lease.payloadUrl
    );

  if (!payloadUrl) {
    renderUnsupportedPayload(
      "INVALID PAYLOAD ADDRESS"
    );

    return;
  }

  const payloadType =
    String(
      lease.payloadType ||
      "application/octet-stream"
    ).toLowerCase();

  if (payloadType.startsWith("image/")) {
    renderImage(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (payloadType.startsWith("video/")) {
    renderVideo(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (payloadType.startsWith("audio/")) {
    renderAudio(
      payloadUrl,
      lease.cargoId
    );

    return;
  }

  if (
    payloadType.includes("json")
  ) {
    renderJson(payloadUrl);

    return;
  }

  renderUnsupportedPayload(
    "UNSUPPORTED PAYLOAD TYPE"
  );
}

function renderWaiting() {
  receiverState.active = false;
  receiverState.cargoId = null;
  receiverState.payloadType = null;
  receiverState.payloadUrl = null;
  receiverState.openedAt = null;
  receiverState.expiresAt = null;
  receiverState.trace = null;
  receiverState.lastPayloadIdentity = null;

  setReceiverState("WAITING");

  setText(
    "cargoId",
    "NO CARGO"
  );

  setText(
    "payloadType",
    "NONE"
  );

  setText(
    "openedAt",
    "NOT OPEN"
  );

  setText(
    "expiresAt",
    "NO ACTIVE LEASE"
  );

  stopCountdown();
  clearStage();
}

function renderActive(lease) {
  const payloadUrl =
    absoluteEllistripUrl(
      lease.payloadUrl
    );

  receiverState.active = true;
  receiverState.cargoId =
    lease.cargoId || null;

  receiverState.payloadType =
    lease.payloadType || null;

  receiverState.payloadUrl =
    payloadUrl || null;

  receiverState.openedAt =
    lease.openedAt || null;

  receiverState.expiresAt =
    lease.expiresAt || null;

  receiverState.trace =
    lease.trace || null;

  setReceiverState("ACTIVE");

  setText(
    "cargoId",
    receiverState.cargoId ||
      "UNKNOWN CARGO"
  );

  setText(
    "payloadType",
    receiverState.payloadType ||
      "UNKNOWN"
  );

  setText(
    "openedAt",
    formatDate(
      receiverState.openedAt
    )
  );

  setText(
    "expiresAt",
    formatDate(
      receiverState.expiresAt
    )
  );

  beginCountdown();

  const payloadIdentity = [
    receiverState.cargoId || "",
    receiverState.payloadUrl || "",
    receiverState.expiresAt || ""
  ].join("|");

  if (
    payloadIdentity !==
    receiverState.lastPayloadIdentity
  ) {
    receiverState.lastPayloadIdentity =
      payloadIdentity;

    renderPayload(lease);
  }
}

function renderConnectionError(error) {
  receiverState.connected = false;

  setReceiverState("CONNECTION ERROR");

  setText(
    "connectionDetail",
    error instanceof Error
      ? error.message
      : "EXIT 11 UNREACHABLE"
  );
}

async function readExit11Lease() {
  const requestUrl =
    CONFIG.exit.leaseUrl +
    "?t=" +
    Date.now();

  const response = await fetch(
    requestUrl,
    {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "Exit 11 lease returned HTTP " +
        response.status
    );
  }

  return response.json();
}

async function pollExit11() {
  try {
    const lease =
      await readExit11Lease();

    receiverState.connected = true;

    setText(
      "connectionDetail",
      "CONNECTED TO TANDIME CLOUD EXIT MANAGER"
    );

    if (
      !lease ||
      lease.active !== true
    ) {
      renderWaiting();
      return;
    }

    renderActive(lease);
  } catch (error) {
    console.error(
      "TANDIME Exit 11:",
      error
    );

    renderConnectionError(error);
  }
}

function startExitReceiver() {
  clearStage();

  pollExit11();

  receiverState.pollTimer =
    window.setInterval(
      pollExit11,
      CONFIG.exit.pollMilliseconds
    );
}

function stopExitReceiver() {
  if (receiverState.pollTimer) {
    window.clearInterval(
      receiverState.pollTimer
    );

    receiverState.pollTimer = null;
  }

  stopCountdown();
}

window.addEventListener(
  "DOMContentLoaded",
  startExitReceiver
);

window.addEventListener(
  "beforeunload",
  stopExitReceiver
);
