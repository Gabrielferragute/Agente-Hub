import { CodeClassification } from './codeClassificationTypes';

export { CodeClassification, CodeConfidence, CodeType } from './codeClassificationTypes';

export class CodeClassifier {
    
    // Expressões regulares para heurística de classificação
    private jclPatterns = [
        { regex: /^\/\/.*?\s+JOB\s+/im, name: 'JOB Statement' },
        { regex: /^\/\/.*?\s+EXEC\s+/im, name: 'EXEC Statement' },
        { regex: /^\/\/.*?\s+DD\s+/im, name: 'DD Statement' },
        { regex: /SYSOUT=/im, name: 'SYSOUT parameter' },
        { regex: /STEPLIB|JOBLIB/im, name: 'STEPLIB/JOBLIB' },
        { regex: /DISP=/im, name: 'DISP parameter' }
    ];

    private cobolPatterns = [
        { regex: /IDENTIFICATION\s+DIVISION/im, name: 'IDENTIFICATION DIVISION' },
        { regex: /ENVIRONMENT\s+DIVISION/im, name: 'ENVIRONMENT DIVISION' },
        { regex: /DATA\s+DIVISION/im, name: 'DATA DIVISION' },
        { regex: /PROCEDURE\s+DIVISION/im, name: 'PROCEDURE DIVISION' },
        { regex: /WORKING-STORAGE\s+SECTION/im, name: 'WORKING-STORAGE SECTION' },
        { regex: /FILE\s+SECTION/im, name: 'FILE SECTION' },
        { regex: /PIC\s+[X9A]/im, name: 'PIC Clause' },
        { regex: /COMP-[1-5]/im, name: 'COMP Usage' }
    ];

    public classify(content: string): CodeClassification {
        if (!content || content.trim() === '') {
            return { detectedType: 'unknown', confidence: 'LOW', evidence: [] };
        }

        // Limitamos a amostragem às primeiras 200 linhas para performance
        const lines = content.split('\n').slice(0, 200);
        const sampleContent = lines.join('\n');

        let jclScore = 0;
        let cobolScore = 0;
        const evidence: string[] = [];

        // Check JCL
        for (const pattern of this.jclPatterns) {
            if (pattern.regex.test(sampleContent)) {
                jclScore++;
                evidence.push(pattern.name);
            }
        }

        // Check COBOL
        for (const pattern of this.cobolPatterns) {
            if (pattern.regex.test(sampleContent)) {
                cobolScore++;
                evidence.push(pattern.name);
            }
        }

        if (jclScore === 0 && cobolScore === 0) {
            return { detectedType: 'unknown', confidence: 'LOW', evidence: [] };
        }

        if (jclScore > cobolScore) {
            return {
                detectedType: 'jcl',
                confidence: jclScore >= 2 ? 'HIGH' : 'MEDIUM',
                evidence: evidence.filter(e => this.jclPatterns.some(p => p.name === e))
            };
        } else if (cobolScore > jclScore) {
            return {
                detectedType: 'cobol',
                confidence: cobolScore >= 2 ? 'HIGH' : 'MEDIUM',
                evidence: evidence.filter(e => this.cobolPatterns.some(p => p.name === e))
            };
        } else {
            // Empate ou misto estranho
            return { detectedType: 'unknown', confidence: 'LOW', evidence };
        }
    }
}

export const codeClassifier = new CodeClassifier();
