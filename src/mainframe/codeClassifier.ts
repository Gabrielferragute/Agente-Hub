import { CodeClassification } from './codeClassificationTypes';
export { CodeClassification, CodeConfidence, CodeType } from './codeClassificationTypes';

interface Pattern {
    regex: RegExp;
    name: string;
    weight: number;
}

/**
 * Classificador heurístico JCL vs COBOL.
 *
 * Mudanças em relação à versão anterior:
 *  - JCL: padrões ancorados em início de linha ("//NOME VERBO"), então um
 *    comentário "//* ... EXEC ..." ou texto solto não conta como evidência.
 *  - COBOL: ignora linhas de comentário (coluna 7 = '*' ou '/', ou '*>') e
 *    remove a área de sequência (colunas 73-80) em fonte de formato fixo.
 *  - PIC: cobre S9, Z, V, -, +, $, PICTURE e PIC IS (a regex antiga só via X, 9 e A).
 *  - USAGE: cobre COMP-1..5, PACKED-DECIMAL (e variações de COMPUTATIONAL).
 *  - ID DIVISION (abreviação) e fronteiras de palavra (\b).
 *  - Pesos: DIVISIONs e JOB pesam mais. HIGH exige pontuação alta E margem.
 *  - Copybook/fragmento (sem IDENTIFICATION/PROCEDURE DIVISION) nunca é HIGH.
 *  - Traços extras (EXEC SQL, EXEC CICS, BMS) entram na evidência para o
 *    roteador poder escolher skill de DB2/CICS.
 */
export class CodeClassifier {
    private static readonly SAMPLE_LINES = 200;
    private static readonly MAX_SAMPLE_CHARS = 40000;

