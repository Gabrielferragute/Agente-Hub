export interface SkillDescriptor {
    id: string;
    domain?: string;
    intents?: string[];
    defaultTier?: string;
}

export interface LoadedSkill extends SkillDescriptor {
    content: string;
    escalation?: string;
    tools?: string[];
    knowledge?: string[];
    output?: string;
    knowledgeContent?: string;
    providerId: string;
}

export interface SkillProvider {
    id: string;
    listSkills(): Promise<SkillDescriptor[]>;
    loadSkill(skillId: string): Promise<LoadedSkill | null>;
}
