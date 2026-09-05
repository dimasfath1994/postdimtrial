import { AppMode } from "../core/app-mode.js";

export function initModeSwitch() {

  const btn = document.getElementById("collabModeBtn");

  btn.onclick = () => {

    const current = AppMode.get();

    if (current === "local") {
      if (window.postdimBridge?.navigate) {
        window.postdimBridge.navigate("login.html");
      } else {
        window.location.href = "/login.html";
      }
      return;
    }

    AppMode.set("local");
    location.reload();
  };
}