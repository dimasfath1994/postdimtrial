import { Auth } from "../auth.js";
import { WorkspaceService } from "./workspace-service.js";

/**
 * MAIN GUARD ENTRY (FIXED VERSION)
 */
export async function guardCollaborationAccess() {
  const isVsCodeExtension = Boolean(window.postdimBridge?.navigate);

  try {
    // ================= 1. TOKEN CHECK (HARD REQUIREMENT) =================
    const token = Auth.getToken();
    if (!token) {
      return block("NO_TOKEN");
    }

    // ================= 2. USER CHECK =================
    const user = Auth.getUser?.();
    if (!user?.email) {
      if (!isVsCodeExtension) {
        Auth.logout?.();
        return block("NO_USER");
      }
      console.warn("[COLLAB USER MISSING - KEEPING VSCODE SESSION]");
    }

    // ================= 3. WORKSPACE CHECK (STRICT MODE) =================
    try {
      const workspaces = await WorkspaceService.getMyWorkspaces();
      // Hanya lewat jika koneksi dan fetch berhasil. 
      // Tidak ada lagi pembuatan workspace otomatis di sini.
    } catch (err) {
      console.warn("[WORKSPACE FETCH FAILED - IGNORE]", err);
      // Biarkan error jaringan di-ignore tanpa memicu pembuatan workspace baru
    }

    // ================= SUCCESS =================
    return true;

  } catch (err) {
    console.error("[COLLAB GUARD ERROR]", err);
    if (isVsCodeExtension && Auth.getToken()) {
      console.warn("[COLLAB GUARD ERROR - KEEPING VSCODE SESSION]");
      return true;
    }
    Auth.logout?.();
    return block("GUARD_EXCEPTION");
  }
}

/**
 * HARD BLOCK
 */
function block(reason) {

  console.warn("[COLLAB ACCESS BLOCKED]", reason);

  try {
    sessionStorage.removeItem("collab_cache");
  } catch {}

  if (window.postdimBridge?.navigate) {
    window.postdimBridge.navigate("login.html");
  } else {
    window.location.replace("login.html");
  }

  return false;
}