    private jclPatterns: Pattern[] = [
        { regex: /^\/\/[A-Z0-9@#$]{1,8}\s+JOB\b/im, name: 'JOB Statement', weight: 3 },
        { regex: /^\/\/[A-Z0-9@#$]{0,8}\s+EXEC\s+(?:PGM=|PROC=|[A-Z@#$])/im, name: 'EXEC Statement', weight: 2 },
        { regex: /^\/\/[A-Z0-9@#$.]{0,17}\s+DD\s+/im, name: 'DD Statement', weight: 2 },
        { regex: /^\/\/[A-Z0-9@#$]{1,8}\s+PROC\b/im, name: 'PROC Statement', weight: 2 },
        { regex: /^\/\/(?:STEPLIB|JOBLIB)\s+DD\b/im, name: 'STEPLIB/JOBLIB', weight: 1 },
        { regex: /^\/\/(?!\*).*\bSYSOUT=/im, name: 'SYSOUT parameter', weight: 1 },
        { regex: /^\/\/(?!\*).*\bDISP=/im, name: 'DISP parameter', weight: 1 }
    ];

    private cobolPatterns: Pattern[] = [
        { regex: /\b(?:IDENTIFICATION|ID)\s+DIVISION\b/i, name: 'IDENTIFICATION DIVISION', weight: 3 },
        { regex: /\bPROCEDURE\s+DIVISION\b/i, name: 'PROCEDURE DIVISION', weight: 3 },
        { regex: /\bENVIRONMENT\s+DIVISION\b/i, name: 'ENVIRONMENT DIVISION', weight: 1 },
        { regex: /\bDATA\s+DIVISION\b/i, name: 'DATA DIVISION', weight: 1 },
        { regex: /\b(?:WORKING-STORAGE|LOCAL-STORAGE|LINKAGE|FILE)\s+SECTION\b/i, name: 'Storage/File SECTION', weight: 1 },
        { regex: /\bPIC(?:TURE)?\s+(?:IS\s+)?[-+$*SXAZ9BV(]/i, name: 'PIC Clause', weight: 1 },
        { regex: /\b(?:COMP(?:UTATIONAL)?-[1-5]|PACKED-DECIMAL)\b/i, name: 'COMP/PACKED Usage', weight: 1 },
        { regex: /\b(?:GOBACK|STOP\s+RUN|END-(?:IF|EVALUATE|PERFORM|READ))\b/i, name: 'COBOL statements', weight: 1 }
    ];

    /** Traços que não decidem o tipo, mas ajudam o roteamento. */
    private traitPatterns: Pattern[] = [
        { regex: /\bEXEC\s+SQL\b/i, name: 'DB2 (EXEC SQL)', weight: 0 },
        { regex: /\bEXEC\s+CICS\b/i, name: 'CICS (EXEC CICS)', weight: 0 },
        { regex: /\bDFH(?:MSD|MDI|MDF)\b/i, name: 'BMS map', weight: 0 }
    ];

    public classify(content: string): CodeClassification {
        if (!content || content.trim() === '') {
            return { detectedType: 'unknown', confidence: 'LOW', evidence: [] };
        }

        const { jclText, cobolText } = this.prepare(content);
        const jcl = this.score(jclText, this.jclPatterns);
        const cobol = this.score(cobolText, this.cobolPatterns);
        const traits = this.traitPatterns.filter(p => p.regex.test(cobolText)).map(p => p.name);

        if (jcl.score === 0 && cobol.score === 0) {
            return { detectedType: 'unknown', confidence: 'LOW', evidence: traits };
        }
        if (jcl.score === cobol.score) {
            return { detectedType: 'unknown', confidence: 'LOW', evidence: [...jcl.evidence, ...cobol.evidence, ...traits] };
        }

        const isJcl = jcl.score > cobol.score;
        const winner = isJcl ? jcl : cobol;
        const margin = Math.abs(jcl.score - cobol.score);
        let confidence: 'HIGH' | 'MEDIUM' = winner.score >= 3 && margin >= 2 ? 'HIGH' : 'MEDIUM';
        const evidence = [...winner.evidence];

        if (!isJcl) {
            const isProgram = winner.evidence.includes('IDENTIFICATION DIVISION')
                || winner.evidence.includes('PROCEDURE DIVISION');
            if (!isProgram) {
                confidence = 'MEDIUM';
                evidence.push('Sem DIVISION (provável copybook ou fragmento)');
            }
            evidence.push(...traits);
        }

        return { detectedType: isJcl ? 'jcl' : 'cobol', confidence, evidence };
    }

    private score(text: string, patterns: Pattern[]): { score: number; evidence: string[] } {
        let score = 0;
        const evidence: string[] = [];
        for (const p of patterns) {
            if (p.regex.test(text)) {
                score += p.weight;
                evidence.push(p.name);
            }
        }
        return { score, evidence };
    }

    private prepare(content: string): { jclText: string; cobolText: string } {
        const sample = content.slice(0, CodeClassifier.MAX_SAMPLE_CHARS);
        const lines = sample.split(/\r?\n/).slice(0, CodeClassifier.SAMPLE_LINES);
        const isFree = lines.some(l => />>\s*SOURCE\s+FORMAT\s+(?:IS\s+)?FREE/i.test(l));

        const jclLines: string[] = [];
        const cobolLines: string[] = [];
        for (const raw of lines) {
            // Formato fixo: colunas 73-80 são área de sequência, o compilador ignora.
            const line = (!isFree && raw.length > 72 && raw.length <= 80) ? raw.slice(0, 72) : raw;
            jclLines.push(line);
            if (!this.isCobolComment(line, isFree)) {
                cobolLines.push(line);
            }
        }
        return { jclText: jclLines.join('\n'), cobolText: cobolLines.join('\n') };
    }

    private isCobolComment(line: string, isFree: boolean): boolean {
        if (line.trimStart().startsWith('*>')) { return true; }
        if (!isFree && line.length > 6 && (line[6] === '*' || line[6] === '/')) { return true; }
        return false;
    }
}

export const codeClassifier = new CodeClassifier();
