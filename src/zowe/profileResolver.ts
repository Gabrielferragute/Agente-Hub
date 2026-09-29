/**
 * profileResolver.ts
 * 
 * Cadeia de resolução de profiles do Zowe Profile Context v1.
 * 
 * Responsabilidades:
 *   - Aplicar a cadeia de precedência: RESOURCE_CONTEXT > EXPLICIT > WORKSPACE > SINGLE_AVAILABLE > AMBIGUOUS
 *   - Classificar o ambiente via config/profile-classification.json (nunca por inferência)
 *   - Exigir confirmação explícita para PROD, independente da fonte de seleção
 *   - Validar o profile resolvido contra o cache do Zowe Explorer
 *   - Retornar um ProfileSelectionContext frozen e imutável
 * 
 * NÃO faz:
 *   - Conexão ao Mainframe
 *   - Inferência de ambiente por nome, host, endereço ou HLQ
 *   - Exposição de credenciais, sessão, host ou token
 *   - Permitir que o LLM escolha o profile ou o ambiente
 *   - Usar o profile padrão do Zowe como fallback automático
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {
    EnvironmentClass,
    ProfileSelectionSource,
    ProfileSelectionContext,
    ResolveOptions,
    AmbiguousProfileError,
    NoProfileAvailableError,
    ProductionAccessDeniedError,
    ProfileNotFoundError
} from './profileTypes';

import { profilePinningManager } from './profilePinning';

// ════════════════════════════════════════════════════════════════
// INTERFACE PÚBLICA
// ════════════════════════════════════════════════════════════════

export interface ProfileResolver {
    /**
     * Resolve o profile seguindo a cadeia de precedência.
     * Deve ser chamado UMA ÚNICA VEZ no início de cada operação.
     *
     * @returns ProfileSelectionContext frozen e validado
     * @throws NoProfileAvailableError — nenhum profile encontrado
     * @throws AmbiguousProfileError — múltiplos profiles sem critério de seleção
     * @throws ProductionAccessDeniedError — PROD sem confirmação
     * @throws ProfileNotFoundError — profile resolvido não existe no cache
     */
    resolveProfile(options?: ResolveOptions): Promise<ProfileSelectionContext>;

    /**
     * Retorna a classificação de ambiente para um profile name.
     * Consulta APENAS o config/profile-classification.json.
     * Retorna UNKNOWN se não encontrado ou se o arquivo não existir.
     */
    getEnvironmentClass(profileName: string): EnvironmentClass;

    /**
     * Retorna a lista de profile names disponíveis no cache do Zowe Explorer.
     * Usado internamente e exposto para QuickPick e testes.
     */
    getAvailableProfiles(): string[];
}

// ════════════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Formato esperado do config/profile-classification.json
 */
interface ClassificationConfig {
    profiles: Record<string, string>;
}

class ProfileResolverImpl implements ProfileResolver {

