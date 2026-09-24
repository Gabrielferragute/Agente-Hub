/**
 * Context Processor
 * 
 * Camada intermediária entre o zoweConnector (read-only) e as Skills/LLM.
 * 
 * Responsabilidades:
 *   - Receber ZoweContextResult já recuperado pelo connector
 *   - Aplicar limites de tamanho configuráveis por tipo de fonte
 *   - Gerar ProcessedContext com métricas (originalChars, contextChars, truncated)
 *   - Registrar telemetria de processamento (sem conteúdo)
 * 
 * NÃO faz:
 *   - Buscar dados no Zowe
 *   - Chamar LLM / resumir / alterar conteúdo técnico
 *   - Registrar conteúdo nos logs
 *   - Buscar datasets/jobs adicionais automaticamente
 * 
 * Arquitetura:
 *   Zowe → zoweConnector → contextProcessor → Skill → Router → LLM
 */

import { ZoweContextResult } from '../zowe/zoweConnector';

// ════════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════════

export interface ProcessedContext {
    /** Tipo da fonte: dataset, member, job, spool, uss */
    sourceType: string;
    /** Identificador do recurso (ex: Z75221.JCL(JCL2)) */
    sourceIdentifier: string;
    /** Total de caracteres recuperados do Mainframe */
    originalChars: number;
    /** Total de caracteres que serão enviados à IA */
    contextChars: number;
    /** Indica se o conteúdo foi truncado pelo processor */
    truncated: boolean;
    /** Conteúdo processado (preservando estrutura original) */
    content: string;
    /** Erro, se houver */
    error?: string;
}

export interface ContextProcessorMetrics {
    sourceType: string;
    originalChars: number;
    contextChars: number;
    truncated: boolean;
    processingDurationMs: number;
}

// ════════════════════════════════════════════════════════════════
// LIMITES CONFIGURÁVEIS POR TIPO DE FONTE
// ════════════════════════════════════════════════════════════════

/**
 * Limites provisórios de caracteres por tipo de fonte.
 * 
 * Preparado para diferenciação futura por tipo (JCL, COBOL, spool,
 * JESMSGLG, JESJCL, JESYSMSG, USS), mas por ora usa um default único.
 * 
 * Estes valores NÃO são limites definitivos de arquitetura.
 */
export interface ContextLimits {
    /** Limite padrão para qualquer tipo não especificado */
    default: number;
    /** Limites específicos por sourceType (futuro) */
    bySourceType?: Partial<Record<string, number>>;
}

const DEFAULT_LIMITS: ContextLimits = {
    default: 8000,
    bySourceType: {
        // Preparado para configuração futura:
        // 'spool': 12000,
        // 'member': 8000,
        // 'uss': 8000,
    }
};

// ════════════════════════════════════════════════════════════════
// CONTEXT PROCESSOR
// ════════════════════════════════════════════════════════════════

export class ContextProcessor {

    private limits: ContextLimits;

    constructor(limits?: Partial<ContextLimits>) {
        this.limits = {
            default: limits?.default ?? DEFAULT_LIMITS.default,
            bySourceType: { ...DEFAULT_LIMITS.bySourceType, ...limits?.bySourceType }
        };
    }

    /**
     * Retorna o limite de caracteres aplicável para o tipo de fonte dado.
     */
    private getLimitForType(sourceType: string): number {
        return this.limits.bySourceType?.[sourceType] ?? this.limits.default;
    }

    /**
     * Processa um ZoweContextResult e produz um ProcessedContext.
     * 
     * Regras:
     *   1. Não altera o conteúdo técnico silenciosamente
     *   2. Não resume com IA
     *   3. Preserva line breaks e estrutura de JCL/COBOL
     *   4. Aplica apenas truncamento por limite de caracteres
     *   5. Não registra conteúdo nos logs
     */
    process(input: ZoweContextResult): { context: ProcessedContext; metrics: ContextProcessorMetrics } {
        const startTime = Date.now();

        // Se o connector retornou erro, propagar sem processar conteúdo
        if (input.error) {
            const metrics: ContextProcessorMetrics = {
                sourceType: input.sourceType,
                originalChars: 0,
                contextChars: 0,
                truncated: false,
                processingDurationMs: Date.now() - startTime
            };

            const context: ProcessedContext = {
                sourceType: input.sourceType,
                sourceIdentifier: input.sourceIdentifier,
                originalChars: 0,
                contextChars: 0,
                truncated: false,
                content: '',
                error: input.error
            };

            return { context, metrics };
        }

        const originalChars = input.charsRetrieved;
        const limit = this.getLimitForType(input.sourceType);
        let content = input.content;
        let truncated = input.truncated;

        // Aplicar limite do processor (se o connector ainda não truncou)
        if (content.length > limit) {
            content = content.substring(0, limit) + '\n... [TRUNCADO - Limite de contexto atingido]';
            truncated = true;
        }

        const contextChars = content.length;
        const processingDurationMs = Date.now() - startTime;

        const context: ProcessedContext = {
            sourceType: input.sourceType,
            sourceIdentifier: input.sourceIdentifier,
            originalChars,
            contextChars,
            truncated,
            content
        };

        const metrics: ContextProcessorMetrics = {
            sourceType: input.sourceType,
            originalChars,
            contextChars,
            truncated,
            processingDurationMs
        };

        return { context, metrics };
    }
}

/** Instância singleton do processor com limites padrão */
export const contextProcessor = new ContextProcessor();
