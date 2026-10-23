import * as fs from 'fs';
import * as path from 'path';

export interface SkillMetadata {
    id: string;
    domain: string;
    intents: string[];
    defaultTier: string;
    escalation?: string;
    tools?: string[];
    knowledge?: string[];
    output?: string;
}

export interface LoadedSkill {
    metadata: SkillMetadata;
    content: string; // Conteúdo das regras comportamentais
    knowledgeContent: string; // Conteúdo das documentações adicionais carregadas sob demanda
}

/**
 * Lê o SKILL.md, faz o parsing do frontmatter YAML e carrega o knowledge referenciado.
 */
export function loadSkill(skillName: string): LoadedSkill | null {
    try {
        const skillPath = path.join(__dirname, `../../skills/${skillName}/SKILL.md`);
        if (!fs.existsSync(skillPath)) return null;

        const rawContent = fs.readFileSync(skillPath, 'utf8');
        
        // Parsing rudimentar de YAML frontmatter para o MVP
        const yamlMatch = rawContent.match(/---\n([\s\S]*?)\n---/);
        let metadata: Partial<SkillMetadata> = {};
        let body = rawContent;

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

            metadata = {
                id: getField('id') || skillName,
                domain: getField('domain') || 'unknown',
                intents: getArray('intents'),
                defaultTier: (getField('defaultTier') || 'ECONOMY').toUpperCase(),
                escalation: getField('escalation'),
                tools: getArray('tools'),
                knowledge: getArray('knowledge'),
                output: getField('output')
            };
        }

        // Loader de Knowledge (A verdadeira economia de contexto)
        let knowledgeContent = '';
        if (metadata.knowledge && metadata.knowledge.length > 0) {
            for (const kFile of metadata.knowledge) {
                const kPath = path.join(__dirname, `../../knowledge/${kFile}`);
                if (fs.existsSync(kPath)) {
                    knowledgeContent += `\n\n--- DOCUMENTAÇÃO DE REFERÊNCIA: ${kFile} ---\n`;
                    knowledgeContent += fs.readFileSync(kPath, 'utf8');
                }
            }
        }

        return {
            metadata: metadata as SkillMetadata,
            content: body,
            knowledgeContent
        };
    } catch (e) {
        console.error(`Erro ao carregar skill ${skillName}:`, e);
        return null;
    }
}
