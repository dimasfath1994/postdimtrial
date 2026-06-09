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

    // ================= 3. WORKSPACE CHECK (SAFE MODE) =================
    let workspaces = [];

    try {
      workspaces = await WorkspaceService.getMyWorkspaces();
    } catch (err) {
      console.warn("[WORKSPACE FETCH FAILED - IGNORE]", err);
      workspaces = []; // jangan block auth hanya karena API error
    }

    // ================= 4. AUTO CREATE WORKSPACE =================
    if (Array.isArray(workspaces) && workspaces.length === 0) {

      try {
        await WorkspaceService.createWorkspace("My Workspace");
      } catch (err) {
        console.error("[WORKSPACE CREATE FAILED]", err);
        // jangan block login karena ini non-critical
      }
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

  window.location.replace("login.html");

  return false;
}