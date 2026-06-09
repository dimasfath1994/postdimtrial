import { UserService } from "../user-service.js";
import { WorkspaceMemberService } from "../workspace-member-service.js";

export function initInviteModal() {
    let debounceTimer;

    // 1. Delegasi Event untuk CLICK (Buka, Tutup, Submit)
    document.addEventListener('click', async (e) => {
        const modal = document.getElementById('inviteModal');
        const emailInput = document.getElementById('userEmail');
        const searchResult = document.getElementById('searchResult');
        const roleInput = document.getElementById('userRole'); // Ambil element dropdown

        // Buka Modal
        if (e.target.id === 'inviteBtn') {
            if (modal) modal.classList.remove('modal-hidden');
        }

        // Tutup Modal
        if (e.target.id === 'closeModal' || e.target === modal) {
            if (modal) modal.classList.add('modal-hidden');
            if (emailInput) emailInput.value = '';
            if (roleInput) roleInput.value = 'viewer'; // Reset ke default
            if (searchResult) searchResult.innerHTML = '';
        }

        // Kirim Undangan
        if (e.target.id === 'confirmInvite') {
            const email = emailInput ? emailInput.value.trim() : '';
            const role = roleInput ? roleInput.value : 'viewer';
            
            if (!email) return alert("Email wajib diisi!");

            // AMBIL ID TERBARU DARI WINDOW GLOBAL ATAU DATASET
            const currentWorkspaceId = window.COLLAB_STATE?.workspaceId || document.body.dataset.currentWsId;

            if (!currentWorkspaceId) {
                return alert("Workspace tidak ditemukan, silakan refresh halaman.");
            }

            try {
                const users = await UserService.searchUsers(email);
                if (users.length > 0) {
                    const user = users[0];
                    
                    // Mengirim role ke backend
                    await WorkspaceMemberService.addMember(currentWorkspaceId, user.id, role);
                    
                    alert(`Undangan berhasil dikirim ke ${user.name || 'user tersebut'} sebagai ${role}`);
                    
                    if (modal) modal.classList.add('modal-hidden');
                    if (emailInput) emailInput.value = '';
                    if (roleInput) roleInput.value = 'viewer';
                } else {
                    alert("User tidak ditemukan.");
                }
            } catch (err) {
                console.error(err);
                alert("Terjadi kesalahan saat mengundang.");
            }
        }

        // Pilih user dari hasil suggestion
        if (e.target.classList.contains('user-item')) {
            emailInput.value = e.target.dataset.email;
            searchResult.innerHTML = '';
        }
    });

    // 2. Delegasi Event untuk INPUT (Live Search dengan Debounce)
    document.addEventListener('input', async (e) => {
        if (e.target.id === 'userEmail') {
            const email = e.target.value.trim();
            const searchResult = document.getElementById('searchResult');
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                if (email.length < 3) {
                    if (searchResult) searchResult.innerHTML = '';
                    return;
                }

                try {
                    const users = await UserService.searchUsers(email);
                    if (searchResult) {
                        searchResult.innerHTML = users.map(user => `
                            <div class="user-item" data-email="${user.email}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;">
                                ${user.name} (${user.email})
                            </div>
                        `).join('');
                    }
                } catch (err) {
                    console.error("Gagal mencari user:", err);
                }
            }, 500);
        }
    });
}