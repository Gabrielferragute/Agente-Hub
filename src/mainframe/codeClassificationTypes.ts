export type CodeType = 'jcl' | 'cobol' | 'unknown';

export type CodeConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CodeClassification {
    detectedType: CodeType;
    confidence: CodeConfidence;
    evidence: string[];
}
