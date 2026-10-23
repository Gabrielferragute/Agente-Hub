import test from 'node:test';
import assert from 'node:assert/strict';

import {
    validateDatasetInput,
    validateSearchString,
    escapeSearchString,
    validateJobCard,
    buildSrchforJcl,
    interpretSuperCRetcode,
    SrchforValidationError,
    MAX_ESCAPED_SEARCH_LEN,
    MAX_JCL_COLUMN,
    DEFAULT_JOB_CARD
} from '../jobs/srchforTemplate';

test('1. validateDatasetInput aceita datasets válidos com ou sem aspas', () => {
    assert.equal(validateDatasetInput('MEU.PROJETO.COBOL.SRC'), 'MEU.PROJETO.COBOL.SRC');
    assert.equal(validateDatasetInput("'MEU.PROJETO.COBOL.SRC'"), 'MEU.PROJETO.COBOL.SRC');
    assert.equal(validateDatasetInput('  user.cobol.src  '), 'USER.COBOL.SRC');
});

test('2. validateDatasetInput rejeita vazio, membros e nomes inválidos', () => {
    assert.throws(() => validateDatasetInput(''), SrchforValidationError);
    assert.throws(() => validateDatasetInput('   '), SrchforValidationError);
    assert.throws(
        () => validateDatasetInput('MEU.PROJETO.COBOL.SRC(MEM1)'),
        /apenas o Data Set \(PDS\), sem membro/
    );
    assert.throws(() => validateDatasetInput('1INVALID.DATASET'), SrchforValidationError);
    assert.throws(() => validateDatasetInput('DATASET..INVALID'), SrchforValidationError);
    assert.throws(() => validateDatasetInput('A'.repeat(45)), SrchforValidationError);
});

test('3. validateSearchString e escapeSearchString validam e escapam aspas simples', () => {
    assert.equal(validateSearchString('EXEC SQL'), 'EXEC SQL');
    assert.equal(escapeSearchString('EXEC SQL'), 'EXEC SQL');
    assert.equal(escapeSearchString("O'Reilly"), "O''Reilly");
    assert.equal(escapeSearchString("''"), "''''");

    assert.throws(() => validateSearchString(''), SrchforValidationError);
    assert.throws(() => validateSearchString('   '), SrchforValidationError);
    // Rejeita caracteres não-ASCII
    assert.throws(() => validateSearchString('Açúcar'), /apenas caracteres ASCII/);
    assert.throws(() => validateSearchString('Contrato com ação'), /apenas caracteres ASCII/);

    // Limite de tamanho
    const maxStr = 'A'.repeat(MAX_ESCAPED_SEARCH_LEN);
    assert.equal(validateSearchString(maxStr), maxStr);

    const tooLongStr = 'A'.repeat(MAX_ESCAPED_SEARCH_LEN + 1);
    assert.throws(() => validateSearchString(tooLongStr), /String muito longa/);

    // Aspas simples contam dobrado
    const strWithManyQuotes = "'".repeat(35); // 35 * 2 = 70 > MAX_ESCAPED_SEARCH_LEN
    assert.throws(() => validateSearchString(strWithManyQuotes), /String muito longa/);
});

test('4. validateJobCard valida jobName, account, class e msgClass', () => {
    const def = validateJobCard(undefined);
    assert.equal(def.jobName, DEFAULT_JOB_CARD.jobName);
    assert.equal(def.accountInfo, DEFAULT_JOB_CARD.accountInfo);
    assert.equal(def.jobClass, DEFAULT_JOB_CARD.jobClass);
    assert.equal(def.msgClass, DEFAULT_JOB_CARD.msgClass);

    const custom = validateJobCard({
        jobName: 'MYJOB1',
        accountInfo: 'DEPT77,BOX1',
        jobClass: 'B',
        msgClass: 'T'
    });
    assert.equal(custom.jobName, 'MYJOB1');
    assert.equal(custom.accountInfo, 'DEPT77,BOX1');
    assert.equal(custom.jobClass, 'B');
    assert.equal(custom.msgClass, 'T');

    assert.throws(() => validateJobCard({ jobName: '1INVALID' }), SrchforValidationError);
    assert.throws(() => validateJobCard({ jobName: 'TOOLONGAJOBNAME' }), SrchforValidationError);
    assert.throws(() => validateJobCard({ jobClass: 'AB' }), SrchforValidationError);
    assert.throws(() => validateJobCard({ msgClass: '' }), SrchforValidationError);
});

