import { WorkspaceService } from "../workspace-service.js";
import { CollectionService } from "../collection-service.js";
import { FolderService } from "../folder-service.js";
import { RequestService } from "../request-service.js";
import { RequestParamService } from "../request-param-service.js";
import { RequestHeaderService } from "../request-header-service.js";
import { RequestBodyParamService } from "../request-body-param-service.js";

export const ImportPostmanInserter = {

    async import(data, mode, activeWorkspaceId = null, userId = null) {
        try {
            let wsId = activeWorkspaceId;

            // 1. Jika mode workspace, buat workspace baru dulu
            if (mode === 'workspace') {
                const bcws = new BroadcastChannel('workspace_channel');
                const workspace = await WorkspaceService.createWorkspace(data.info?.name || "Imported Postman Workspace");
                
                wsId = workspace.id || workspace.data?.id;
                if (!wsId) throw new Error("Gagal membuat workspace baru");

                bcws.postMessage({ type: 'WORKSPACE_CREATED', id: wsId, data: workspace });
                bcws.close();
            }

            if (!wsId) throw new Error("Workspace ID tidak ditemukan!");

            // 2. Buat Collection
            const collection = await CollectionService.create(wsId, data.info?.name || "Postman Collection");
            if (!collection || !collection.id) throw new Error("Gagal membuat koleksi");

            // 3. Traversal Rekursif (khas Postman)
            await this.traverseItems(data.item, collection.id, wsId, null);
            
            return { success: true, workspaceId: wsId, collectionId: collection.id };
        } catch (error) {
            console.error("[ImportPostmanInserter Error]", error);
            throw error;
        }
    },

    async traverseItems(items, collectionId, workspaceId, parentId) {
        if (!items || !Array.isArray(items)) return;

        for (const item of items) {
            if (item.request) {
                // LOGIC: CREATE REQUEST
                const request = await RequestService.create({
                    collection_id: collectionId,
                    workspace_id: workspaceId,
                    folder_id: parentId,
                    name: item.name,
                    method: item.request.method,
                    url: typeof item.request.url === 'string' ? item.request.url : (item.request.url?.raw || ""),
                    body: item.request.body?.raw || "",
                    body_mode: item.request.body?.mode || "none",
                    auth_type: item.request.auth?.type || "",
                    auth_value: item.request.auth?.value || ""
                });

                if (request && request.id) {
                    await this.insertPostmanDetails(request.id, item.request);
                }
            } else if (item.item) {
                // LOGIC: CREATE FOLDER
                const newFolder = await FolderService.create(workspaceId, collectionId, parentId, item.name);
                await this.traverseItems(item.item, collectionId, workspaceId, newFolder.id);
            }
        }
    },

    async insertPostmanDetails(requestId, req) {
        // Proses Params, Headers, Body (Sama seperti versi sebelumnya)
        if (req.url?.query && Array.isArray(req.url.query)) {
            for (const p of req.url.query) {
                await RequestParamService.create({
                    request_id: requestId,
                    key: p.key || "",
                    value: p.value || "",
                    description: p.description || "",
                    enabled: !p.disabled
                });
            }
        }

        if (req.header && Array.isArray(req.header)) {
            for (const h of req.header) {
                await RequestHeaderService.create({
                    request_id: requestId,
                    key: h.key,
                    value: h.value,
                    enabled: !h.disabled
                });
            }
        }

        const processBody = async (items, mode) => {
            if (!items || !Array.isArray(items)) return;
            for (const item of items) {
                await RequestBodyParamService.create({
                    request_id: requestId,
                    key: item.key || "",
                    value: item.value || "",
                    file_name: item.src || null,
                    description: item.description || "",
                    type: item.type || "text",
                    mode: mode,
                    enabled: !item.disabled,
                    sort_order: 0
                });
            }
        };

        if (req.body) {
            if (req.body.mode === 'formdata' && req.body.formdata) processBody(req.body.formdata, "formdata");
            if (req.body.mode === 'urlencoded' && req.body.urlencoded) processBody(req.body.urlencoded, "urlencoded");
        }
    }
};