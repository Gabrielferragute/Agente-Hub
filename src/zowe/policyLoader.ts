/**
 * Carga e validação das políticas do connector (sem dependência de vscode/fs,
 * para ser testável). Quem lê o arquivo passa o texto bruto.
 *
 * Princípios:
 *  - Política BASE vem da pasta da EXTENSÃO (ou de configuração gerenciada pelo
 *    administrador), nunca do workspace aberto: um repositório clonado não pode
 *    afrouxar a segurança.
 *  - O workspace pode apenas ENDURECER (acrescentar deny). O allow dele é ignorado.
 *  - Arquivo ausente => usa o padrão do MVP. Arquivo presente mas inválido => NEGA TUDO.
 *  - Profile sem classificação, ou com valor desconhecido => tratado como PROD.
 */
import { GuardConfig, DatasetPolicy } from './datasetGuard';

export const DENY_ALL: GuardConfig = { default: { allow: [], deny: [] } };

export interface LoadResult {
    config: GuardConfig;
    /** Mensagem para log/UI quando algo foi rejeitado. */
    problem?: string;
}

const isPatternList = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim() !== '');

const isPartialPolicy = (v: unknown): v is Partial<DatasetPolicy> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) { return false; }
    const o = v as Record<string, unknown>;
    return (o.allow === undefined || isPatternList(o.allow)) && (o.deny === undefined || isPatternList(o.deny));
};

function validateConfig(parsed: unknown): parsed is GuardConfig {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { return false; }
    const o = parsed as Record<string, unknown>;
    if (o.default !== undefined && !isPartialPolicy(o.default)) { return false; }
    if (o.profiles !== undefined) {
        if (typeof o.profiles !== 'object' || o.profiles === null || Array.isArray(o.profiles)) { return false; }
        if (!Object.values(o.profiles as object).every(isPartialPolicy)) { return false; }
    }
    return true;
}

/** raw === undefined significa "arquivo não existe". */
export function loadBaseGuardConfig(raw: string | undefined, mvpDefault: GuardConfig): LoadResult {
    if (raw === undefined) { return { config: mvpDefault }; }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { config: DENY_ALL, problem: 'guard-policy.json com JSON inválido: acesso a datasets bloqueado até corrigir.' };
    }
    if (!validateConfig(parsed)) {
        return { config: DENY_ALL, problem: 'guard-policy.json com formato inválido (allow/deny devem ser listas de texto): acesso a datasets bloqueado até corrigir.' };
    }
    return { config: parsed };
}

/** Política do workspace só pode acrescentar deny. Nunca afrouxa. */
export function applyWorkspaceDenyOnly(base: GuardConfig, workspaceRaw: string | undefined): LoadResult {
    if (workspaceRaw === undefined) { return { config: base }; }
    let parsed: unknown;
    try { parsed = JSON.parse(workspaceRaw); } catch { return { config: base, problem: 'Política do workspace ignorada (JSON inválido).' }; }
    if (!validateConfig(parsed)) { return { config: base, problem: 'Política do workspace ignorada (formato inválido).' }; }

    const merged: GuardConfig = {
        default: { allow: base.default?.allow ?? [], deny: [...(base.default?.deny ?? []), ...(parsed.default?.deny ?? [])] },
        profiles: { ...(base.profiles ?? {}) }
    };
    for (const [name, pol] of Object.entries(parsed.profiles ?? {})) {
        const existing = merged.profiles![name] ?? {};
        merged.profiles![name] = { ...existing, deny: [...(existing.deny ?? []), ...(pol.deny ?? [])] };
    }
    return { config: merged };
}

/** Valores de classificação que NÃO exigem confirmação de produção. Ajuste aos valores reais do seu profile-classification.json. */
export const DEFAULT_NON_PROD = ['DEV', 'DESENV', 'TEST', 'TESTE', 'HOM', 'HOMOLOG', 'QA', 'UAT'];

/** Fail-closed: só é não-produção se estiver explicitamente classificado como tal. */
export function isProductionProfile(
    classifications: unknown,
    profileName: string,
    nonProd: readonly string[] = DEFAULT_NON_PROD
): boolean {
    if (typeof classifications !== 'object' || classifications === null) { return true; }
    const value = (classifications as Record<string, unknown>)[profileName];
    if (typeof value !== 'string') { return true; }
    return !nonProd.includes(value.trim().toUpperCase());
}
