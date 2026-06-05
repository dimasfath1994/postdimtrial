import { WorkspaceService } from "../workspace-service.js";
import { CollectionService } from "../collection-service.js";
import { FolderService } from "../folder-service.js";
import { RequestService } from "../request-service.js";
import { RequestParamService } from "../request-param-service.js";
import { RequestHeaderService } from "../request-header-service.js";
import { RequestBodyParamService } from "../request-body-param-service.js";
import { EnvService } from "../env-service.js";
import { GlobalService } from "../global-service.js";

export const ImportSequenceInserter = {

    async import(data, mode, activeWorkspaceId = null, userId = null) {
        try {

            if (mode === 'workspace') {
                const bcws = new BroadcastChannel('workspace_channel');
                const workspace = await WorkspaceService.createWorkspace(data.name || "Imported Workspace");
                
                const wsId = workspace.id || workspace.data?.id;
                if (!wsId) throw new Error("Gagal mendapatkan ID workspace");
                // 1. Import Environment (Opsional)
                if (Array.isArray(data.environment) && data.environment.length > 0) {
                    for (const env of data.environment) {
                        await EnvService.create(wsId, env.env_key, env.env_value);
                    }
                }

                // 2. Import Globals (Opsional)
                if (Array.isArray(data.globals) && data.globals.length > 0) {
                    for (const glob of data.globals) {
                        await GlobalService.create(glob.global_key, glob.global_value);
                    }
                }

                bcws.postMessage({ type: 'WORKSPACE_CREATED', id: wsId, data: workspace });
                bcws.close();
                
                for (const colItem of (data.collections || [])) {
                    await this.importCollection(colItem, wsId, userId);
                }
                return { success: true, workspaceId: wsId };
                
            } else if (mode === 'collection') {
                if (!activeWorkspaceId) throw new Error("Workspace aktif tidak ditemukan!");
                for (const colItem of (data.collections || [])) {
                    await this.importCollection(colItem, parseInt(activeWorkspaceId), userId);
                }
                return { success: true, workspaceId: activeWorkspaceId };
            }
        } catch (error) {
            console.error("[ImportSequenceInserter Error]", error);
            throw error;
        }
    },

    async importCollection(colData, workspaceId, userId) {
        const bccol = new BroadcastChannel('collection_channel');
        const collection = await CollectionService.create(workspaceId, colData.name);
        
        if (!collection || !collection.id) {
            throw new Error("[CREATE COLLECTION FAILED] Hasil create null");
        }
    
        bccol.postMessage({ type: 'COLLECTION_CREATED', data: collection });
        bccol.close();
    
        // Proses root level dulu (tabs di koleksi)
        await this.processRecursive(colData, collection.id, workspaceId, userId);
    },

    async processRecursive(item, collectionId, workspaceId, userId, parentId = null) {
        // 1. KUMPULKAN REQUEST (dari tabs atau dari requests di dalam folder)
        let requestsToProcess = [];
        
        if (parentId === null) {
            // Jika di root koleksi, ambil dari tabs
            requestsToProcess = (item.tabs || []).filter(tab => tab.folderId === null);
        } else {
            // Jika di dalam folder, ambil dari array 'requests' milik folder tersebut
            requestsToProcess = (item.requests || []);
        }
    
        // 2. INSERT REQUEST
        for (const reqData of requestsToProcess) {
            // Pastikan body adalah string untuk menghindari error deserialisasi
            const bodyContent = typeof reqData.body === 'string' ? reqData.body : (reqData.body?.raw || "");
            
            const request = await RequestService.create({
                collection_id: collectionId,
                workspace_id: workspaceId,
                folder_id: parentId,
                name: reqData.name,
                method: reqData.method,
                url: typeof reqData.url === 'string' ? reqData.url : (reqData.url?.raw || ""),
                body: bodyContent,
                body_mode: reqData.body_mode || (reqData.body?.mode || "none"),
                auth_type: reqData.auth?.type || reqData.auth_type || "",
                auth_value: reqData.auth?.value || reqData.auth_value || "",
                pre_script: reqData.scripts?.pre || reqData.pre_script || "",
                post_script: reqData.scripts?.post || reqData.post_script || ""
            });
    
            if (request && request.id) {
                await this.insertRequestDetails(request.id, reqData);
            }
        }
    
        // 3. PROSES SUB-FOLDER (Rekursif)
        if (item.folders && item.folders.length > 0) {
            for (const folderData of item.folders) {
                const newFolder = await FolderService.create(workspaceId, collectionId, parentId, folderData.name);
                
                // Teruskan data folderData agar anak-anaknya diproses
                await this.processRecursive(folderData, collectionId, workspaceId, userId, newFolder.id);
            }
        }
    },

    async insertRequestDetails(requestId, reqData) {
        // 1. Helper untuk memproses Params & Headers (berbentuk Object)
        const processMap = async (data, service) => {
            if (!data || typeof data !== 'object') return;
            
            // Menggunakan Object.entries untuk mendapatkan key dan value
            for (const [key, details] of Object.entries(data)) {
                // Pastikan details adalah objek sebelum mengakses propertinya
                if (typeof details === 'object') {
                    await service.create({ 
                        request_id: requestId, 
                        key: key, 
                        value: details.value || "", 
                        description: details.desc || details.description || "", 
                        enabled: details.enabled ?? true 
                    });
                }
            }
        };

        // 2. Helper untuk memproses Body Params (berbentuk Array)
        const processBody = async (items, modeOverride) => {
            if (!items || !Array.isArray(items)) return;
            for (const item of items) {
                await RequestBodyParamService.create({
                    request_id: requestId,
                    key: item.key || "",
                    value: item.value || "",
                    file_name: item.file_name || null,
                    description: item.description || "",
                    type: item.type || "text",
                    mode: modeOverride || item.mode || "formdata",
                    enabled: item.enabled ?? true,
                    sort_order: item.sort_order ?? 0
                });
            }
        };

        // EKSEKUSI
        // Proses Params
        await processMap(reqData.params || reqData._params, RequestParamService);
        
        // Proses Headers
        await processMap(reqData.headers || reqData._headers, RequestHeaderService);

        // Proses Body (Form-data & Urlencoded)
        if (reqData.body) {
            if (reqData.body.formData && reqData.body.formData.length > 0) {
                await processBody(reqData.body.formData, "formdata");
            }
            if (reqData.body.urlencoded && reqData.body.urlencoded.length > 0) {
                await processBody(reqData.body.urlencoded, "urlencoded");
            }
        }
    }
};