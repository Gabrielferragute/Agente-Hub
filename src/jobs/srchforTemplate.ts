/**
 * srchforTemplate.ts
 *
 * Template FIXO do JOB de busca do SuperC (PGM=ISRSUPC, SRCHFOR).
 *
 * Esta é a ÚNICA exceção controlada ao modelo read-only da extensão:
 *   - O usuário informa apenas DOIS valores: dataset e string de busca.
 *   - O JCL é sempre gerado por este módulo; nunca há submit de JCL livre
 *     (nem digitado pelo usuário, nem gerado pela IA).
 *   - Todo valor é validado antes de entrar no JCL (fail-closed).
 *
 * Módulo puro (sem dependência de vscode) para poder ser testado com node:test.
 *
 * Referência dos return codes do Search-For (IBM ISPF User's Guide Vol II):
 *   RC 0  = concluído, string NÃO encontrada
 *   RC 1  = concluído, string encontrada
 *   RC 4  = aviso: entrada/opção inválida detectada
 *   RC 8+ = erro;  RC 28 = nada pesquisado (vazio / sem membros)
 */

import { isValidDatasetName } from '../zowe/datasetGuard';

export class SrchforValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SrchforValidationError';
    }
}

export interface SrchforInput {
    dataset: string;
    searchString: string;
}

export interface SrchforJobCard {
    jobName: string;
    accountInfo: string;
    jobClass: string;
    msgClass: string;
}

export const DEFAULT_JOB_CARD: SrchforJobCard = Object.freeze({
    jobName: 'SRCHFOR',
    accountInfo: 'ACCT',
    jobClass: 'A',
    msgClass: 'X'
});

/** Colunas 72-80 são reservadas (continuação/sequência) em JCL e SYSIN. */
export const MAX_JCL_COLUMN = 71;
const SYSIN_PREFIX = "  SRCHFOR '";
/** Tamanho máximo da string já escapada (aspas simples contam em dobro). */
export const MAX_ESCAPED_SEARCH_LEN = MAX_JCL_COLUMN - SYSIN_PREFIX.length - 1;