test('5. buildSrchforJcl gera JCL padrão e assegura limite de coluna <= 71', () => {
    const jcl = buildSrchforJcl({
        dataset: 'MEU.PROJETO.COBOL.SRC',
        searchString: 'EXEC SQL'
    });

    assert.ok(jcl.includes('//SRCHFOR  JOB (ACCT),\'SRCHFOR\','));
    assert.ok(jcl.includes('//STEP1    EXEC PGM=ISRSUPC,PARM=\'SRCHCMP,ANYC\''));
    assert.ok(jcl.includes('//NEWDD    DD DISP=SHR,DSN=MEU.PROJETO.COBOL.SRC'));
    assert.ok(jcl.includes('//OUTDD    DD SYSOUT=*'));
    assert.ok(jcl.includes('//SYSIN    DD *'));
    assert.ok(jcl.includes("  SRCHFOR 'EXEC SQL'"));
    assert.ok(jcl.endsWith('/*\n'));

    // Verifica que NENHUMA linha passa da coluna 71
    const lines = jcl.split('\n').filter(l => l.length > 0);
    for (const line of lines) {
        assert.ok(
            line.length <= MAX_JCL_COLUMN,
            `Linha excede ${MAX_JCL_COLUMN} caracteres (${line.length}): "${line}"`
        );
    }
});

test('6. buildSrchforJcl escapa string com aspas no SYSIN', () => {
    const jcl = buildSrchforJcl({
        dataset: 'USER.TEST.SRC',
        searchString: "WHERE CD_CLI = '123'"
    });
    assert.ok(jcl.includes("  SRCHFOR 'WHERE CD_CLI = ''123'''"));
});

test('7. interpretSuperCRetcode interpreta códigos do ISRSUPC corretamente', () => {
    // RC 0 = string NÃO encontrada
    const r0 = interpretSuperCRetcode('CC 0000');
    assert.equal(r0.outcome, 'NOT_FOUND');
    assert.equal(r0.rc, 0);

    // RC 1 = string encontrada
    const r1 = interpretSuperCRetcode('CC 0001');
    assert.equal(r1.outcome, 'FOUND');
    assert.equal(r1.rc, 1);

    // RC 4 = aviso
    const r4 = interpretSuperCRetcode('CC 0004');
    assert.equal(r4.outcome, 'WARNING');
    assert.equal(r4.rc, 4);

    // RC 28 = nada pesquisado
    const r28 = interpretSuperCRetcode('CC 0028');
    assert.equal(r28.outcome, 'ERROR');
    assert.equal(r28.rc, 28);

    // RC 8, 16, 32 = erros
    assert.equal(interpretSuperCRetcode('CC 0008').outcome, 'ERROR');
    assert.equal(interpretSuperCRetcode('CC 0016').outcome, 'ERROR');

    // ABEND ou erro de JCL
    const abend = interpretSuperCRetcode('ABEND S806');
    assert.equal(abend.outcome, 'ERROR');
    assert.ok(abend.message.includes('ABEND S806'));

    const jclErr = interpretSuperCRetcode('JCL ERROR');
    assert.equal(jclErr.outcome, 'ERROR');

    // Null ou vazio
    assert.equal(interpretSuperCRetcode(null).outcome, 'UNKNOWN');
    assert.equal(interpretSuperCRetcode('').outcome, 'UNKNOWN');
});
