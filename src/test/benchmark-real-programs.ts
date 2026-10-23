import * as fs from 'fs';
import * as path from 'path';
import { codeClassifier } from '../mainframe/codeClassifier';
import { normalizeSource, prepareForLlm } from '../context/smartTruncate';

function runBenchmark() {
    console.log('================================================================');
    console.log('       BENCHMARK DE VALIDAÇÃO COM PROGRAMAS REAIS MAINFRAME     ');
    console.log('================================================================\n');

    // A pasta Programas/ é privada (não versionada). Coloque nela seus próprios
    // fontes COBOL/JCL localmente para rodar o benchmark.
    const programasDir = path.join(process.cwd(), 'Programas');
    if (!fs.existsSync(programasDir)) {
        console.log(`Pasta "${programasDir}" não encontrada. Crie-a e adicione fontes COBOL/JCL para rodar o benchmark.`);
        return;
    }
    const files = fs.readdirSync(programasDir);

    for (const file of files) {
        const filePath = path.join(programasDir, file);
        if (!fs.statSync(filePath).isFile()) continue;

        const rawContent = fs.readFileSync(filePath, 'utf8');
        const rawLines = rawContent.split(/\r?\n/);
        const rawChars = rawContent.length;

        console.log(`----------------------------------------------------------------`);
        console.log(`ARQUIVO: ${file}`);
        console.log(`Tamanho Bruto: ${rawChars.toLocaleString()} caracteres | ${rawLines.length} linhas`);

        // 1. Classificação
        const classification = codeClassifier.classify(rawContent);
        console.log(`\n[1. CLASSIFICAÇÃO]`);
        console.log(`  Tipo Detectado: ${classification.detectedType}`);
        console.log(`  Confiança:      ${classification.confidence}`);
        console.log(`  Evidências:     ${classification.evidence.join(', ')}`);

        // 2. Normalização (remoção de col 73-80 e brancos à direita)
        const normalizedLines = normalizeSource(rawContent);
        const normalizedText = normalizedLines.join('\n');
        const normalizedChars = normalizedText.length;
        const savedChars = rawChars - normalizedChars;
        const percentSaved = ((savedChars / rawChars) * 100).toFixed(2);

        console.log(`\n[2. NORMALIZAÇÃO]`);
        console.log(`  Caracteres pós-normalização: ${normalizedChars.toLocaleString()}`);
        console.log(`  Espaço economizado:          ${savedChars.toLocaleString()} caracteres (${percentSaved}%)`);

        // 3. Simulação de Truncamento por Tier (Economy, Standard, Deep)
        console.log(`\n[3. SIMULAÇÃO DE ORÇAMENTO (dropBlankLines: false)]`);
        const budgets = [
            { name: 'ECONOMY (8.000 chars)', maxChars: 8000 },
            { name: 'STANDARD (20.000 chars)', maxChars: 20000 },
            { name: 'DEEP (45.000 chars)', maxChars: 45000 },
            { name: 'LLM MAX (100.000 chars)', maxChars: 100000 }
        ];

        for (const b of budgets) {
            const prepared = prepareForLlm(rawContent, { maxChars: b.maxChars, dropBlankLines: false });
            console.log(`\n  * Nível: ${b.name}`);
            console.log(`    - Truncado:      ${prepared.truncated ? 'SIM' : 'NÃO'}`);
            console.log(`    - Linhas enviadas: ${prepared.sentLines} de ${prepared.totalLines}`);
            console.log(`    - Caracteres:    ${prepared.text.length.toLocaleString()} (limite: ${b.maxChars.toLocaleString()})`);
            console.log(`    - Mensagem de Cobertura:`);
            console.log(`      "${prepared.coverage}"`);

            // Validação de alinhamento de linha
            if (prepared.truncated) {
                // Verificar se contém marcadores de omissão
                const hasOmissionMarker = prepared.text.includes('*** [TRECHO OMITIDO');
                console.log(`    - Marcador de omissão presente no corpo: ${hasOmissionMarker ? 'SIM' : 'NÃO'}`);
            }
        }

        console.log('\n');
    }
}

runBenchmark();
