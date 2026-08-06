const CONFIG = window.TANDIME_ONUS_CONFIG;

const state = {
  active: false,
  cargoId: null,
  payloadUrl: null,
  payloadType: null,
  expiresAt: null,
  timer: null
};

function absoluteEllistripUrl(value) {
  if (!value) return "";

  try {
    return new URL(
      value,
      "https://ellistrip.com"
    ).toString();
  } catch {
    return "";
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function clearPayload() {
  const screen =
    document.getElementById("onusPayload");

  if (!screen) return;

  screen.removeAttribute("src");
  screen.hidden = true;
}

function renderWaiting() {
  state.active = false;
  state.cargoId = null;
  state.payloadUrl = null;
  state.payloadType = null;
  state.expiresAt = null;

  setText("exitState", "WAITING");
  setText("cargoId", "NO CARGO");
  setText("expiresAt", "NO ACTIVE LEASE");

  clearPayload();
}

function renderActive(lease) {
  const payloadUrl =
    absoluteEllistripUrl(lease.payloadUrl);

  state.active = true;
  state.cargoId = lease.cargoId || null;
  state.payloadUrl = payloadUrl;
  state.payloadType =
    lease.payloadType || "application/octet-stream";
  state.expiresAt = lease.expiresAt || null;

  setText("exitState", "ACTIVE");
  setText(
    "cargoId",
    state.cargoId || "UNKNOWN CARGO"
  );
  setText(
    "expiresAt",
    state.expiresAt || "UNKNOWN EXPIRATION"
  );

  const screen =
    document.getElementById("onusPayload");

  if (!screen || !payloadUrl) {
    clearPayload();
    return;
  }

  if (
    state.payloadType.startsWith("image/")
  ) {
    screen.hidden = false;
    screen.src =
      payloadUrl + "?t=" + Date.now();
  } else {
    clearPayload();
  }
}

async function pollExit11() {
  try {
    const response = await fetch(
      CONFIG.exit.leaseUrl +
        "?t=" +
        Date.now(),
      {
        method: "GET",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        "Lease request failed: " +
          response.status
      );
    }

    const lease = await response.json();

    if (!lease || lease.active !== true) {
      renderWaiting();
      return;
    }

    renderActive(lease);
  } catch (error) {
    setText(
      "exitState",
      "CONNECTION ERROR"
    );

    console.error(
      "TANDIME Exit 11:",
      error
    );
  }
}

function startExitReceiver() {
  pollExit11();

  state.timer = window.setInterval(
    pollExit11,
    CONFIG.exit.pollMilliseconds
  );
}

window.addEventListener(
  "DOMContentLoaded",
  startExitReceiver
);
