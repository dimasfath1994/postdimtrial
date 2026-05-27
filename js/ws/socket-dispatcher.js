export class SocketDispatcher {
    constructor() {
        this.handlers = new Map();
    }

    // Mendaftarkan controller untuk prefix tipe pesan tertentu
    register(prefix, controller) {
        this.handlers.set(prefix, controller);
    }

    dispatch(payload) {
        console.log("[SOCKET DISPATCHER] Mendistribusikan:", payload);
        
        for (const [prefix, controller] of this.handlers) {
            if (payload.type.startsWith(prefix)) {
                controller.handleSocketMessage(payload);
            }
        }
    }
}