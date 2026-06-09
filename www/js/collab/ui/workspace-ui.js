export function initWorkspaceUI(workspaceCtrl) {
  // 1. Tombol Create
  document.getElementById("createWorkspaceBtn")?.addEventListener("click", () => {
      workspaceCtrl.createNewWorkspace();
  });

  // 2. Setup Context Menu
  setupContextMenu(workspaceCtrl);
}

export function updateWorkspaceNameUI(name) {
  const el = document.getElementById("activeWorkspaceName");
  if (el) el.textContent = name;
}

export function updateSwitcherUI(list, currentId, onChangeCallback) {
  const select = document.getElementById("workspaceSwitcher");
  if (!select) return;
  
  select.innerHTML = "";
  list.forEach(ws => {
      const opt = document.createElement("option");
      opt.value = ws.id;
      opt.textContent = ws.name;
      if (Number(ws.id) === Number(currentId)) opt.selected = true;
      select.appendChild(opt);
  });
  select.onchange = (e) => onChangeCallback(e.target.value);
}

function setupContextMenu(workspaceCtrl) {
  const el = document.getElementById("activeWorkspaceName");
  if (!el) return;

  const menu = document.createElement("div");
  Object.assign(menu.style, { 
      position: "fixed", display: "none", background: "#1e1e1e", 
      border: "1px solid #333", zIndex: "9999", padding: "5px" 
  });
  document.body.appendChild(menu);

  el.oncontextmenu = (e) => {
      e.preventDefault();
      menu.innerHTML = `<div style="padding:10px; cursor:pointer" id="renameWS">Rename</div>
                        <div style="padding:10px; cursor:pointer" id="deleteWS">Delete</div>`;
      menu.style.left = `${e.clientX}px`; 
      menu.style.top = `${e.clientY}px`; 
      menu.style.display = "block";
      
      document.getElementById("renameWS").onclick = () => workspaceCtrl.handleRenameRequest(el.textContent);
      document.getElementById("deleteWS").onclick = () => workspaceCtrl.handleDeleteRequest();
  };
  document.onclick = () => menu.style.display = "none";
}