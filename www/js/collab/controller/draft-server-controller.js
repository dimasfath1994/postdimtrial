import { DataBridge } from "./bridge.js";

export class DraftServerController {
    /**
     * Inject semua controller yang dibutuhkan
     */
    constructor(State, { 
        requestController, 
        requestParamController, 
        requestHeaderController, 
        requestBodyParamController 
    }) {
        this.State = State;
        this.requestController = requestController;
        this.requestParamController = requestParamController;
        this.requestHeaderController = requestHeaderController;
        this.requestBodyParamController = requestBodyParamController;
    }

    /**
     * Memindahkan data dari Draft (DataBridge) ke Server (Database)
     */
    async commitDraftToServer(draftId, targetLocation) {
        try {
            // 1. Ambil data mentah dari Local Storage
            const draftData = DataBridge.getAll(draftId);
            if (!draftData) throw new Error("Draft tidak ditemukan");
            console.log("ISI DRAFT DATA SEBELUM KE SERVER", draftData);
            // 2. Buat Request Utama
            const requestPayload = {
                id: draftData.id,
                name: draftData.name || "New Request",
                method: draftData.method || "GET",
                url: draftData.url || "",
                body: draftData.body || "",
                body_mode: draftData.body_mode || "none",
                auth_type: draftData.auth_type || "none",
                auth_value: draftData.auth_value || "",
                pre_script: draftData.pre_script || "",
                post_script: draftData.post_script || "",
                workspace_id: this.State.workspaceId,
                collection_id: targetLocation.collection_id,
                folder_id: targetLocation.folder_id || null
            };

            const newRequest = await this.requestController.createRequestToServer(requestPayload);
            const newId = newRequest.id;

            // 3. Sinkronisasi Data Turunan
            // ID dihilangkan agar DB membuat entry baru
            await Promise.all([
                this.saveParams(newId, draftData.params),
                this.saveHeaders(newId, draftData.headers),
                this.saveBodyParams(newId, draftData.bodyParams)
            ]);

            return newId;
        } catch (error) {
            console.error("Gagal melakukan commit draft:", error);
            throw error;
        }
    }

    async saveParams(reqId, params) {
        // 1. Validasi
        if (!params || !Array.isArray(params)) return;
        await this.requestParamController.migrateParamsToRequest(reqId, params);
    }

    async saveHeaders(reqId, headers) {
        if (!headers || !Array.isArray(headers)) return;
        
        await this.requestHeaderController.migrateHeadersToRequest(reqId, headers);
    }

    async saveBodyParams(reqId, bodyParams) {
        if (!bodyParams || !Array.isArray(bodyParams)) return;
        
        await this.requestBodyParamController.migrateBodyParamsToRequest(reqId, bodyParams);
    }
}