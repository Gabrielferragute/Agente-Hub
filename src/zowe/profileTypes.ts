/**
 * profileTypes.ts
 * 
 * Tipos centrais do Zowe Profile Context v1.
 * 
 * Define os contratos imutáveis para seleção de profile, classificação
 * de ambiente e erros tipados. Nenhum dado sensível (host, user, token,
 * sessão) aparece nestes tipos.
 * 
 * REGRAS:
 *   - EnvironmentClass NUNCA é inferido pelo nome, host, endereço ou HLQ.
 *   - ProfileSelectionContext é criado uma única vez por operação,
 *     validado, frozen (Object.freeze) e descartado ao término.
 *   - O LLM nunca escolhe o profile ou o ambiente.
 */

// ════════════════════════════════════════════════════════════════
// ENUMS
// ════════════════════════════════════════════════════════════════

/**
 * Classificação do ambiente associado a um profile.
 * 
 * A classificação vem exclusivamente de configuração explícita e
 * confiável (config/profile-classification.json). Profiles não
 * mapeados são classificados como UNKNOWN.
 */
export enum EnvironmentClass {
    DEV     = 'DEV',
    TEST    = 'TEST',
    PROD    = 'PROD',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Fonte que originou a seleção do profile na cadeia de resolução.
 * A ordem de precedência é:
 *   RESOURCE_CONTEXT > EXPLICIT > WORKSPACE > SINGLE_AVAILABLE
 */
export enum ProfileSelectionSource {
    /** Profile associado ao recurso selecionado no Zowe Explorer */
    RESOURCE_CONTEXT  = 'RESOURCE_CONTEXT',
    /** Seleção explícita pelo usuário (QuickPick ou pin de sessão) */
    EXPLICIT          = 'EXPLICIT',
    /** Configuração de workspace (settings.json) */
    WORKSPACE         = 'WORKSPACE',
    /** Único profile elegível disponível no cache */
    SINGLE_AVAILABLE  = 'SINGLE_AVAILABLE'
}

// ════════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════════

/**
 * Contexto imutável da seleção de profile para uma operação.
 * 
 * CICLO DE VIDA:
 *   1. Criado pelo ProfileResolver.resolveProfile() no início da operação.
 *   2. Validado contra os profiles disponíveis no momento da criação.
 *   3. Congelado com Object.freeze() — nenhum componente pode alterá-lo.
 *   4. Propagado por referência readonly a todas as chamadas da operação.
 *   5. Descartado ao término da operação (nunca reutilizado entre operações).
 * 
 * INVARIANTES:
 *   - profileName corresponde a um profile real e disponível no cache.
 *   - Se environmentClass === PROD, isConfirmed DEVE ser true para que
 *     qualquer leitura prossiga. Sem confirmação, o connector bloqueia.
 *   - host, user, token, sessão e credenciais NUNCA aparecem neste contrato.
 */
export interface ProfileSelectionContext {
    /** Nome do profile (apenas o identificador, sem dados de conexão) */
    readonly profileName: string;

    /** Classificação do ambiente, vinda de configuração explícita */
    readonly environmentClass: EnvironmentClass;

    /** Qual fonte da cadeia de resolução originou esta seleção */
    readonly source: ProfileSelectionSource;

    /**
     * Indica se o usuário confirmou explicitamente o acesso.
     * Obrigatório para PROD. Para outros ambientes, default true.
     */
    readonly isConfirmed: boolean;

    /** Timestamp ISO de criação do contexto (para auditoria) */
    readonly resolvedAt: string;
}

/**
 * Opções passadas ao ProfileResolver.resolveProfile().
 */
export interface ResolveOptions {
    /**
     * Nome do profile associado ao recurso que o usuário selecionou
     * no Zowe Explorer (ex: clicou em um dataset na tree view).
     * Se fornecido, tem a MAIOR prioridade na cadeia de resolução.
     */
    resourceProfileName?: string;

    /**
     * Se true, o resolver NÃO pode exibir UI (QuickPick, modal).
     * Usado em operações em background. Se a resolução for ambígua
     * ou PROD, lança exceção em vez de abrir UI.
     */
    nonInteractive?: boolean;
}

// ════════════════════════════════════════════════════════════════
// ERROS TIPADOS
// ════════════════════════════════════════════════════════════════

/** Mais de um profile elegível e nenhuma fonte de seleção resolveu */
export class AmbiguousProfileError extends Error {
    public readonly availableProfiles: string[];

    constructor(availableProfiles: string[]) {
        super(`Múltiplos profiles disponíveis (${availableProfiles.join(', ')}). Selecione um explicitamente.`);
        this.name = 'AmbiguousProfileError';
        this.availableProfiles = availableProfiles;
    }
}

/** Nenhum profile encontrado no cache */
export class NoProfileAvailableError extends Error {
    constructor() {
        super('Nenhum profile Zowe (zosmf) encontrado. Crie um profile no Zowe Explorer.');
        this.name = 'NoProfileAvailableError';
    }
}

/** Acesso a PROD negado por falta de confirmação */
export class ProductionAccessDeniedError extends Error {
    public readonly profileName: string;

    constructor(profileName: string) {
        super(`Acesso ao ambiente de Produção negado: confirmação não concedida para profile "${profileName}".`);
        this.name = 'ProductionAccessDeniedError';
        this.profileName = profileName;
    }
}

/** Profile resolvido não existe mais no cache (race condition ou pin inválido) */
export class ProfileNotFoundError extends Error {
    public readonly profileName: string;

    constructor(profileName: string) {
        super(`Profile "${profileName}" não foi encontrado nos profiles disponíveis.`);
        this.name = 'ProfileNotFoundError';
        this.profileName = profileName;
    }
}
