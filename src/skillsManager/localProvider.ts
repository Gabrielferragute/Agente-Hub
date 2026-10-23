import * as fs from 'fs';
import * as path from 'path';
import { SkillProvider, SkillDescriptor, LoadedSkill } from './types';

export class LocalSkillProvider implements SkillProvider {
    id = 'local';

    async listSkills(): Promise<SkillDescriptor[]> {
        const skillsDir = path.join(__dirname, '../../skills');
        if (!fs.existsSync(skillsDir)) return [];

        const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const descriptors: SkillDescriptor[] = [];
        for (const skill of skills) {
            const loaded = await this.loadSkill(skill);
            if (loaded) {
                descriptors.push({
                    id: loaded.id,
                    domain: loaded.domain,
                    intents: loaded.intents,
                    defaultTier: loaded.defaultTier
                });
            }
        }
        return descriptors;
    }

    async loadSkill(skillId: string): Promise<LoadedSkill | null> {
        try {
            const skillPath = path.join(__dirname, `../../skills/${skillId}/SKILL.md`);
            if (!fs.existsSync(skillPath)) return null;

            const rawContent = fs.readFileSync(skillPath, 'utf8');
            
            // Parsing rudimentar de YAML frontmatter para o MVP
            const yamlMatch = rawContent.match(/---\n([\s\S]*?)\n---/);
            let body = rawContent;
            
            let id = skillId;
            let domain = 'unknown';
            let intents: string[] = [];
            let defaultTier = 'ECONOMY';
            let escalation: string | undefined;
            let tools: string[] = [];
            let knowledge: string[] = [];
            let output: string | undefined;

            if (yamlMatch) {
                const yamlText = yamlMatch[1];
                body = rawContent.replace(yamlMatch[0], '').trim();
                
                // Extract fields manually (evitando dependência yaml externa no MVP)
                const getField = (field: string) => {
                    const match = yamlText.match(new RegExp(`${field}:\\s*(.+)`));
                    return match ? match[1].trim() : undefined;
                };
                const getArray = (field: string) => {
                    const match = yamlText.match(new RegExp(`${field}:\\s*\\[(.*?)\\]`));
                    return match ? match[1].split(',').map(s => s.trim()).filter(s => s) : [];
                };

                id = getField('id') || skillId;
                domain = getField('domain') || 'unknown';
                intents = getArray('intents');
                defaultTier = (getField('defaultTier') || 'ECONOMY').toUpperCase();
                escalation = getField('escalation');
                tools = getArray('tools');
                knowledge = getArray('knowledge');
                output = getField('output');
            }

            // Loader de Knowledge (A verdadeira economia de contexto)
            let knowledgeContent = '';
            if (knowledge && knowledge.length > 0) {
                for (const kFile of knowledge) {
                    const kPath = path.join(__dirname, `../../knowledge/${kFile}`);
                    if (fs.existsSync(kPath)) {
                        knowledgeContent += `\n\n--- DOCUMENTAÇÃO DE REFERÊNCIA: ${kFile} ---\n`;
                        knowledgeContent += fs.readFileSync(kPath, 'utf8');
                    }
                }
            }

            return {
                id,
                domain,
                intents,
                defaultTier,
                escalation,
                tools,
                knowledge,
                output,
                content: body,
                knowledgeContent,
                providerId: this.id
            };
        } catch (e) {
            console.error(`Erro ao carregar skill local ${skillId}:`, e);
            return null;
        }
    }
}
