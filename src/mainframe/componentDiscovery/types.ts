export type ComponentType = 'PROGRAM' | 'COPYBOOK' | 'JCL' | 'PROC' | 'BATCH_JOB' | 'CICS_TRANSACTION' | 'DB2_PACKAGE' | 'CHANGEMAN_PACKAGE' | 'UNKNOWN';
export type RelationConfidence = 'CONFIRMED' | 'RELATED' | 'CANDIDATE';

export interface ComponentNode {
    id: string; // Ex: ABC123
    type: ComponentType;
    library: string; // Ex: SYS1.PROD.COBOL
    member: string;  // Ex: ABC123
}

export interface ComponentRelation {
    fromId: string;
    toId: string;
    relationType: 'COPY' | 'CALL' | 'CICS_LINK' | 'CICS_XCTL' | 'EXECUTES' | 'USES_PROC' | 'UNKNOWN';
    confidence: RelationConfidence;
    evidenceType: string;
}

export interface ComponentGraph {
    rootNodeId: string;
    nodes: Record<string, ComponentNode>;
    relations: ComponentRelation[];
}

export interface DiscoveryTelemetry {
    areaId: string;
    rootComponent: string;
    componentsFound: number;
    relationsFound: number;
    confirmedRelations: number;
    relatedRelations: number;
    candidateRelations: number;
    librariesConsulted: number;
    membersScanned: number;
    charsRetrieved: number;
    discoveryDepth: number;
    discoveryTruncated: boolean;
    durationMs: number;
    success: boolean;
}
