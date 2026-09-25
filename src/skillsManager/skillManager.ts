import { SkillProvider, LoadedSkill } from './types';
import { LocalSkillProvider } from './localProvider';

export class SkillManager {
    private providers: SkillProvider[] = [];

    constructor() {
        // Por padrão, sempre registrar o provider local
        this.providers.push(new LocalSkillProvider());
    }

    registerProvider(provider: SkillProvider) {
        this.providers.push(provider);
    }

    async loadSkill(skillId: string): Promise<LoadedSkill | null> {
        for (const provider of this.providers) {
            const skill = await provider.loadSkill(skillId);
            if (skill) {
                // Garantir que a origem está anotada
                skill.providerId = provider.id;
                return skill;
            }
        }
        return null;
    }

    async hasSkill(skillId: string): Promise<boolean> {
        return (await this.loadSkill(skillId)) !== null;
    }
}

// Singleton global
export const skillManager = new SkillManager();
