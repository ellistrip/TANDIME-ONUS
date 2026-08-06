window.TANDIME_ONUS_CONFIG = Object.freeze({
  application: {
    name: "TANDIME-ONUS",
    version: "0.1.0",
    role: "EXTERNAL_TANDIME_EXIT"
  },

  exit: {
    number: "11",
    leaseUrl:
      "https://ellistrip.com/api/tandime/exits/11/lease",
    pollMilliseconds: 3000
  },

  returnRoute: {
    web11:
      "https://ellistrip.com/ellistriponus.html"
  }
});
