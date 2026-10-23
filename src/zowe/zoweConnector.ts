import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Get, List } from '@zowe/zos-files-for-zowe-sdk';
import { SubmitJobs, MonitorJobs, GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import {
    SrchforInput,
    SrchforJobCard,
    SrchforValidationError,
    SuperCInterpretation,
    buildSrchforJcl,
    interpretSuperCRetcode,
    validateDatasetInput
} from '../jobs/srchforTemplate';

import {
    assertDatasetReadable,
    resolvePolicy,
    GuardConfig,
    DatasetAccessDeniedError,
    denyQualifier
} from './datasetGuard';
import {
    loadBaseGuardConfig,
    applyWorkspaceDenyOnly,
    isProductionProfile,
    DENY_ALL,
    DEFAULT_NON_PROD
} from './policyLoader';
import { prepareForLlm } from '../context/smartTruncate';

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

export interface SrchforJobResult {
    jobId: string;
    jobName: string;
    retcode: string | null;
    status: string;
    interpretation: SuperCInterpretation;
    jcl: string;
    spool: string;
    spoolTruncated: boolean;
}

/** Espera máxima pelo OUTPUT do JOB: 100 tentativas x 3s = 5 minutos. */
const SRCHFOR_WAIT_ATTEMPTS = 100;
const SRCHFOR_WATCH_DELAY_MS = 3000;
const SPOOL_MAX_CHARS = 150000;

/**
 * Interface do connector estritamente READ-ONLY.
 * 
 * REGRAS:
 *   - Todos os métodos recebem ProfileSelectionContext como primeiro parâmetro.
 *   - O contexto é resolvido UMA VEZ pelo ProfileResolver, antes de qualquer chamada.
 *   - Nenhum método de escrita, submissão ou execução é permitido.
 *     (Única exceção, FORA desta interface: submitSrchforJob, que só aceita
 *     dataset + string e gera o JCL a partir de um template fixo.)
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
// IMPLEMENTAÇÃO
// ════════════════════════════════════════════════════════════════

class ZoweConnectorImpl implements MainframeReadOnlyConnector {
    private extensionPath: string = process.cwd();
    private fileCache = new Map<string, { mtime: number; content: string }>();

    /**
     * Define o caminho base da extensão (chamado no activate de extension.ts).
     */
    public setExtensionPath(extPath: string): void {
        this.extensionPath = extPath;
    }

    /**
     * Leitura de arquivo com cache baseado no timestamp de modificação (mtimeMs).
     * Evita re-leitura de disco a cada chamada se o arquivo não mudou.
     */
    private readCachedFile(filePath: string): string | undefined {
        try {
            if (!fs.existsSync(filePath)) {
                return undefined;
            }
            const stat = fs.statSync(filePath);
            const cached = this.fileCache.get(filePath);
            if (cached && cached.mtime === stat.mtimeMs) {
                return cached.content;
            }
            const content = fs.readFileSync(filePath, 'utf8');
            this.fileCache.set(filePath, { mtime: stat.mtimeMs, content });
            return content;
        } catch {
            return undefined;
        }
    }

    private getWorkspacePath(): string | undefined {
        const folders = vscode.workspace?.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
    }

    /**
     * Verifica se o profile atual deve ser tratado como Produção.
     * Fail-closed: só é não-produção se estiver explicitamente classificado
     * em DEV, TEST, HOM ou equivalente.
     */
    private isProduction(ctx: ProfileSelectionContext): boolean {
        if (ctx.environmentClass === EnvironmentClass.PROD) {
            return true;
        }

        // Tenta ler classificação do workspace ou da extensão
        let classificationsRaw: string | undefined;
        const wsPath = this.getWorkspacePath();
        if (wsPath) {
            classificationsRaw = this.readCachedFile(path.join(wsPath, 'config', 'profile-classification.json'));
        }
        if (!classificationsRaw) {
            classificationsRaw = this.readCachedFile(path.join(this.extensionPath, 'config', 'profile-classification.json'));
        }

        if (!classificationsRaw) {
            // Sem arquivo de classificação => fail-closed: assume PROD se não for explicitamente DEV no contexto
            return ctx.environmentClass !== EnvironmentClass.DEV;
        }

        try {
            const parsed = JSON.parse(classificationsRaw);
            const profilesMap = (parsed && typeof parsed === 'object' && parsed.profiles) ? parsed.profiles : parsed;
            return isProductionProfile(profilesMap, ctx.profileName, DEFAULT_NON_PROD);
        } catch {
            return true; // JSON inválido => fail-closed assume PROD
        }
    }

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
     * Obtém a política de acesso a datasets combinando a política base (extensão)
     * com a política do workspace (que pode apenas endurecer / adicionar deny).
     */
    private getGuardConfig(ctx: ProfileSelectionContext): GuardConfig {
        const isDev = !this.isProduction(ctx);
        const allowDev = [
            '**.COBOL', '**.CBL', '**.JCL',
            '**.COPY', '**.COPYLIB', '**.CPY', '**.COPYBOOK',
            '**.MACRO', '**.SRC', '**.SOURCE'
        ];

        // MVP Default: allow liberado para fontes apenas em DEV; denylist bloqueia dados em qualquer posição
        const mvpDefault: GuardConfig = {
            default: {
                allow: isDev ? allowDev : [],
                deny: [...denyQualifier('DADOS*'), ...denyQualifier('DATA*')]
            }
        };

        // 1. Carrega base policy da extensão
        const basePolicyPath = path.join(this.extensionPath, 'config', 'guard-policy.json');
        const baseRaw = this.readCachedFile(basePolicyPath);
        const baseResult = loadBaseGuardConfig(baseRaw, mvpDefault);
        if (baseResult.problem) {
            console.warn(`[ZoweConnector] ${baseResult.problem}`);
        }

        // 2. Aplica deny-only do workspace, se existir
        const wsPath = this.getWorkspacePath();
        if (wsPath) {
            const wsPolicyPath = path.join(wsPath, 'config', 'guard-policy.json');
            const wsRaw = this.readCachedFile(wsPolicyPath);
            const mergedResult = applyWorkspaceDenyOnly(baseResult.config, wsRaw);
            if (mergedResult.problem) {
                console.warn(`[ZoweConnector] ${mergedResult.problem}`);
            }
            return mergedResult.config;
        }

        return baseResult.config;
    }

    private validateContext(ctx: ProfileSelectionContext): void {
        const available = this.getAvailableProfileNames();
        if (!available.includes(ctx.profileName)) {
            throw new ProfileNotFoundError(ctx.profileName);
        }

        const isProd = this.isProduction(ctx);
        if (isProd && !ctx.isConfirmed) {
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
        try {
            const { dataset } = assertDatasetReadable(datasetName, undefined, resolvePolicy(this.getGuardConfig(ctx), ctx.profileName));
            const api = this.getApi(ctx, 'mvs');
            const session = api.getSession();
            const response = await List.allMembers(session, dataset);
            if (response && response.apiResponse && response.apiResponse.items) {
                return response.apiResponse.items.map((item: any) => item.member);
            }
            return [];
        } catch (error) {
            console.error(`[ZoweConnector] Erro ao listar membros (profile: ${ctx.profileName}):`, this.sanitizeError(ctx, error));
            throw new Error(this.sanitizeError(ctx, error));
        }
    }

    async readDatasetMember(ctx: ProfileSelectionContext, datasetName: string, memberName: string): Promise<ZoweContextResult> {
        let fullName = `${datasetName ?? ''}(${memberName ?? ''})`;
        try {
            if (!datasetName || !memberName) {
                throw new DatasetAccessDeniedError('INVALID_NAME', 'Dataset ou membro não especificado.');
            }
            fullName = `${datasetName.toUpperCase()}(${memberName.toUpperCase()})`;
            const { dataset, member } = assertDatasetReadable(datasetName, memberName, resolvePolicy(this.getGuardConfig(ctx), ctx.profileName));
            fullName = `${dataset}(${member})`;
            
            const api = this.getApi(ctx, 'mvs');
            const session = api.getSession();
            const response = await Get.dataSet(session, fullName);
            
            let content = '';
            if (Buffer.isBuffer(response)) {
                content = response.toString('utf8');
            } else if (typeof response === 'string') {
                content = response;
            } else {
                throw new Error(`Resposta inesperada do Zowe ao ler membro (tipo: ${typeof response}). Esperava texto.`);
            }

            const charsRetrieved = content.length;
            const isTruncated = content.length > 150000;
            const textToKeep = content.slice(0, 150000);
            const finalContent = isTruncated
                ? `*** NOTA DO CONNECTOR: Conteúdo truncado no limite de segurança de 150.000 caracteres (${charsRetrieved} caracteres no mainframe). ***\n\n${textToKeep}`
                : textToKeep;
            
            return {
                sourceType: 'member',
                sourceIdentifier: fullName,
                charsRetrieved,
                charsSentToLlm: finalContent.length,
                truncated: isTruncated,
                content: finalContent
            };
        } catch (error: any) {
            if (error instanceof DatasetAccessDeniedError) {
                return {
                    sourceType: 'member',
                    sourceIdentifier: fullName,
                    charsRetrieved: 0,
                    charsSentToLlm: 0,
                    truncated: false,
                    content: '',
                    error: `Acesso negado: ${error.message}`
                };
            }
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
        throw new Error('Não implementado');
    }

    async getJobSpoolFilesList(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<JobSpoolFile[]> {
        this.validateContext(ctx);
        return [];
    }

    async readJobSpoolContent(ctx: ProfileSelectionContext, jobId: string, jobName: string, spoolId: number, ddName: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('Não implementado');
    }

    async readJobAllSpool(ctx: ProfileSelectionContext, jobId: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        try {
            const session = this.getApi(ctx, 'jes').getSession();
            const jobInfo = await GetJobs.getJob(session, jobId);
            const files = await GetJobs.getSpoolFiles(session, jobInfo.jobname, jobInfo.jobid);
            const parts: string[] = [];
            for (const f of files) {
                const content = await GetJobs.getSpoolContentById(session, jobInfo.jobname, jobInfo.jobid, f.id);
                const header = `==================== ${f.ddname}${f.stepname ? ` (${f.stepname})` : ''} ====================`;
                parts.push(`${header}\n${content}`);
            }
            const fullSpool = parts.join('\n');
            const isTruncated = fullSpool.length > 150000;
            const finalContent = isTruncated
                ? `${fullSpool.slice(0, 150000)}\n\n*** Spool truncado no limite de segurança de 150.000 caracteres ***`
                : fullSpool;

            return {
                sourceType: 'spool',
                sourceIdentifier: `${jobInfo.jobname}(${jobInfo.jobid})`,
                charsRetrieved: fullSpool.length,
                charsSentToLlm: finalContent.length,
                truncated: isTruncated,
                content: finalContent
            };
        } catch (error) {
            console.error(`[ZoweConnector] Erro ao ler spool do job ${jobId}:`, this.sanitizeError(ctx, error));
            throw new Error(this.sanitizeError(ctx, error));
        }
    }

    async getJobJcl(ctx: ProfileSelectionContext, jobId: string, jobName: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('Não implementado');
    }

    async listUss(ctx: ProfileSelectionContext, path: string): Promise<string[]> {
        this.validateContext(ctx);
        return [];
    }

    async readUssFile(ctx: ProfileSelectionContext, path: string): Promise<ZoweContextResult> {
        this.validateContext(ctx);
        throw new Error('Não implementado');
    }

    // ════════════════════════════════════════════════════════════
    // EXCEÇÃO CONTROLADA: SUBMIT DO TEMPLATE SRCHFOR (SuperC)
    // ════════════════════════════════════════════════════════════

    /**
     * Submete o JOB de busca SuperC a partir do template fixo.
     *
     * Proteções:
     *   - Recebe só dataset + string; o JCL é gerado por buildSrchforJcl (nunca JCL livre).
     *   - Bloqueado em profile de Produção ou não classificado (fail-closed).
     *   - O dataset passa pelo datasetGuard (allowlist/denylist), igual às leituras.
     *   - Espera limitada (5 min) e spool truncado em 150.000 caracteres.
     */
    async submitSrchforJob(
        ctx: ProfileSelectionContext,
        input: SrchforInput,
        jobCard: Partial<SrchforJobCard>,
        onProgress?: (message: string) => void
    ): Promise<SrchforJobResult> {
        if (this.isProduction(ctx)) {
            throw new SrchforValidationError(
                `Submit de JOB bloqueado no profile "${ctx.profileName}": ele é Produção ou não está classificado. ` +
                'Classifique-o como DEV/TEST em config/profile-classification.json.'
            );
        }

        const { dataset } = assertDatasetReadable(
            validateDatasetInput(input.dataset),
            undefined,
            resolvePolicy(this.getGuardConfig(ctx), ctx.profileName)
        );
        const jcl = buildSrchforJcl({ dataset, searchString: input.searchString }, jobCard);

        try {
            const session = this.getApi(ctx, 'jes').getSession();

            onProgress?.('Submetendo JOB...');
            const submitted = await SubmitJobs.submitJcl(session, jcl);

            onProgress?.(`JOB ${submitted.jobid} submetido. Aguardando OUTPUT...`);
            let done;
            try {
                done = await MonitorJobs.waitForStatusCommon(session, {
                    jobid: submitted.jobid,
                    jobname: submitted.jobname,
                    status: 'OUTPUT',
                    attempts: SRCHFOR_WAIT_ATTEMPTS,
                    watchDelay: SRCHFOR_WATCH_DELAY_MS
                });
            } catch {
                throw new SrchforValidationError(
                    `JOB ${submitted.jobname}/${submitted.jobid} foi submetido, mas não chegou a OUTPUT em 5 minutos. ` +
                    'Acompanhe pelo Zowe Explorer (Jobs).'
                );
            }

            onProgress?.(`Lendo spool do JOB ${done.jobid}...`);
            const files = await GetJobs.getSpoolFiles(session, done.jobname, done.jobid);
            const parts: string[] = [];
            for (const f of files) {
                const content = await GetJobs.getSpoolContentById(session, done.jobname, done.jobid, f.id);
                const header = `==================== ${f.ddname}${f.stepname ? ` (${f.stepname})` : ''} ====================`;
                parts.push(`${header}\n${content}`);
            }

            const fullSpool = parts.join('\n');
            const spoolTruncated = fullSpool.length > SPOOL_MAX_CHARS;
            const spool = spoolTruncated
                ? `${fullSpool.slice(0, SPOOL_MAX_CHARS)}\n\n*** Spool truncado em ${SPOOL_MAX_CHARS} caracteres (total: ${fullSpool.length}). ***`
                : fullSpool;

            return {
                jobId: done.jobid,
                jobName: done.jobname,
                retcode: done.retcode ?? null,
                status: done.status,
                interpretation: interpretSuperCRetcode(done.retcode),
                jcl,
                spool,
                spoolTruncated
            };
        } catch (error) {
            if (error instanceof ProfileNotFoundError ||
                error instanceof ProductionAccessDeniedError ||
                error instanceof SrchforValidationError) {
                throw error;
            }
            console.error(`[ZoweConnector] Erro no submit SRCHFOR (profile: ${ctx.profileName}):`, this.sanitizeError(ctx, error));
            throw new Error(this.sanitizeError(ctx, error));
        }
    }
}

export const zoweConnector = new ZoweConnectorImpl();

// ------------------------------------------------------------------------
// MÉTODOS DE COMPATIBILIDADE PARA O INTENT ROUTER (Serão ajustados)
// ------------------------------------------------------------------------

export async function readJobSpool(jobId: string, spoolDdName?: string): Promise<any> {
    throw new Error('Não foi possível ler o recurso: função stub não implementada.');
}

export async function readDatasetMember(datasetName: string, memberName?: string): Promise<any> {
    throw new Error('Não foi possível ler o recurso: router deve prover o contexto ProfileSelectionContext.');
}

export function formatZoweContext(type: 'member' | 'spool', data: any): string {
    if (!data) return 'Contexto não carregado ou nulo.';
    return `Conteúdo do ${type}:\n${data}`;
}
