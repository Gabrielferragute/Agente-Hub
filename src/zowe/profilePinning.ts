/**
 * profilePinning.ts
 * 
 * Gerenciamento do profile fixado (pinned) na sessão do VS Code.
 * 
 * REGRAS:
 *   - O pinning é uma PREFERÊNCIA DE SELEÇÃO, nunca uma autorização.
 *   - Escopo: in-memory, sessão do VS Code. Não persiste entre restarts.
 *   - Prioridade: perde para RESOURCE_CONTEXT, ganha sobre WORKSPACE e SINGLE_AVAILABLE.
 *   - Pinnar um profile PROD NÃO concede autorização automática.
 *     A confirmação modal continua sendo exigida a cada operação.
 *   - Se o profile pinnado for removido do cache do Zowe Explorer,
 *     o pin é descartado silenciosamente pelo ProfileResolver.
 */

// ════════════════════════════════════════════════════════════════
// INTERFACE
// ════════════════════════════════════════════════════════════════

export interface ProfilePinningManager {
    /** Retorna o nome do profile pinnado, ou null se nenhum estiver fixado */
    getPinnedProfile(): string | null;

    /** Define o profile pinnado para a sessão atual */
    pinProfile(profileName: string): void;

    /** Remove o pin, liberando a preferência de seleção */
    unpinProfile(): void;
}

// ════════════════════════════════════════════════════════════════
// IMPLEMENTAÇÃO
// ════════════════════════════════════════════════════════════════

class ProfilePinningManagerImpl implements ProfilePinningManager {

    /**
     * Profile pinnado na sessão atual. 
     * Armazenado apenas em memória — descartado ao fechar o VS Code.
     */
    private pinnedProfile: string | null = null;

    getPinnedProfile(): string | null {
        return this.pinnedProfile;
    }

    pinProfile(profileName: string): void {
        if (!profileName || profileName.trim().length === 0) {
            throw new Error('Nome do profile não pode ser vazio para pinning.');
        }
        this.pinnedProfile = profileName.trim();
    }

    unpinProfile(): void {
        this.pinnedProfile = null;
    }
}

/** Instância singleton do gerenciador de pinning */
export const profilePinningManager = new ProfilePinningManagerImpl();