    /**
     * Cache da classificação de profiles, lido do arquivo de configuração.
     * Recarregado a cada resolução para refletir mudanças sem reiniciar.
     */
    private loadClassificationConfig(): Record<string, EnvironmentClass> {
        try {
            // Busca o arquivo relativo ao workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {};
            }

            const configPath = path.join(
                workspaceFolders[0].uri.fsPath,
                'config',
                'profile-classification.json'
            );

            if (!fs.existsSync(configPath)) {
                return {};
            }

            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed: ClassificationConfig = JSON.parse(raw);

            if (!parsed.profiles || typeof parsed.profiles !== 'object') {
                return {};
            }

            const result: Record<string, EnvironmentClass> = {};
            const validClasses = new Set(['DEV', 'TEST', 'PROD']);

            for (const [profileName, envClass] of Object.entries(parsed.profiles)) {
                const upper = String(envClass).toUpperCase();
                if (validClasses.has(upper)) {
                    result[profileName] = upper as EnvironmentClass;
                }
                // Valores inválidos são ignorados (profile fica UNKNOWN)
            }

            return result;
        } catch {
            // Arquivo inexistente, corrompido ou com erro de parsing
            // → todos os profiles ficam UNKNOWN (fail-safe)
            return {};
        }
    }

    /**
     * Obtém a lista de profile names do tipo zosmf disponíveis no
     * cache do Zowe Explorer.
     * 
     * Não expõe credenciais, sessão ou host — apenas os nomes.
     */
    getAvailableProfiles(): string[] {
        try {
            const ext = vscode.extensions.getExtension('Zowe.vscode-extension-for-zowe');
            if (!ext || !ext.isActive || !ext.exports) {
                return [];
            }

            const zoweApi = ext.exports;
            const extenderApi = zoweApi.getExplorerExtenderApi?.();
            if (!extenderApi) { return []; }

            const profilesCache = extenderApi.getProfilesCache?.();
            if (!profilesCache) { return []; }

            // getProfiles retorna IProfileLoaded[] — extraímos apenas o nome
            const profiles = profilesCache.getProfiles?.('zosmf');
            if (!Array.isArray(profiles)) { return []; }

            return profiles
                .map((p: any) => p?.name || p?.profName || '')
                .filter((name: string) => name.length > 0);
        } catch {
            return [];
        }
    }

    getEnvironmentClass(profileName: string): EnvironmentClass {
        const config = this.loadClassificationConfig();
        return config[profileName] ?? EnvironmentClass.UNKNOWN;
    }

    async resolveProfile(options?: ResolveOptions): Promise<ProfileSelectionContext> {
        const available = this.getAvailableProfiles();

        // ────────────────────────────────────────────────────────
        // Caso especial: nenhum profile disponível
        // ────────────────────────────────────────────────────────
        if (available.length === 0) {
            throw new NoProfileAvailableError();
        }

        let profileName: string | null = null;
        let source: ProfileSelectionSource | null = null;

        // ────────────────────────────────────────────────────────
        // 1. RESOURCE_CONTEXT — profile do recurso selecionado
        // ────────────────────────────────────────────────────────
        if (options?.resourceProfileName) {
            const resourceProfile = options.resourceProfileName.trim();
            if (available.includes(resourceProfile)) {
                profileName = resourceProfile;
                source = ProfileSelectionSource.RESOURCE_CONTEXT;
            }
            // Se o resource profile não existe no cache, ignorar e seguir
        }

        // ────────────────────────────────────────────────────────
        // 2. EXPLICIT — profile pinnado na sessão
        // ────────────────────────────────────────────────────────
        if (!profileName) {
            const pinned = profilePinningManager.getPinnedProfile();
            if (pinned && available.includes(pinned)) {
                profileName = pinned;
                source = ProfileSelectionSource.EXPLICIT;
            } else if (pinned && !available.includes(pinned)) {
                // Profile pinnado foi removido do cache: descartar pin silenciosamente
                profilePinningManager.unpinProfile();
            }
        }

        // ────────────────────────────────────────────────────────
        // 3. WORKSPACE — configuração do workspace settings
        // ────────────────────────────────────────────────────────
        if (!profileName) {
            const workspaceConfig = vscode.workspace.getConfiguration('mainframeHub');
            const workspaceProfile = workspaceConfig.get<string>('workspaceProfile', '').trim();
            const workspaceEnabled = workspaceConfig.get<boolean>('workspaceProfileEnabled', false);

            if (workspaceEnabled && workspaceProfile && available.includes(workspaceProfile)) {
                profileName = workspaceProfile;
                source = ProfileSelectionSource.WORKSPACE;
            }
        }

        // ────────────────────────────────────────────────────────
        // 4. SINGLE_AVAILABLE — exatamente 1 profile elegível
        // ────────────────────────────────────────────────────────
        if (!profileName && available.length === 1) {
            profileName = available[0];
            source = ProfileSelectionSource.SINGLE_AVAILABLE;
        }

        // ────────────────────────────────────────────────────────
        // 5. AMBIGUOUS — interrupção obrigatória
        // ────────────────────────────────────────────────────────
        if (!profileName) {
            if (options?.nonInteractive) {
                throw new AmbiguousProfileError(available);
            }

            // Modo interativo: QuickPick para o usuário escolher
            const selected = await vscode.window.showQuickPick(
                available.map(name => ({
                    label: name,
                    description: this.getEnvironmentClass(name) !== EnvironmentClass.UNKNOWN
                        ? `[${this.getEnvironmentClass(name)}]`
                        : '[Não classificado]'
                })),
                {
                    placeHolder: 'Selecione o profile Zowe para esta operação',
                    title: 'Mainframe Hub — Seleção de Profile',
                    ignoreFocusOut: true
                }
            );

            if (!selected) {
                // Usuário cancelou (ESC)
                throw new AmbiguousProfileError(available);
            }

            profileName = selected.label;
            source = ProfileSelectionSource.EXPLICIT;
        }

        // ────────────────────────────────────────────────────────
        // Validação final: profile ainda existe no cache?
        // ────────────────────────────────────────────────────────
        if (!available.includes(profileName)) {
            throw new ProfileNotFoundError(profileName);
        }

        // ────────────────────────────────────────────────────────
        // Classificação de ambiente
        // ────────────────────────────────────────────────────────
        const environmentClass = this.getEnvironmentClass(profileName);

        // ────────────────────────────────────────────────────────
        // Confirmação de PROD — SEMPRE exigida, independente da fonte
        // ────────────────────────────────────────────────────────
        let isConfirmed = true;

        if (environmentClass === EnvironmentClass.PROD) {
            if (options?.nonInteractive) {
                // PROD nunca é auto-confirmado em modo background
                throw new ProductionAccessDeniedError(profileName);
            }

            const confirmation = await vscode.window.showWarningMessage(
                `⚠ Atenção: Ambiente de PRODUÇÃO\n\n` +
                `O profile "${profileName}" está classificado como PRODUÇÃO.\n` +
                `Confirma leitura de dados neste ambiente?`,
                { modal: true },
                'Confirmar Leitura'
            );

            if (confirmation !== 'Confirmar Leitura') {
                throw new ProductionAccessDeniedError(profileName);
            }

            isConfirmed = true;
        }

        // ────────────────────────────────────────────────────────
        // Notificação para UNKNOWN (não-bloqueante, primeira vez)
        // ────────────────────────────────────────────────────────
        if (environmentClass === EnvironmentClass.UNKNOWN) {
            vscode.window.showInformationMessage(
                `O profile "${profileName}" não possui classificação de ambiente. ` +
                `Para classificá-lo, edite config/profile-classification.json.`
            );
        }

        // ────────────────────────────────────────────────────────
        // Construir e congelar o contexto
        // ────────────────────────────────────────────────────────
        const context: ProfileSelectionContext = Object.freeze({
            profileName,
            environmentClass,
            source: source!,
            isConfirmed,
            resolvedAt: new Date().toISOString()
        });

        return context;
    }
}

/** Instância singleton do resolver */
export const profileResolver = new ProfileResolverImpl();
