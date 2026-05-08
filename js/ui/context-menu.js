export class ContextMenu {
  constructor() {
    this.menu = document.createElement("div");
    this.menu.id = "contextMenu";

    this.menu.style.position = "fixed";
    this.menu.style.display = "none";
    this.menu.style.background = "#222";
    this.menu.style.color = "#fff";
    this.menu.style.padding = "8px";
    this.menu.style.borderRadius = "6px";
    this.menu.style.zIndex = "9999";
    this.menu.style.minWidth = "120px";

    document.body.appendChild(this.menu);

    document.addEventListener("click", () => this.hide());
  }

  show(x, y, items = []) {
    this.menu.innerHTML = "";

    items.forEach(item => {
      const div = document.createElement("div");

      div.textContent = item.label;
      div.style.padding = "6px";
      div.style.cursor = "pointer";

      div.onmouseenter = () => {
        div.style.background = "#333";
      };

      div.onmouseleave = () => {
        div.style.background = "transparent";
      };

      div.onclick = () => {
        item.action();
        this.hide();
      };

      this.menu.appendChild(div);
    });

    this.menu.style.left = x + "px";
    this.menu.style.top = y + "px";
    this.menu.style.display = "block";
  }

  hide() {
    this.menu.style.display = "none";
  }
}