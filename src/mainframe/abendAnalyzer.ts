/**
 * abendAnalyzer.ts
 *
 * Módulo puro (testável sem vscode) para análise automatizada de Spools
 * de JOBs no z/OS. Detecta assinaturas de:
 *   - JCL ERROR (ex: dataset não encontrado, parâmetro excedido, sintaxe)
 *   - System ABENDs (S0C7, S0C4, S013, S806, SD37, S322, S222, etc.)
 *   - User ABENDs (U4038 do Language Environment / COBOL, etc.)
 *   - Condition Codes de passos (RC=0008, 0012, 0016)
 */

export interface AbendAnalysisResult {
    status: 'JCL_ERROR' | 'ABEND' | 'SUCCESS' | 'HIGH_RC' | 'UNKNOWN';
    failedStep?: string;
    abendCode?: string;
    diagnosis: string;
    action: string;
    errorLines: string[];
    program?: string;
    offset?: string;
    cobolLine?: string;
    cobolSourceLine?: string;
    leMessage?: string;
    fields?: { name: string; definition: string; redefines?: string }[];
}

export const COMMON_ABENDS: Record<string, { name: string; cause: string; fix: string }> = {
    '0C7': {
        name: 'Data Exception (S0C7)',
        cause: 'Tentativa de operação aritmética com dados não numéricos (ex: campo numérico ou COMP-3 contendo espaços brancos, nulos ou lixo de memória).',
        fix: 'Verifique o registro lido do arquivo. Certifique-se de que variáveis numéricas foram inicializadas com zeros (INITIALIZE) ou teste com "IF CAMPO NUMERIC" antes de operar.'
    },
    '0C4': {
        name: 'Protection Exception (S0C4)',
        cause: 'Violação de memória protegida. Geralmente acesso a índice ou subscrito além dos limites de uma tabela OCCURS, ou ponteiro inválido na LINKAGE SECTION.',
        fix: 'Verifique se os índices e subscritos estão dentro dos limites da tabela (OCCURS) e se todos os parâmetros da LINKAGE SECTION foram passados pelo chamador.'
    },
    '0C1': {
        name: 'Operation Exception (S0C1)',
        cause: 'A CPU tentou executar uma instrução de máquina inválida. Frequentemente provocada por chamada a módulo não carregado ou corrupção de área de código.',
        fix: 'Confira chamadas CALL dinâmicas e certifique-se de que a rotina ou ponteiro foi carregado corretamente antes da execução.'
    },
    '013': {
        name: 'Open Conflict / DCB Mismatch (S013)',
        cause: 'Conflito de atributos de dataset (DCB) entre o programa COBOL (FD) e o JCL/disco, ou membro de PDS inexistente.',
        fix: 'Confira RECFM, LRECL e BLKSIZE entre a FD do programa e o DD correspondente no JCL. Se for PDS, confirme se o membro existe.'
    },
    '806': {
        name: 'Module Not Found (S806)',
        cause: 'O módulo executável especificado no EXEC PGM= não foi encontrado nas bibliotecas do STEPLIB, JOBLIB ou LINKLIST.',
        fix: 'Confira o nome do programa no JCL e certifique-se de que a biblioteca de LOAD correta está definida no STEPLIB.'
    },
    'D37': {
        name: 'Out of Space (SD37)',
        cause: 'O Data Set esgotou o espaço em disco e não há mais extents secundários disponíveis no volume.',
        fix: 'Aumente a alocação de espaço primário/secundário no JCL (parâmetro SPACE=(CYL,(x,y))) ou elimine dados desnecessários.'
    },
    'B37': {
        name: 'End of Volume (SB37)',
        cause: 'O volume em disco encheu e o Data Set não possui volumes adicionais configurados para expansão.',
        fix: 'Especifique volumes adicionais no JCL (ex: UNIT=(SYSDA,5)) ou aloque em um storage group com espaço livre.'
    },
    'E37': {
        name: 'PDS Directory Full (SE37)',
        cause: 'O diretório da PDS encheu e não suporta novos membros.',
        fix: 'Realoque a biblioteca com mais blocos de diretório (terceiro parâmetro de SPACE, ex: SPACE=(CYL,(10,5,50))) ou execute compressão (IEBCOPY).'
    },
    '222': {
        name: 'Cancelled by Operator (S222)',
        cause: 'O JOB foi cancelado manualmente por comando do operador de console.',
        fix: 'Consulte a equipe de operações para entender o motivo do cancelamento manual.'
    },
    '322': {
        name: 'CPU Time Exceeded (S322)',
        cause: 'O tempo limite de CPU configurado no JOB ou no step foi ultrapassado (forte indício de loop infinito).',
        fix: 'Verifique laços de repetição (PERFORM UNTIL) sem condição de parada válida ou ajuste o parâmetro TIME= no JCL se o processamento for legitimamente longo.'
    },
    '4038': {
        name: 'Language Environment Severe Error (U4038)',
        cause: 'Falha grave no runtime do COBOL/LE. Geralmente decorre de uma condição de exceção não tratada no programa.',
        fix: 'Examine o spool procurando a listagem CEEDUMP para identificar a mensagem original do runtime (ex: CEE3204S, IGZ0035S).'
    }
};

