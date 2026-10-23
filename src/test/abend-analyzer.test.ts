import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeAbendSpool } from '../mainframe/abendAnalyzer';

test('1. analyzeAbendSpool detecta JCL ERROR com dataset não encontrado', () => {
    const spool = `
12.30.50 JOB03166  IEF453I SRCHFOR - JOB FAILED - JCL ERROR
IEF236I ALLOC. FOR SRCHFOR STEP1
IEFA107I SRCHFOR STEP1 NEWDD - DATA SET MEU.TESTE.SRC NOT FOUND
IEF272I SRCHFOR STEP1 - STEP WAS NOT EXECUTED.
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'JCL_ERROR');
    assert.equal(res.failedStep, 'STEP1');
    assert.ok(res.diagnosis.includes('MEU.TESTE.SRC'));
    assert.ok(res.action.includes('catalogado'));
});

test('2. analyzeAbendSpool detecta JCL ERROR com IEF642I (tamanho de parâmetro)', () => {
    const spool = `
12.34.40 JOB04408  IEF452I TESTERR  - JOB NOT RUN - JCL ERROR
3 IEF642I EXCESSIVE PARAMETER LENGTH IN THE DSNAME FIELD
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'JCL_ERROR');
    assert.ok(res.diagnosis.includes('DSNAME'));
    assert.ok(res.action.includes('MVS'));
});

test('3. analyzeAbendSpool detecta S0C7 e traz diagnóstico de Data Exception', () => {
    const spool = `
IEF450I MEUJOB STEP01 - ABEND=S0C7 U0000 REASON=00000007
IEA995I SYMPTOM DUMP OUTPUT  SYSTEM COMPLETION CODE=0C7  REASON CODE=00000007
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'ABEND');
    assert.ok(res.abendCode?.includes('S0C7'));
    assert.ok(res.diagnosis.includes('não numéricos'));
    assert.ok(res.action.includes('INITIALIZE'));
});

test('4. analyzeAbendSpool detecta S0C4 (Protection Exception)', () => {
    const spool = `
SYSTEM COMPLETION CODE=0C4  REASON CODE=00000010
IEF450I JOBTEST STEP02 - ABEND=S0C4
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'ABEND');
    assert.ok(res.abendCode?.includes('S0C4'));
    assert.ok(res.diagnosis.includes('OCCURS'));
});

test('5. analyzeAbendSpool detecta U4038 (LE Severe Error)', () => {
    const spool = `
USER COMPLETION CODE=4038 REASON CODE=00000001
CEE3204S The system detected a protection exception.
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'ABEND');
    assert.ok(res.abendCode?.includes('U4038'));
    assert.ok(res.action.includes('CEEDUMP'));
});

test('6. analyzeAbendSpool detecta sucesso com COND CODE 0001', () => {
    const spool = `
IEF142I SRCHFOR STEP1 - STEP WAS EXECUTED - COND CODE 0001
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'SUCCESS');
    assert.ok(res.diagnosis.includes('COND CODE 0001'));
});

test('7. analyzeAbendSpool detecta COND CODE alto como HIGH_RC', () => {
    const spool = `
IEF142I MEUJOB STEP1 - STEP WAS EXECUTED - COND CODE 0012
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'HIGH_RC');
    assert.ok(res.diagnosis.includes('COND CODE alto'));
});

test('8. analyzeAbendSpool extrai step, programa, offset, linha COBOL e campos de S0C7 real', () => {
    const spool = `
IEF472I TESTS0C7 GO CLG - COMPLETION CODE - SYSTEM=0C7 USER=0000 REASON=00000007
0  000005                01  WS-ALFA                PIC X(3) VALUE 'ABC'.
   000006                01  WS-NUM REDEFINES WS-ALFA PIC S9(5) COMP-3.
   000007                01  WS-TOTAL               PIC S9(5) COMP-3 VALUE 0.
   000010                    ADD WS-NUM TO WS-TOTAL.
0LINEID  HEXLOC  VERBCODE                     LINEID  HEXLOC  VERBCODE
 000009  000168  DISPLAY                      000010  00017C  ADD
 CEE3207S The system detected a data exception (System Completion Code=0C7).
          From compile unit TESTS0C7 at entry point TESTS0C7 at compile unit offset +00000182 at entry offset +00000182
`;
    const res = analyzeAbendSpool(spool);
    assert.equal(res.status, 'ABEND');
    assert.equal(res.failedStep, 'CLG.GO');
    assert.equal(res.program, 'TESTS0C7');
    assert.equal(res.offset, '00000182');
    assert.equal(res.cobolLine, '000010');
    assert.equal(res.cobolSourceLine, 'ADD WS-NUM TO WS-TOTAL.');
    assert.ok(res.leMessage?.includes('CEE3207S'));
    assert.ok(res.fields && res.fields.length >= 2);
    const numField = res.fields?.find(f => f.name === 'WS-NUM');
    assert.ok(numField);
    assert.ok(numField?.definition.includes('COMP-3'));
    assert.ok(numField?.redefines?.includes('WS-ALFA'));
});

