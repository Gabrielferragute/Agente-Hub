import { ComponentRelation, ComponentType } from './types';

export class RelationExtractor {
    
    /**
     * Extrai as relações de um código COBOL usando regras regex determinísticas.
     */
    public extractCobolRelations(sourceId: string, content: string): ComponentRelation[] {
        const relations: ComponentRelation[] = [];
        
        // 1. COPY XXXXX
        const copyRegex = /COPY\s+([a-zA-Z0-9#@$]{1,8})/gi;
        let match;
        while ((match = copyRegex.exec(content)) !== null) {
            relations.push({
                fromId: sourceId,
                toId: match[1],
                relationType: 'COPY',
                confidence: 'CANDIDATE', // Começa como candidato até acharmos a lib
                evidenceType: `RegexMatch: COPY ${match[1]}`
            });
        }

        // 2. CALL 'XXXXX' ou CALL "XXXXX"
        const callRegex = /CALL\s+['"]([a-zA-Z0-9#@$]{1,8})['"]/gi;
        while ((match = callRegex.exec(content)) !== null) {
            relations.push({
                fromId: sourceId,
                toId: match[1],
                relationType: 'CALL',
                confidence: 'CANDIDATE',
                evidenceType: `RegexMatch: CALL ${match[1]}`
            });
        }

        // 3. EXEC CICS LINK/XCTL PROGRAM(...)
        const cicsRegex = /EXEC\s+CICS\s+(LINK|XCTL)\s+PROGRAM\(['"]?([a-zA-Z0-9#@$]{1,8})['"]?\)/gi;
        while ((match = cicsRegex.exec(content)) !== null) {
            const relType = match[1] === 'LINK' ? 'CICS_LINK' : 'CICS_XCTL';
            relations.push({
                fromId: sourceId,
                toId: match[2],
                relationType: relType,
                confidence: 'CANDIDATE',
                evidenceType: `RegexMatch: EXEC CICS ${match[1]} PROGRAM(${match[2]})`
            });
        }

        return this.deduplicateRelations(relations);
    }

    /**
     * Extrai as relações de um JCL ou PROC usando regras regex determinísticas.
     */
    public extractJclRelations(sourceId: string, content: string): ComponentRelation[] {
        const relations: ComponentRelation[] = [];

        // 1. EXEC PGM=XXXXX
        const pgmRegex = /EXEC\s+PGM=([a-zA-Z0-9#@$]{1,8})/gi;
        let match;
        while ((match = pgmRegex.exec(content)) !== null) {
            relations.push({
                fromId: sourceId,
                toId: match[1],
                relationType: 'EXECUTES',
                confidence: 'CANDIDATE',
                evidenceType: `RegexMatch: EXEC PGM=${match[1]}`
            });
        }

        // 2. EXEC XXXXX ou EXEC PROC=XXXXX
        // O regex abaixo pega 'EXEC ABC' ou 'EXEC PROC=ABC' mas não 'EXEC PGM=ABC'
        const procRegex = /EXEC\s+(?:PROC=)?([a-zA-Z0-9#@$]{1,8})(?!\s*PGM=)/gi;
        while ((match = procRegex.exec(content)) !== null) {
            // Se for PGM, a regex acima já pegou ou evitará pegar incorretamente
            // Tem uma pequena chance de falso positivo com utilitários de sistema (ex: IDCAMS),
            // mas o Discovery Engine lidará com isso não encontrando o utilitário nas bibliotecas permitidas.
            if (match[1] !== 'PGM') {
                relations.push({
                    fromId: sourceId,
                    toId: match[1],
                    relationType: 'USES_PROC',
                    confidence: 'CANDIDATE',
                    evidenceType: `RegexMatch: EXEC ${match[1]}`
                });
            }
        }

        return this.deduplicateRelations(relations);
    }

    private deduplicateRelations(relations: ComponentRelation[]): ComponentRelation[] {
        const unique = new Map<string, ComponentRelation>();
        for (const rel of relations) {
            const key = `${rel.fromId}->${rel.toId}:${rel.relationType}`;
            if (!unique.has(key)) {
                unique.set(key, rel);
            }
        }
        return Array.from(unique.values());
    }
}

export const relationExtractor = new RelationExtractor();
