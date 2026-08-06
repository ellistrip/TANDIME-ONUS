"use strict";

window.TANDIME_ONUS_CONFIG = Object.freeze({
  application: {
    name: "TANDIME-ONUS",
    version: "1.0.0",
    role: "EXTERNAL_LIVE_MOSAIC_DESTINATION"
  },

  exit: {
    number: "11",

    leaseUrl:
      "https://ellistrip.com/api/tandime/exits/11/lease",

    payloadOrigin:
      "https://ellistrip.com",

    pollMilliseconds: 3000
  },

  mosaic: {
    screenCount: 165,
    assignmentMode: "STABLE_STREAM_TO_SCREEN",
    emptyScreenOpacity: 0.08
  },

  routes: {
    returnToWeb11:
      "https://ellistrip.com/ellistriponus.html"
  }
});
