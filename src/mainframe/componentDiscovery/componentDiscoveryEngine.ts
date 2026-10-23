import { zoweConnector } from '../../zowe/zoweConnector';
import { ProfileSelectionContext } from '../../zowe/profileTypes';
import { AreaConfig } from '../areaConfigManager';
import { relationExtractor } from './relationExtractor';
import { ComponentGraph, ComponentNode, ComponentRelation, ComponentType, DiscoveryTelemetry } from './types';

interface SearchBudget {
    maxDepth: number;
    maxComponents: number;
    maxLibrariesConsulted: number;
    maxCharsRead: number;
}

const DEFAULT_BUDGET: SearchBudget = {
    maxDepth: 2,
    maxComponents: 15,
    maxLibrariesConsulted: 5,
    maxCharsRead: 50000
};

export class ComponentDiscoveryEngine {
    
    private graph: ComponentGraph;
    private visitedMembers = new Set<string>();
    private librariesCache = new Map<string, string[]>(); // lib -> members
    
    // Contadores de Budget
    private charsRead = 0;
    private librariesConsulted = 0;
    private discoveryTruncated = false;

    constructor(
        private profileCtx: ProfileSelectionContext,
        private seedMember: string,
        private area: AreaConfig,
        private budget: SearchBudget = DEFAULT_BUDGET
    ) {
        this.graph = {
            rootNodeId: seedMember,
            nodes: {},
            relations: []
        };
    }

    public async discover(): Promise<{ graph: ComponentGraph, telemetry: Partial<DiscoveryTelemetry> }> {
        const startTime = Date.now();

        // Tenta descobrir o seed component (primeiro PGM, JCL, PROC, etc)
        const seedLibrary = await this.findMemberLibrary(this.seedMember);
        if (!seedLibrary) {
            // Seed não encontrado nas libraries configuradas
            return this.buildResult(startTime);
        }

        const seedType = this.inferTypeFromLibrary(seedLibrary.library, seedLibrary.category);
        this.addNode(this.seedMember, seedType, seedLibrary.library);

        // Inicia a exploração recursiva
        await this.exploreNode(this.seedMember, seedLibrary.library, seedType, 0);

        return this.buildResult(startTime);
    }

    private async exploreNode(member: string, library: string, type: ComponentType, depth: number) {
        if (depth > this.budget.maxDepth) {
            this.discoveryTruncated = true;
            return;
        }

        if (this.visitedMembers.has(member)) return;
        this.visitedMembers.add(member);

        if (Object.keys(this.graph.nodes).length >= this.budget.maxComponents) {
            this.discoveryTruncated = true;
            return;
        }

        if (this.charsRead >= this.budget.maxCharsRead) {
            this.discoveryTruncated = true;
            return;
        }

        // Lê o conteúdo do Zowe
        const zoweResult = await zoweConnector.readDatasetMember(this.profileCtx, library, member);
        if (zoweResult.error) return;

        this.charsRead += zoweResult.charsRetrieved;

        let extractedRelations: ComponentRelation[] = [];
        if (type === 'PROGRAM' || type === 'COPYBOOK') {
            extractedRelations = relationExtractor.extractCobolRelations(member, zoweResult.content);
        } else if (type === 'JCL' || type === 'PROC') {
            extractedRelations = relationExtractor.extractJclRelations(member, zoweResult.content);
        }

        for (const rel of extractedRelations) {
            this.graph.relations.push(rel);

            // Tenta localizar o alvo
            const targetLibrary = await this.findMemberLibrary(rel.toId);
            if (targetLibrary) {
                rel.confidence = 'CONFIRMED';
                const targetType = this.inferTypeFromLibrary(targetLibrary.library, targetLibrary.category);
                this.addNode(rel.toId, targetType, targetLibrary.library);
                
                // Explora recursivamente o alvo
                await this.exploreNode(rel.toId, targetLibrary.library, targetType, depth + 1);
            }
        }
    }

    private addNode(member: string, type: ComponentType, library: string) {
        if (!this.graph.nodes[member]) {
            this.graph.nodes[member] = {
                id: member,
                type,
                library,
                member
            };
        }
    }

    /**
     * Procura o member em todas as libraries configuradas na área.
     * Faz cache dos membros de cada library para evitar chamadas redundantes ao Zowe.
     */
    private async findMemberLibrary(member: string): Promise<{ library: string, category: keyof AreaConfig['libraries'] } | null> {
        const categories: (keyof AreaConfig['libraries'])[] = ['programs', 'copybooks', 'jcl', 'procs'];

        for (const category of categories) {
            const libraries = this.area.libraries[category];
            for (const lib of libraries) {
                if (!this.librariesCache.has(lib)) {
                    if (this.librariesConsulted >= this.budget.maxLibrariesConsulted) {
                        this.discoveryTruncated = true;
                        continue;
                    }
                    this.librariesConsulted++;
                    const members = await zoweConnector.listDatasetMembers(this.profileCtx, lib);
                    this.librariesCache.set(lib, members);
                }

                const cachedMembers = this.librariesCache.get(lib);
                if (cachedMembers && cachedMembers.includes(member)) {
                    return { library: lib, category };
                }
            }
        }
        return null;
    }

    private inferTypeFromLibrary(library: string, category: keyof AreaConfig['libraries']): ComponentType {
        switch (category) {
            case 'programs': return 'PROGRAM';
            case 'copybooks': return 'COPYBOOK';
            case 'jcl': return 'JCL';
            case 'procs': return 'PROC';
            default: return 'UNKNOWN';
        }
    }

    private buildResult(startTime: number): { graph: ComponentGraph, telemetry: Partial<DiscoveryTelemetry> } {
        const componentsFound = Object.keys(this.graph.nodes).length;
        const relationsFound = this.graph.relations.length;
        const confirmedRelations = this.graph.relations.filter(r => r.confidence === 'CONFIRMED').length;
        const relatedRelations = this.graph.relations.filter(r => r.confidence === 'RELATED').length;
        const candidateRelations = this.graph.relations.filter(r => r.confidence === 'CANDIDATE').length;

        // Determina a profundidade máxima alcançada (heurística simplificada)
        // O valor real de depth exigiria rastrear cada caminho no DFS. Como MVP usamos o total de visited.
        const discoveryDepth = this.discoveryTruncated ? this.budget.maxDepth : 1; 

        const telemetry: Partial<DiscoveryTelemetry> = {
            areaId: this.area.id,
            rootComponent: this.seedMember,
            componentsFound,
            relationsFound,
            confirmedRelations,
            relatedRelations,
            candidateRelations,
            librariesConsulted: this.librariesConsulted,
            membersScanned: this.visitedMembers.size,
            charsRetrieved: this.charsRead,
            discoveryDepth,
            discoveryTruncated: this.discoveryTruncated,
            durationMs: Date.now() - startTime,
            success: componentsFound > 0
        };

        return { graph: this.graph, telemetry };
    }
}
