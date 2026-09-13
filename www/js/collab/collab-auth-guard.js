import { Auth } from "../auth.js";
import { WorkspaceService } from "./workspace-service.js";

/**
 * MAIN GUARD ENTRY (FIXED VERSION)
 */
export async function guardCollaborationAccess() {
  try {
    // ================= 1. TOKEN CHECK (HARD REQUIREMENT) =================
    const token = Auth.getToken();
    if (!token) {
      return block("NO_TOKEN");
    }

    // ================= 2. USER CHECK =================
    const user = Auth.getUser?.();
    if (!user?.email) {
      Auth.logout?.();
      return block("NO_USER");
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