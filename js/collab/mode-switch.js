import { AppMode } from "../core/app-mode.js";

export function initModeSwitch() {

  const btn = document.getElementById("collabModeBtn");

  btn.onclick = () => {

    const current = AppMode.get();

    if (current === "local") {
      window.location.href = "/login.html";
      return;
    }

    AppMode.set("local");
    location.reload();
  };
}