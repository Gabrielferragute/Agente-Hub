import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredModel {
    id: string;
    name: string;
    family: string;
    vendor: string;
    version: string;
    maxInputTokens: number;
}

/**
 * Descobre todos os modelos disponíveis via Language Model API e compara
 * com o catálogo visual levantado manualmente.
 * 
 * Essa função NÃO faz associações automáticas.
 * Ela apenas loga o inventário para análise humana.
 */
export async function discoverModels(): Promise<DiscoveredModel[]> {
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   INVENTÁRIO DE MODELOS - VS Code Language Model API       ║');
    console.log('║   Vendor: copilot                                          ║');
    console.log('║   Data: ' + new Date().toISOString() + '                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const apiModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });

    if (apiModels.length === 0) {
        console.warn('⚠️  Nenhum modelo retornado pela API. Verifique se o GitHub Copilot está autenticado e ativo.');
        return [];
    }

    console.log(`Total de modelos retornados pela API: ${apiModels.length}\n`);
    console.log('─'.repeat(120));
    console.log(
        padRight('id', 45) +
        padRight('name', 30) +
        padRight('family', 25) +
        padRight('vendor', 12) +
        padRight('version', 10) +
        'maxInputTokens'
    );
    console.log('─'.repeat(120));

    const discovered: DiscoveredModel[] = [];

    for (const m of apiModels) {
        const entry: DiscoveredModel = {
            id: m.id || '(vazio)',
            name: m.name || '(vazio)',
            family: m.family || '(vazio)',
            vendor: m.vendor || '(vazio)',
            version: m.version || '(vazio)',
            maxInputTokens: m.maxInputTokens || 0
        };
        discovered.push(entry);

        console.log(
            padRight(entry.id, 45) +
            padRight(entry.name, 30) +
            padRight(entry.family, 25) +
            padRight(entry.vendor, 12) +
            padRight(entry.version, 10) +
            String(entry.maxInputTokens)
        );
    }

    console.log('─'.repeat(120));

    // Comparação com o catálogo visual
    const catalogPath = path.join(__dirname, '../../config/catalog.json');
    try {
        if (fs.existsSync(catalogPath)) {
            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
            const visualNames = Object.keys(catalog.models || {});
            const apiIds = discovered.map(d => d.id);
            const apiFamilies = discovered.map(d => d.family);
            const apiNames = discovered.map(d => d.name.toLowerCase());

            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║   ANÁLISE DE CORRESPONDÊNCIA (Catálogo Visual vs API)       ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            // Modelos visuais que NÃO apareceram na API
            const missingFromApi: string[] = [];
            for (const vName of visualNames) {
                const logicalName = catalog.models[vName].logicalName?.toLowerCase() || '';
                const found = apiNames.some(n => n.includes(logicalName) || logicalName.includes(n)) ||
                              apiFamilies.some(f => vName.includes(f)) ||
                              apiIds.some(id => id.toLowerCase().includes(vName.replace(/-/g, '')));
                
                if (!found) {
                    missingFromApi.push(`${catalog.models[vName].logicalName} (key: ${vName})`);
                }
            }

            if (missingFromApi.length > 0) {
                console.log(`❌ Modelos do catálogo visual que NÃO foram encontrados na API (${missingFromApi.length}):`);
                for (const m of missingFromApi) {
                    console.log(`   - ${m}`);
                }
            } else {
                console.log('✅ Todos os modelos do catálogo visual parecem ter correspondência na API.');
            }

            // Modelos da API que NÃO estão no catálogo visual
            const extraInApi: string[] = [];
            for (const d of discovered) {
                const nameL = d.name.toLowerCase();
                const idL = d.id.toLowerCase();
                const found = visualNames.some(vName => {
                    const logicalName = catalog.models[vName].logicalName?.toLowerCase() || '';
                    return nameL.includes(logicalName) || logicalName.includes(nameL) ||
                           idL.includes(vName.replace(/-/g, ''));
                });
                if (!found) {
                    extraInApi.push(`${d.name} (id: ${d.id}, family: ${d.family})`);
                }
            }

            if (extraInApi.length > 0) {
                console.log(`\n🆕 Modelos na API que NÃO estavam no catálogo visual (${extraInApi.length}):`);
                for (const m of extraInApi) {
                    console.log(`   - ${m}`);
                }
            } else {
                console.log('\n✅ Nenhum modelo extra encontrado na API além dos catalogados.');
            }

            console.log('\n⚠️  ATENÇÃO: A correspondência acima é heurística (por nome/family).');
            console.log('   Revise manualmente antes de associar apiId no catalog.json.');
        }
    } catch (e) {
        console.error('Erro ao ler catalog.json para comparação:', e);
    }

    console.log('\n════════════════════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════════════
    // TESTE 1 — DIRECT LOOKUP (Busca individual por id/family)
    // ═══════════════════════════════════════════════════════════
    await directLookupTest();

    return discovered;
}

/**
 * Teste 1 — Direct Lookup
 * Tenta consultar individualmente modelos que NÃO apareceram no vendor: 'copilot'.
 * Busca por id, family e variações normalizadas.
 * NÃO envia requests ao LLM.
 */
async function directLookupTest(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║   TESTE 1 — DIRECT LOOKUP (Busca individual)               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const candidates = [
        // Candidatos prioritários que não apareceram no inventário genérico
        'gpt-5.6-terra',
        'gpt-5.6-sol',
        'gpt-6-astra',
        'claude-sonnet-5',
        'claude-opus-5',
        'claude-fable-5.1',
        'gpt-5.3-codex',
        // Variações possíveis de normalização
        'claude-3.5-sonnet',
        'claude-3-opus',
        'gpt-4o',
        'gpt-4o-mini',
        'o1-preview',
        'o1-mini',
    ];

    for (const candidate of candidates) {
        // Tenta por family
        const byFamily = await vscode.lm.selectChatModels({ family: candidate });
        // Tenta sem filtro e compara por id
        const allModels = await vscode.lm.selectChatModels({});
        const byId = allModels.filter(m => m.id.toLowerCase().includes(candidate.toLowerCase()));

        if (byFamily.length > 0) {
            console.log(`✅ "${candidate}" (by family): ${byFamily.length} modelo(s)`);
            for (const m of byFamily) {
                console.log(`   → id: ${m.id} | name: ${m.name} | family: ${m.family} | vendor: ${m.vendor} | version: ${m.version} | maxInput: ${m.maxInputTokens}`);
            }
        } else if (byId.length > 0) {
            console.log(`✅ "${candidate}" (by id inclusion/partial): ${byId.length} modelo(s)`);
            for (const m of byId) {
                console.log(`   → id: ${m.id} | name: ${m.name} | family: ${m.family} | vendor: ${m.vendor} | version: ${m.version} | maxInput: ${m.maxInputTokens}`);
            }
        } else {
            console.log(`❌ "${candidate}" — Não encontrado (nem por family, nem por id)`);
        }
    }

    // Busca ampla sem filtro para ver TUDO que existe (incluindo non-copilot vendors)
    console.log('\n── Busca sem filtro (todos os vendors) ──');
    const everything = await vscode.lm.selectChatModels({});
    console.log(`Total de modelos sem filtro de vendor: ${everything.length}`);
    for (const m of everything) {
        console.log(`   id: ${m.id} | name: ${m.name} | family: ${m.family} | vendor: ${m.vendor} | version: ${m.version} | maxInput: ${m.maxInputTokens}`);
    }
    console.log('');
}

function padRight(str: string, len: number): string {
    return str.length >= len ? str.substring(0, len - 1) + ' ' : str + ' '.repeat(len - str.length);
}
