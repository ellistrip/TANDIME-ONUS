/*
==========================================================
TANDIME-ONUS
External destination of the TANDIME transport system.
==========================================================
*/

const ONUS = {
  name: "TANDIME-ONUS",
  version: "1.0.0",
  status: "BORN",
  transport: "TANDIME",
  runtime: "WAITING",
  connection: "DISCONNECTED",
  mosaic: "EMPTY"
};

window.addEventListener("load", () => {
  console.clear();

  console.log("==========================================");
  console.log("TANDIME-ONUS");
  console.log("==========================================");
  console.log("Status:", ONUS.status);
  console.log("Runtime:", ONUS.runtime);
  console.log("Transport:", ONUS.transport);
  console.log("Connection:", ONUS.connection);
  console.log("Mosaic:", ONUS.mosaic);
  console.log("==========================================");
});
