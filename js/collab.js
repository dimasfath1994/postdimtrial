import { Auth } from "./auth.js";

export function initCollabMode() {

  const btn = document.getElementById("collabModeBtn");

  btn.onclick = () => {

    if (!Auth.isLoggedIn()) {
      window.location.href = "login.html";
      return;
    }

    enableCollabUI();
  };
}

function enableCollabUI() {
  document.body.classList.add("collab-mode");
  console.log("Collab mode active");
}