export function analyzeAbendSpool(spoolText: string): AbendAnalysisResult {
    const raw = spoolText || '';
    const lines = raw.split(/\r?\n/);

    const isJclError = /JCL ERROR|IEF452I|IEF453I/.test(raw);
    let detectedAbendCode: string | undefined;
    let failedStep: string | undefined;
    let procStep: string | undefined;
    const errorLines: string[] = [];
    let missingDataset: string | undefined;
    let failedDd: string | undefined;

    let leMessage: string | undefined;
    let program: string | undefined;
    let offset: string | undefined;
    const offsetTable: { line: string; loc: number; verb: string }[] = [];
    const sourceLines: Record<string, string> = {};
    const dataDefs: Record<string, string> = {};

    // Varredura linha por linha
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Mensagens do JES/MVS de erro
        const mJes = line.match(/(IEF\d{3}[IWE]|IEFC\d{3}[IWE]|IEFA\d{3}[IWE]|IKJ\d{3}[IWE])\s+(.*)/);
        if (mJes) {
            const id = mJes[1];
            const text = mJes[2];
            // Ignora alocações de rotina normais
            if (!/IEF236I|IEF237I|IEF285I|IGD103I|IGD104I|IEF373I|IEF032I|IEF375I|IEF033I|ICH70001I|IRR010I|IEFC653I/.test(id)) {
                errorLines.push(`${id} ${text}`);
            }
        }

        // Mensagens em STMT
        const mStmt = line.match(/^\s*(\d+)\s+(IEF\d{3}[IWE]|IEFC\d{3}[IWE])\s+(.*)/);
        if (mStmt) {
            errorLines.push(`STMT ${mStmt[1]}: ${mStmt[2]} ${mStmt[3]}`);
        }

        // Step completion code (ex: IEF472I TESTS0C7 GO CLG - COMPLETION CODE - SYSTEM=0C7)
        const mStepEnd = line.match(/IEF472I\s+\S+\s+(\S+)(?:\s+(\S+))?\s+-\s+COMPLETION CODE/);
        if (mStepEnd) {
            if (mStepEnd[2]) {
                failedStep = mStepEnd[2];
                procStep = mStepEnd[1];
            } else {
                failedStep = mStepEnd[1];
            }
        }

        // Dataset não encontrado
        const mNotFound = line.match(/IEFA107I\s+\S+\s+(\S+)\s+(\S+)\s+-\s+DATA SET\s+(\S+)\s+NOT FOUND/);
        if (mNotFound) {
            failedStep = mNotFound[1];
            failedDd = mNotFound[2];
            missingDataset = mNotFound[3];
        }

        // Step executed com RC alto
        const mRc = line.match(/IEF142I\s+\S+\s+(\S+)\s+-\s+STEP WAS EXECUTED\s+-\s+COND CODE\s+(\d+)/);
        if (mRc && parseInt(mRc[2], 10) > 4) {
            failedStep = mRc[1];
        }

        // Detecção de ABEND de sistema
        const mAbendSys = line.match(/ABEND=S([0-9A-F]{3})|SYSTEM COMPLETION CODE=([0-9A-F]{3})|COMPLETION CODE\s+-\s+SYSTEM=([0-9A-F]{3})/);
        if (mAbendSys) {
            detectedAbendCode = mAbendSys[1] || mAbendSys[2] || mAbendSys[3];
        }

        // Detecção de ABEND de usuário
        const mAbendUser = line.match(/USER COMPLETION CODE=([0-9]{4})|COMPLETION CODE\s+-\s+USER=([0-9]{4})/);
        if (mAbendUser) {
            detectedAbendCode = mAbendUser[1] || mAbendUser[2];
        }

        // Detecção de mensagem Language Environment (LE)
        if (!leMessage) {
            const mLe = line.match(/(CEE\d{4}S|IGZ\d{4}[SW])\s+(.*)/);
            if (mLe) {
                leMessage = `${mLe[1]} ${mLe[2].trim()}`;
            }
        }

        // Detecção de Programa e Offset do erro no LE
        if (!offset) {
            const mCu = line.match(/compile unit\s+(\S+).*?compile unit offset\s+[+-]?([0-9A-Fa-f]+)/i);
            if (mCu) {
                program = mCu[1];
                offset = mCu[2];
            }
        }

        // Varredura da tabela de offsets do compilador COBOL (opção OFFSET)
        if (/^\s*\d{6}\s+[0-9A-F]{6}\s+\S/.test(line)) {
            const re = /(\d{6})\s+([0-9A-F]{6})\s+(\S+)/g;
            let match: RegExpExecArray | null;
            while ((match = re.exec(line)) !== null) {
                offsetTable.push({
                    line: match[1],
                    loc: parseInt(match[2], 16),
                    verb: match[3]
                });
            }
        } else {
            // Varredura de linhas do fonte COBOL (opção SOURCE)
            const mSrc = line.match(/^.{0,4}(\d{6}) {8,}(\S.*)$/);
            if (mSrc) {
                const lineId = mSrc[1];
                const text = mSrc[2].replace(/\s{3,}[\dM\s]*$/, '').trim();
                if (!sourceLines[lineId]) {
                    sourceLines[lineId] = text;
                }
                const mDef = text.match(/^(0[1-9]|[1-4]\d|77)\s+([A-Z0-9][A-Z0-9-]*)/);
                if (mDef && !dataDefs[mDef[2]]) {
                    dataDefs[mDef[2]] = text;
                }
            }
        }
    }

    if (procStep && failedStep) {
        failedStep = `${failedStep}.${procStep}`;
    }

    // Identificação da linha exata do COBOL a partir do offset
    let cobolLine: string | undefined;
    let cobolSourceLine: string | undefined;
    const fields: { name: string; definition: string; redefines?: string }[] = [];

    if (offset && offsetTable.length > 0) {
        const off = parseInt(offset, 16);
        const candidates = offsetTable.filter(e => e.loc <= off).sort((a, b) => b.loc - a.loc);
        if (candidates.length > 0) {
            cobolLine = candidates[0].line;
            cobolSourceLine = sourceLines[candidates[0].line];
        }
    }

    if (cobolSourceLine) {
        const wordMatches = cobolSourceLine.match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z][A-Z0-9]{2,}/g) || [];
        const uniqueWords = Array.from(new Set(wordMatches));
        for (const w of uniqueWords) {
            if (dataDefs[w]) {
                const def = dataDefs[w];
                let redefines: string | undefined;
                const mRedef = def.match(/REDEFINES\s+([A-Z0-9-]+)/);
                if (mRedef && dataDefs[mRedef[1]]) {
                    redefines = dataDefs[mRedef[1]];
                }
                fields.push({ name: w, definition: def, redefines });
            }
        }
    }

    // 1. Diagnóstico de JCL ERROR
    if (isJclError) {
        let diagnosis = 'O JOB não pôde ser executado devido a falha na interpretação das instruções ou alocação de datasets (JCL ERROR).';
        let action = 'Verifique os statements de JCL apontados nas mensagens de erro do JES.';

        if (missingDataset) {
            diagnosis = `O Data Set "${missingDataset}" referenciado no DD "${failedDd}" não foi encontrado no catálogo do z/OS.`;
            action = 'Verifique a grafia do Data Set ou certifique-se de que ele foi catalogado antes da execução do job.';
        } else if (/IEF642I/.test(raw)) {
            diagnosis = 'Parâmetro de nome de Data Set (DSNAME) excedeu o limite de caracteres permitido no z/OS (máx 8 por qualificador, máx 44 no total).';
            action = 'Corrija o nome do Data Set no JCL para atender às regras de nomenclatura do MVS.';
        }

        return {
            status: 'JCL_ERROR',
            failedStep,
            diagnosis,
            action,
            errorLines
        };
    }

    // 2. Diagnóstico de ABEND
    if (detectedAbendCode) {
        const lookup = COMMON_ABENDS[detectedAbendCode];
        if (lookup) {
            return {
                status: 'ABEND',
                failedStep,
                abendCode: lookup.name,
                diagnosis: lookup.cause,
                action: lookup.fix,
                errorLines,
                program,
                offset,
                cobolLine,
                cobolSourceLine,
                leMessage,
                fields: fields.length > 0 ? fields : undefined
            };
        }
        return {
            status: 'ABEND',
            failedStep,
            abendCode: `ABEND ${detectedAbendCode}`,
            diagnosis: `O programa encerrou de forma anormal com código de ABEND ${detectedAbendCode}.`,
            action: 'Verifique a listagem de dump ou CEEDUMP no spool para localizar o offset da instrução.',
            errorLines,
            program,
            offset,
            cobolLine,
            cobolSourceLine,
            leMessage,
            fields: fields.length > 0 ? fields : undefined
        };
    }

    // 3. Cond Code normal ou alto
    const mCond = raw.match(/COND CODE\s+(\d{4})/);
    if (mCond) {
        const rc = parseInt(mCond[1], 10);
        if (rc <= 4) {
            return {
                status: 'SUCCESS',
                diagnosis: `O JOB executou normalmente e concluiu com COND CODE ${mCond[1]}.`,
                action: 'Nenhuma ação necessária. O processamento foi bem-sucedido.',
                errorLines: []
            };
        }
        return {
            status: 'HIGH_RC',
            failedStep,
            diagnosis: `O JOB executou, mas um ou mais passos finalizaram com COND CODE alto (${mCond[1]}).`,
            action: 'Examine a saída do programa no spool (SYSPRINT/SYSOUT) para identificar a causa do retorno não zero.',
            errorLines
        };
    }

    return {
        status: 'UNKNOWN',
        diagnosis: 'Não foram detectados indícios evidentes de ABEND ou erro de JCL no trecho analisado.',
        action: 'Consulte o spool completo com a opção -FullSpool para análise detalhada.',
        errorLines
    };
}
