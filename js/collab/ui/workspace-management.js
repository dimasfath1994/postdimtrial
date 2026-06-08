/**
 * workspace-management.js
 */
import { WorkspaceMemberService } from "../workspace-member-service.js";

export function initWorkspaceModal() {
    // Inject modal ke body jika belum ada
    if (!document.getElementById('workspaceModal')) {
        const modalHtml = `
        <div id="workspaceModal" class="hidden modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; justify-content: center; align-items: center; display: none;">
            <div class="modal-content" style="background: #1e1e1e; padding: 20px; border-radius: 8px; width: 500px; max-height: 80vh; overflow-y: auto; color: #e0e0e0; border: 1px solid #333;">
                <h3 style="margin-top: 0; border-bottom: 1px solid #333; padding-bottom: 10px;">Manage Workspace</h3>
                
                <div id="workspaceMembersList" style="margin: 15px 0;">
                </div>

                <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="closeWorkspaceModal" style="background: #444; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Close</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    document.getElementById('closeWorkspaceModal').onclick = () => {
        document.getElementById('workspaceModal').style.display = 'none';
    };
}

/**
 * Membuka modal dan memuat data member
 */
export async function showWorkspaceModal(workspaceId) {
    // Self-healing jika modal belum terinjeksi
    let modal = document.getElementById('workspaceModal');
    if (!modal) {
        initWorkspaceModal();
        modal = document.getElementById('workspaceModal');
    }
    
    const container = document.getElementById('workspaceMembersList');
    modal.style.display = 'flex';
    container.innerHTML = 'Loading members...';

    // Fungsi untuk menghapus member
    window.removeMember = async (memberId) => {
        if (confirm("Are you sure you want to remove this member?")) {
            try {
                await WorkspaceMemberService.removeMember(memberId);
                showWorkspaceModal(workspaceId);
            } catch (err) {
                alert("Failed to remove member.");
            }
        }
    };

    // Fungsi untuk update role
    window.updateMemberRole = async (memberId, workspaceId, userId, newRole) => {
        try {
            await WorkspaceMemberService.updateMember(memberId, workspaceId, userId, newRole);
            showWorkspaceModal(workspaceId);
        } catch (err) {
            alert("Failed to update role.");
        }
    };

    try {
        const members = await WorkspaceMemberService.getMembers(workspaceId);

        let html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="text-align: left; border-bottom: 1px solid #333;">
                        <th style="padding: 10px 0;">Name</th>
                        <th style="padding: 10px 0;">Role</th>
                        <th style="padding: 10px 0;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        members.forEach(m => {
            const isOwner = m.role === 'Owner';
            html += `
                <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 10px 0;">${m.name}</td>
                    <td style="padding: 10px 0;">
                        ${isOwner ? '<span style="color: #ffd700;">Owner</span>' : `
                            <select onchange="updateMemberRole(${m.id}, ${m.workspace_id}, ${m.user_id}, this.value)" style="background: #333; color: white; border: none; padding: 2px;">
                                <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
                                <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                            </select>
                        `}
                    </td>
                    <td style="padding: 10px 0;">
                        ${!isOwner ? `<button onclick="removeMember(${m.id})" style="background: transparent; border: none; color: #ff4444; cursor:pointer;">Remove</button>` : '-'}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = 'Failed to load members.';
    }
}