import * as vscode from 'vscode';
import { Get, List } from '@zowe/zos-files-for-zowe-sdk';

import {
    ProfileSelectionContext,
    EnvironmentClass,
    ProductionAccessDeniedError,
    ProfileNotFoundError
} from './profileTypes';

// ════════════════════════════════════════════════════════════════
// INTERFACES PÚBLICAS
// ════════════════════════════════════════════════════════════════

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

/**
 * Interface do connector estritamente READ-ONLY.
 * 
 * REGRAS:
 *   - Todos os métodos recebem ProfileSelectionContext como primeiro parâmetro.
 *   - O contexto é resolvido UMA VEZ pelo ProfileResolver, antes de qualquer chamada.
 *   - Nenhum método de escrita, submissão ou execução é permitido.
 *   - Credenciais, sessão, host e token nunca saem do connector.
 *   - Erros do Zowe SDK são sanitizados para não vazar dados sensíveis.
 */
export interface MainframeReadOnlyConnector {
    searchDataSets(ctx: ProfileSelectionContext, pattern: string): Promise<string[]>;
    listDatasetMembers(ctx: ProfileSelectionContext, datasetName: string): Promise<string[]>;
    readDatasetMember(ctx: ProfileSelectionContext, datasetName: string, memberName: string): Promise<ZoweContextResult>;
    
    searchJobs(ctx: ProfileSelectionContext, owner?: string, prefix?: string): Promise<any[]>;
    getJob(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<any>;
    getJobSpoolFilesList(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<JobSpoolFile[]>;
    readJobSpoolContent(ctx: ProfileSelectionContext, jobId: string, jobName: string, spoolId: number, ddName: string): Promise<ZoweContextResult>;
    getJobJcl(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<ZoweContextResult>;

    listUss(ctx: ProfileSelectionContext, path: string): Promise<string[]>;
    readUssFile(ctx: ProfileSelectionContext, path: string): Promise<ZoweContextResult>;
}

// ════════════════════════════════════════════════════════════════
// LIMITES
// ════════════════════════════════════════════════════════════════

const CONNECTOR_LIMITS = {
    MAX_CHARS_TO_LLM: 8000, 
    MAX_SPOOL_FILES_AUTO_FETCH: 3
};

// ════════════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO
// ════════════════════════════════════════════════════════════════

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
     * Valida o ProfileSelectionContext antes de qualquer operação.
     * 
     * Verificações:
     *   1. Profile existe no cache do Zowe Explorer.
     *   2. Se PROD, isConfirmed deve ser true.
     * 
     * Nenhum dado sensível é acessado neste método.
     */
    private validateContext(ctx: ProfileSelectionContext): void {
        const available = this.getAvailableProfileNames();
        if (!available.includes(ctx.profileName)) {
            throw new ProfileNotFoundError(ctx.profileName);
        }

        if (ctx.environmentClass === EnvironmentClass.PROD && !ctx.isConfirmed) {
            throw new ProductionAccessDeniedError(ctx.profileName);
        }
    }

    /**
     * Retorna os nomes dos profiles disponíveis no cache do Zowe Explorer.
     * Apenas nomes — sem credenciais, sessão ou host.
     */
    private getAvailableProfileNames(): string[] {
        try {
            const zoweApi = this.getZoweExplorerApi();
            const extenderApi = zoweApi.getExplorerExtenderApi?.();
            if (!extenderApi) { return []; }

            const profilesCache = extenderApi.getProfilesCache?.();
            if (!profilesCache) { return []; }

            const profiles = profilesCache.getProfiles?.('zosmf');
            if (!Array.isArray(profiles)) { return []; }

            return profiles
                .map((p: any) => p?.name || p?.profName || '')
                .filter((name: string) => name.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * Obtém a API tipada (MVS, JES ou USS) usando o profile name do contexto.
     *
     * Busca o profile pelo NOME no ProfilesCache (não pelo "default"),
     * depois obtém a API correspondente via Zowe Explorer.
     *
     * O Zowe Explorer instancia internamente a classe correta com a sessão
     * já configurada (host, credenciais, proxy). Nós não tocamos em nada.
     * A sessão NUNCA sai deste método.
     */
    private getApi(ctx: ProfileSelectionContext, type: 'mvs' | 'jes' | 'uss'): any {
        this.validateContext(ctx);

        const zoweApi = this.getZoweExplorerApi();
        const extenderApi = zoweApi.getExplorerExtenderApi();
        if (!extenderApi) throw new Error('getExplorerExtenderApi() retornou null');

        const profilesCache = extenderApi.getProfilesCache();
        if (!profilesCache) throw new Error('getProfilesCache() retornou null');

        // Busca pelo NOME do profile, não pelo "default"
        const profile = profilesCache.loadNamedProfile(ctx.profileName, 'zosmf');
        if (!profile) {
            throw new ProfileNotFoundError(ctx.profileName);
        }

        switch (type) {
            case 'mvs': return zoweApi.getMvsApi(profile);
            case 'jes': return zoweApi.getJesApi(profile);
            case 'uss': return zoweApi.getUssApi(profile);
        }
    }

    /**
     * Sanitiza mensagens de erro do Zowe SDK para não vazar dados sensíveis.
     * Mensagens podem conter hostname, URL, username, etc.
     * Retorna uma versão genérica com apenas o nome do profile e um código.
     */
    private sanitizeError(ctx: ProfileSelectionContext, error: any): string {
        // Extrair código de erro se disponível
        const code = error?.causeErrors?.code || error?.code || 'UNKNOWN';
        return `Falha ao acessar recurso via profile "${ctx.profileName}". Código: ${code}`;
    }

    // ════════════════════════════════════════════════════════════
    // MÉTODOS READ-ONLY
    // ════════════════════════════════════════════════════════════

    async searchDataSets(ctx: ProfileSelectionContext, pattern: string): Promise<string[]> {
        this.validateContext(ctx);
        return [];
    }

    async listDatasetMembers(ctx: ProfileSelectionContext, datasetName: string): Promise<string[]> {
        const api = this.getApi(ctx, 'mvs');
        try {
            const session = api.getSession();
            const response = await List.allMembers(session, datasetName.toUpperCase());
            if (response && response.apiResponse && response.apiResponse.items) {
                return response.apiResponse.items.map((item: any) => item.member);
            }
            return [];
        } catch (error) {
            console.error(`[ZoweConnector] Erro ao listar membros (profile: ${ctx.profileName}):`, this.sanitizeError(ctx, error));
            return [];
        }
    }

    async readDatasetMember(ctx: ProfileSelectionContext, datasetName: string, memberName: string): Promise<ZoweContextResult> {
        const api = this.getApi(ctx, 'mvs');
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
                error: this.sanitizeError(ctx, error)
            };
        }
    }

    async searchJobs(ctx: ProfileSelectionContext, owner?: string, prefix?: string): Promise<any[]> {
        this.validateContext(ctx);
        return [];
    }

    async getJob(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<any> {
        this.validateContext(ctx);
        throw new Error('stub');
    }

    async getJobSpoolFilesList(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<JobSpoolFile[]> {
        this.validateContext(ctx);
        return [];
    }

    async readJobSpoolContent(ctx: ProfileSelectionContext, jobId: string, jobName: string, spoolId: number, ddName: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('stub');
    }

    async getJobJcl(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('stub');
    }

    async listUss(ctx: ProfileSelectionContext, path: string): Promise<string[]> {
        this.validateContext(ctx);
        return [];
    }

    async readUssFile(ctx: ProfileSelectionContext, path: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('stub');
    }
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