const JOBNAME = /^[A-Z@#$][A-Z0-9@#$]{0,7}$/;
const ACCOUNT = /^[A-Z0-9@#$.,-]{1,40}$/;
const CLASS = /^[A-Z0-9]$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

/**
 * Normaliza e valida o dataset. Aceita o formato TSO com aspas ('A.B.C').
 * Não aceita membro: o SRCHFOR pesquisa todos os membros do PDS.
 */
export function validateDatasetInput(raw: string): string {
    let ds = (raw ?? '').trim().toUpperCase();
    if (ds.length >= 2 && ds.startsWith("'") && ds.endsWith("'")) {
        ds = ds.slice(1, -1).trim();
    }
    if (!ds) {
        throw new SrchforValidationError('Informe o nome do Data Set.');
    }
    if (ds.includes('(')) {
        throw new SrchforValidationError('Informe apenas o Data Set (PDS), sem membro. A busca percorre todos os membros.');
    }
    if (!isValidDatasetName(ds)) {
        throw new SrchforValidationError(
            `Nome de Data Set inválido: "${ds}". Use qualificadores de até 8 caracteres (A-Z, 0-9, @#$-), começando por letra, separados por ponto, até 44 no total.`
        );
    }
    return ds;
}

/** Escapa aspas simples no padrão do SuperC/JCL: ' vira ''. */
export function escapeSearchString(s: string): string {
    return s.replace(/'/g, "''");
}

/**
 * Valida a string de busca. Retorna o valor (sem escape), apenas com trim nas pontas.
 * Rejeita acentos/ç: a conversão ASCII->EBCDIC depende da codepage do host
 * e a busca poderia não encontrar o texto esperado.
 */
export function validateSearchString(raw: string): string {
    const s = (raw ?? '').trim();
    if (!s) {
        throw new SrchforValidationError('Informe a string a ser pesquisada.');
    }
    if (!PRINTABLE_ASCII.test(s)) {
        throw new SrchforValidationError(
            'Use apenas caracteres ASCII imprimíveis (sem acentos, ç ou caracteres de controle). A conversão para EBCDIC poderia alterar o texto pesquisado.'
        );
    }
    const escaped = escapeSearchString(s);
    if (escaped.length > MAX_ESCAPED_SEARCH_LEN) {
        throw new SrchforValidationError(
            `String muito longa: ${escaped.length} caracteres (máximo ${MAX_ESCAPED_SEARCH_LEN}; aspas simples contam em dobro). O SYSIN só usa até a coluna ${MAX_JCL_COLUMN}.`
        );
    }
    return s;
}

export function validateJobCard(card: Partial<SrchforJobCard> | undefined): SrchforJobCard {
    const resolveField = (val: string | undefined, def: string) =>
        (val !== undefined ? val : def).trim().toUpperCase();

    const c = {
        jobName: resolveField(card?.jobName, DEFAULT_JOB_CARD.jobName),
        accountInfo: resolveField(card?.accountInfo, DEFAULT_JOB_CARD.accountInfo),
        jobClass: resolveField(card?.jobClass, DEFAULT_JOB_CARD.jobClass),
        msgClass: resolveField(card?.msgClass, DEFAULT_JOB_CARD.msgClass)
    };
    if (!JOBNAME.test(c.jobName)) {
        throw new SrchforValidationError(`Jobname inválido: "${c.jobName}" (1 a 8 caracteres, começando por letra ou @#$).`);
    }
    if (!ACCOUNT.test(c.accountInfo)) {
        throw new SrchforValidationError(`Informação de conta inválida: "${c.accountInfo}" (até 40 caracteres: A-Z, 0-9, @#$.,-).`);
    }
    if (!CLASS.test(c.jobClass)) {
        throw new SrchforValidationError(`CLASS inválida: "${c.jobClass}" (1 caractere A-Z ou 0-9).`);
    }
    if (!CLASS.test(c.msgClass)) {
        throw new SrchforValidationError(`MSGCLASS inválida: "${c.msgClass}" (1 caractere A-Z ou 0-9).`);
    }
    return c;
}

/**
 * Gera o JCL final. Todos os valores passam pelas validações acima;
 * nada do usuário entra no JCL sem validação.
 */
export function buildSrchforJcl(input: SrchforInput, jobCard?: Partial<SrchforJobCard>): string {
    const dataset = validateDatasetInput(input.dataset);
    const search = validateSearchString(input.searchString);
    const card = validateJobCard(jobCard);

    const lines = [
        `//${card.jobName.padEnd(8)} JOB (${card.accountInfo}),'SRCHFOR',`,
        `//             CLASS=${card.jobClass},MSGCLASS=${card.msgClass},NOTIFY=&SYSUID`,
        `//STEP1    EXEC PGM=ISRSUPC,PARM='SRCHCMP,ANYC'`,
        `//NEWDD    DD DISP=SHR,DSN=${dataset}`,
        `//OUTDD    DD SYSOUT=*`,
        `//SYSIN    DD *`,
        `${SYSIN_PREFIX}${escapeSearchString(search)}'`,
        `/*`
    ];

    // Defesa extra: nenhuma linha pode passar da coluna 71.
    const tooLong = lines.find(l => l.length > MAX_JCL_COLUMN);
    if (tooLong) {
        throw new SrchforValidationError(`Linha de JCL excede a coluna ${MAX_JCL_COLUMN}: "${tooLong}"`);
    }
    return lines.join('\n') + '\n';
}

export type SuperCOutcome = 'FOUND' | 'NOT_FOUND' | 'WARNING' | 'ERROR' | 'UNKNOWN';

export interface SuperCInterpretation {
    outcome: SuperCOutcome;
    rc?: number;
    message: string;
}

/** Interpreta o retcode do JES (ex.: "CC 0001", "ABEND S806", "JCL ERROR"). */
export function interpretSuperCRetcode(retcode: string | null | undefined): SuperCInterpretation {
    if (!retcode || !retcode.trim()) {
        return { outcome: 'UNKNOWN', message: 'JOB sem retcode (ainda em execução ou informação indisponível).' };
    }
    const m = /^CC\s+(\d{1,4})$/i.exec(retcode.trim());
    if (!m) {
        return {
            outcome: 'ERROR',
            message: `JOB terminou com "${retcode.trim()}" (ABEND ou erro de JCL). Veja JESMSGLG/JESYSMSG no spool.`
        };
    }
    const rc = parseInt(m[1], 10);
    switch (rc) {
        case 0:
            return { outcome: 'NOT_FOUND', rc, message: 'RC 0: busca concluída, string NÃO encontrada.' };
        case 1:
            return { outcome: 'FOUND', rc, message: 'RC 1: string encontrada. Veja o relatório OUTDD.' };
        case 4:
            return { outcome: 'WARNING', rc, message: 'RC 4: aviso do SuperC (entrada ou opção inválida). O resultado pode estar incompleto. Confira o OUTDD.' };
        case 28:
            return { outcome: 'ERROR', rc, message: 'RC 28: nada foi pesquisado (Data Set vazio, sem membros ou nome inválido).' };
        default:
            return rc >= 8
                ? { outcome: 'ERROR', rc, message: `RC ${rc}: erro do SuperC. Veja OUTDD e JESMSGLG.` }
                : { outcome: 'WARNING', rc, message: `RC ${rc}: código não esperado para Search-For. Confira o OUTDD.` };
    }
}
