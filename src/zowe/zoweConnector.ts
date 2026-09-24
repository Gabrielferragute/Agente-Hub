import * as vscode from 'vscode';
import { Get, List } from '@zowe/zos-files-for-zowe-sdk';

export interface ZoweContextResult {
    sourceType: 'dataset' | 'member' | 'job' | 'spool' | 'uss';
    sourceIdentifier: string;
    charsRetrieved: number;
    charsSentToLlm: number;
    truncated: boolean;
    content: string;
    error?: string;
}

export interface JobSpoolFile {
    jobId: string;
    jobName: string;
    spoolId: number;
    ddName: string;
}

export interface MainframeReadOnlyConnector {
    searchDataSets(pattern: string): Promise<string[]>;
    listDatasetMembers(datasetName: string): Promise<string[]>;
    readDatasetMember(datasetName: string, memberName: string): Promise<ZoweContextResult>;
    
    searchJobs(owner?: string, prefix?: string): Promise<any[]>;
    getJob(jobId: string, jobName: string): Promise<any>;
    getJobSpoolFilesList(jobId: string, jobName: string): Promise<JobSpoolFile[]>;
    readJobSpoolContent(jobId: string, jobName: string, spoolId: number, ddName: string): Promise<ZoweContextResult>;
    getJobJcl(jobId: string, jobName: string): Promise<ZoweContextResult>;

    listUss(path: string): Promise<string[]>;
    readUssFile(path: string): Promise<ZoweContextResult>;
}

const CONNECTOR_LIMITS = {
    MAX_CHARS_TO_LLM: 8000, 
    MAX_SPOOL_FILES_AUTO_FETCH: 3
};

class ZoweConnectorImpl implements MainframeReadOnlyConnector {

    /**
     * Obtém a instância da API Register do Zowe Explorer (exports da extensão).
     * Essa instância implementa IApiRegisterClient e IApiExplorerExtender.
     */
    private getZoweExplorerApi(): any {
        const ext = vscode.extensions.getExtension('Zowe.vscode-extension-for-zowe');
        if (!ext) throw new Error('Zowe Explorer não está instalado');
        if (!ext.isActive) throw new Error('Zowe Explorer não está ativo');
        if (!ext.exports) throw new Error('Zowe Explorer exports indisponível');
        return ext.exports;
    }

    /**
     * Obtém o IProfileLoaded do profile zosmf default usando o ProfilesCache
     * gerenciado pelo próprio Zowe Explorer.
     * 
     * Fluxo:
     *   zoweApi.getExplorerExtenderApi() → IApiExplorerExtender
     *   → getProfilesCache() → ProfilesCache
     *   → getDefaultProfile("zosmf") → IProfileLoaded
     *
     * O ProfilesCache já resolve herança de team config, base profiles
     * e secure credentials internamente. Nenhuma manipulação manual necessária.
     */
    private getDefaultZosmfProfile(): any {
        const zoweApi = this.getZoweExplorerApi();
        
        const extenderApi = zoweApi.getExplorerExtenderApi();
        if (!extenderApi) throw new Error('getExplorerExtenderApi() retornou null');
        
        const profilesCache = extenderApi.getProfilesCache();
        if (!profilesCache) throw new Error('getProfilesCache() retornou null');
        
        const profile = profilesCache.getDefaultProfile('zosmf');
        if (!profile) throw new Error('Nenhum profile zosmf default encontrado no ProfilesCache');
        
        return profile;
    }

    /**
     * Obtém a API tipada (MVS, JES ou USS) através do caminho público:
     *   zoweApi.getMvsApi(profile) → MainframeInteraction.IMvs
     *   zoweApi.getJesApi(profile) → MainframeInteraction.IJes
     *   zoweApi.getUssApi(profile) → MainframeInteraction.IUss
     *
     * O Zowe Explorer instancia internamente a classe correta com a sessão
     * já configurada (host, credenciais, proxy). Nós não tocamos em nada.
     */
    private getApi(type: 'mvs' | 'jes' | 'uss'): any {
        const zoweApi = this.getZoweExplorerApi();
        const profile = this.getDefaultZosmfProfile();
        
        switch (type) {
            case 'mvs': return zoweApi.getMvsApi(profile);
            case 'jes': return zoweApi.getJesApi(profile);
            case 'uss': return zoweApi.getUssApi(profile);
        }
    }
    async searchDataSets(pattern: string): Promise<string[]> { return []; }
    async listDatasetMembers(datasetName: string): Promise<string[]> {
        const api = this.getApi('mvs');
        try {
            const session = api.getSession();
            const response = await List.allMembers(session, datasetName.toUpperCase());
            if (response && response.apiResponse && response.apiResponse.items) {
                return response.apiResponse.items.map((item: any) => item.member);
            }
            return [];
        } catch (error) {
            console.error(`[ZoweConnector] Erro ao listar membros de ${datasetName}:`, error);
            return [];
        }
    }
    async readDatasetMember(datasetName: string, memberName: string): Promise<ZoweContextResult> {
        const api = this.getApi('mvs');
        const fullName = `${datasetName.toUpperCase()}(${memberName.toUpperCase()})`;
        
        try {
            const session = api.getSession();
            const response = await Get.dataSet(session, fullName);
            
            let content = '';
            if (Buffer.isBuffer(response)) {
                content = response.toString('utf8');
            } else if (typeof response === 'string') {
                content = response;
            } else {
                content = JSON.stringify(response);
            }

            const charsRetrieved = content.length;
            let truncated = false;
            
            if (content.length > CONNECTOR_LIMITS.MAX_CHARS_TO_LLM) {
                content = content.substring(0, CONNECTOR_LIMITS.MAX_CHARS_TO_LLM) + '\n... [TRUNCADO PELO CONNECTOR - Limite atingido]';
                truncated = true;
            }
            
            return {
                sourceType: 'member',
                sourceIdentifier: fullName,
                charsRetrieved,
                charsSentToLlm: content.length,
                truncated,
                content
            };
        } catch (error: any) {
            return {
                sourceType: 'member',
                sourceIdentifier: fullName,
                charsRetrieved: 0,
                charsSentToLlm: 0,
                truncated: false,
                content: '',
                error: error.message || String(error)
            };
        }
    }
    async searchJobs(owner?: string, prefix?: string): Promise<any[]> { return []; }
    async getJob(jobId: string, jobName: string): Promise<any> { throw new Error('stub'); }
    async getJobSpoolFilesList(jobId: string, jobName: string): Promise<JobSpoolFile[]> { return []; }
    async readJobSpoolContent(jobId: string, jobName: string, spoolId: number, ddName: string): Promise<ZoweContextResult> { throw new Error('stub'); }
    async getJobJcl(jobId: string, jobName: string): Promise<ZoweContextResult> { throw new Error('stub'); }
    async listUss(path: string): Promise<string[]> { return []; }
    async readUssFile(path: string): Promise<ZoweContextResult> { throw new Error('stub'); }
}

export const zoweConnector = new ZoweConnectorImpl();

// ------------------------------------------------------------------------
// MÉTODOS DE COMPATIBILIDADE PARA O INTENT ROUTER (Serão ajustados)
// ------------------------------------------------------------------------

export async function readJobSpool(jobId: string, spoolDdName?: string): Promise<any> {
    return null;
}

export async function readDatasetMember(datasetName: string, memberName?: string): Promise<any> {
    return null;
}

export function formatZoweContext(type: 'member' | 'spool', data: any): string {
    return '';
}
