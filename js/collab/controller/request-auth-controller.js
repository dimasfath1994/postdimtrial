// js/controller/request-auth-controller.js

export class RequestAuthController {
    constructor(State, handlers) {
        this.State = State;
        this.handlers = handlers; // { onUpdate: (id, data) => ... }
    }

    init(requestId, container) {
        const authTypeEl = container.querySelector('#authType');
        const authValueEl = container.querySelector('#authValue');

        // Load data from state
        const request = this.State.requests.find(r => r.id === requestId);
        if (request) {
            authTypeEl.value = request.auth_type || 'none';
            authValueEl.value = request.auth_value || '';
        }

        // Attach listeners
        [authTypeEl, authValueEl].forEach(el => {
            el.addEventListener('change', () => {
                const updatedData = {
                    auth_type: authTypeEl.value,
                    auth_value: authValueEl.value
                };
                this.handlers.onUpdate(requestId, updatedData);
            });
        });
    }

    // Dipanggil oleh SocketDispatcher saat ada event update
    handleSocketMessage(payload) {
        const { type, data } = payload;
        if (type === 'REQUEST_UPDATED' && data.id) {
            const authTypeEl = document.getElementById('authType');
            const authValueEl = document.getElementById('authValue');
            
            // Hanya update jika elemen ada di DOM yang aktif
            if (authTypeEl && authValueEl) {
                authTypeEl.value = data.auth_type || 'none';
                authValueEl.value = data.auth_value || '';
            }
        }
    }
}