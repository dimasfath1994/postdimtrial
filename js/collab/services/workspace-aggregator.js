import { CollectionService } from "../collection-service.js";
import { EnvService } from "../env-service.js";
import { GlobalService } from "../global-service.js";
import { RequestService } from "../request-service.js";
import { FolderService } from "../folder-service.js";
import { RequestParamService } from "../request-param-service.js";
import { RequestHeaderService } from "../request-header-service.js";
import { RequestBodyParamService } from "../request-body-param-service.js";

export const WorkspaceAggregator = {

    async getFullWorkspaceData(workspaceId) {
        try {
            const [collections, environments, globals] = await Promise.all([
                CollectionService.getByWorkspace(workspaceId),
                EnvService.getByWorkspace(workspaceId),
                GlobalService.getAll()
            ]);

            const processedCollections = await Promise.all(
                collections.map(async (col) => {
                    const [folders, requests] = await Promise.all([
                        FolderService.getByCollection(col.id),
                        RequestService.getByCollection(col.id)
                    ]);

                    const fullRequests = await Promise.all(
                        requests.map(req => this.hydrateRequest(req))
                    );

                    return {
                        id: col.id,
                        name: col.name,
                        environment: col.environment || {},
                        activeTabId: col.activeTabId || null,
                        folders: (folders || []).map(f => ({
                            id: f.id,
                            name: f.name,
                            folders: f.folders || [],
                            requests: fullRequests.filter(req => 
                                String(req.folder_id || req.folderId) === String(f.id)
                            )
                        })),
                        requests: [], 
                        tabs: fullRequests.map(req => this.formatRequestForImport(req))
                    };
                })
            );

            return {
                tabs: processedCollections.flatMap(c => c.tabs),
                collections: processedCollections,
                environment: environments || {},
                globals: globals || []
            };
        } catch (error) {
            console.error("[WorkspaceAggregator Error]", error);
            throw error;
        }
    },

    async hydrateRequest(req) {
        const [params, headers, bodyParams] = await Promise.all([
            RequestParamService.getByRequest(req.id),
            RequestHeaderService.getByRequest(req.id),
            RequestBodyParamService.getByRequest(req.id)
        ]);

        return {
            ...req,
            _params: params || [],
            _headers: headers || [],
            _bodyParams: bodyParams || []
        };
    },

    formatRequestForImport(req) {
        // Konversi array ke format object untuk params
        const formattedParams = (req._params || []).reduce((acc, p) => {
            acc[p.key] = { value: p.value || "", desc: p.desc || "", enabled: !!p.enabled };
            return acc;
        }, {});

        // Konversi array ke format object untuk headers
        const formattedHeaders = (req._headers || []).reduce((acc, h) => {
            acc[h.key] = { value: h.value || "", enabled: !!h.enabled };
            return acc;
        }, {});

        const bodyMode = req.body_mode || "none";
        
        return {
            id: req.id || Date.now(),
            name: req.name || "Untitled",
            method: req.method || "GET",
            url: req.url || "",
            body: {
                mode: bodyMode,
                raw: req.body || "",
                formData: bodyMode === "form-data" ? req._bodyParams : [],
                urlencoded: bodyMode === "urlencoded" ? req._bodyParams : []
            },
            params: formattedParams,
            headers: formattedHeaders,
            auth: {
                type: req.auth_type || "",
                value: req.auth_value || ""
            },
            scripts: {
                pre: req.pre_script || "",
                post: req.post_script || ""
            },
            history: Array.isArray(req.history) ? req.history : [],
            pinned: req.pinned ? true : false,
            collectionId: req.collection_id || req.collectionId || null,
            folderId: req.folder_id || req.folderId || null
        };
    }
};