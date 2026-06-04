import { RequestService } from "../request-service.js";
import { FolderService } from "../folder-service.js";
// Import service detail lainnya...
import { RequestParamService } from "../request-param-service.js";
import { RequestHeaderService } from "../request-header-service.js";
import { RequestBodyParamService } from "../request-body-param-service.js";

export class CollectionAggregator {
    
    static async getFullCollectionData(collectionId) {
        // 1. Ambil requests & folders menggunakan method yang sudah ada
        // folderId null untuk mengambil semua request dalam koleksi
        const requests = await RequestService.getByCollection(collectionId, null);
        const folders = await FolderService.getByCollection(collectionId);
        
        // 2. Perkaya setiap request dengan detail (params, headers, body)
        const fullRequests = await Promise.all(requests.map(async (req) => {
            // Asumsi: method-method ini tersedia di service detail kamu
            const [params, headers, bodyParams] = await Promise.all([
                RequestParamService.getByRequest(req.id),
                RequestHeaderService.getByRequest(req.id),
                RequestBodyParamService.getByRequest(req.id)
            ]);

            return {
                ...req,
                params,
                headers,
                bodyParams
            };
        }));

        // 3. Susun menjadi struktur
        return {
            folders: this.buildFolderTree(folders, fullRequests),
            rootRequests: fullRequests.filter(r => !r.folder_id)
        };
    }

    static buildFolderTree(folders, requests) {
        return folders.map(folder => ({
            ...folder,
            requests: requests.filter(r => r.folder_id === folder.id)
        }));
    }
}