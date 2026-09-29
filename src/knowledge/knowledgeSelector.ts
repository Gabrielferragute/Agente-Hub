import * as path from 'path';
import * as fs from 'fs';

/**
 * Input for knowledge selection
 */
export interface KnowledgeSelectionInput {
    intent: string;
    selectedSkill: string | null;
    detectedCodeType: string;
    userPrompt: string;
}

/**
 * Result of knowledge selection
 */
export interface KnowledgeSelectionResult {
    /**
     * Absolute paths of knowledge files to be included
     */
    filePaths: string[];
    
    /**
     * Reason for selecting these specific directories/files
     */
    reasons: string[];
}

/**
 * Migration Knowledge Selector
 * 
 * Dinamicamente escolhe guias e documentações do diretório 'knowledge' 
 * para injetar no contexto do LLM com base na intenção e palavras-chave.
 */
export function selectMigrationKnowledge(input: KnowledgeSelectionInput): KnowledgeSelectionResult {
    const { intent, selectedSkill, detectedCodeType, userPrompt } = input;
    const prompt = userPrompt.toLowerCase();
    
    const filePaths = new Set<string>();
    const reasons: string[] = [];
    
    const KNOWLEDGE_ROOT = path.join(__dirname, '../../knowledge');
    
    // Helper para adicionar diretórios inteiros (apenas .md)
    const addDir = (relativeDirPath: string, reason: string) => {
        const fullPath = path.join(KNOWLEDGE_ROOT, relativeDirPath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            const files = fs.readdirSync(fullPath)
                .filter(f => f.endsWith('.md'))
                .map(f => path.join(fullPath, f));
            
            if (files.length > 0) {
                files.forEach(f => filePaths.add(f));
                reasons.push(reason);
            }
        }
    };
    
    // Helper para adicionar arquivos específicos
    const addFile = (relativeFilePath: string, reason: string) => {
        const fullPath = path.join(KNOWLEDGE_ROOT, relativeFilePath);
        if (fs.existsSync(fullPath)) {
            filePaths.add(fullPath);
            reasons.push(reason);
        }
    };

    // 1. ISPF / TSO Migration
    if (intent === 'tso-to-zowe' || intent === 'como-fazia-no-tso' || prompt.includes('tso') || prompt.includes('ispf')) {
        addDir('migration/mappings', 'Intent de TSO/ISPF - Adicionado Mappings');
        addDir('migration/tso', 'Intent de TSO/ISPF - Adicionado comandos TSO');
        addFile('ispf-mapping.md', 'Mapeamento ISPF');
    }

    // 2. JCL / Jobs Migration
    if (detectedCodeType === 'jcl' || selectedSkill === 'jeff-jcl' || selectedSkill === 'jcl-analysis' || prompt.includes('jcl') || prompt.includes('spool')) {
        addDir('migration/jobs', 'Código JCL detectado - Adicionado guias de Jobs/Spool');
        addFile('jcl-basics.md', 'Código JCL detectado - JCL Basics');
    }

    // 3. ABEND / Troubleshooting
    if (intent === 'abend' || prompt.includes('abend') || prompt.includes('dump') || prompt.match(/s[0-9a-f]{3}/i)) {
        addFile('abend-codes.md', 'Detecção de Abend/Dump - Códigos de Abend');
        addDir('migration/troubleshooting', 'Detecção de Abend/Dump - Manuais de Troubleshooting');
    }

    // 4. Datasets / Arquivos
    if (prompt.includes('dataset') || prompt.includes('pds') || prompt.includes('pdse') || prompt.includes('arquivo') || prompt.includes('membro')) {
        addDir('migration/datasets', 'Detecção de Dataset/File - Manuais de Datasets');
    }

    return {
        filePaths: Array.from(filePaths),
        reasons: Array.from(new Set(reasons)) // Distinct reasons
    };
}
