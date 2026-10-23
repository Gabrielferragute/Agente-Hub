import * as vscode from 'vscode';
import { ProfileInfo } from '@zowe/imperative';

export async function runZoweSpike() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   ZOWE VALIDAÇÃO FINAL (PROFILE ZOSMF)                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const ext = vscode.extensions.getExtension('Zowe.vscode-extension-for-zowe');
    if (!ext || !ext.exports) {
        console.log('❌ Zowe Explorer inativo.');
        return;
    }

    const printProfileSafe = (name: string, api: any) => {
        console.log(`\n--- ${name.toUpperCase()} API (zosmf) ---`);
        if (!api) {
            console.log('API não encontrada.');
            return;
        }

        // Tentar encontrar um objeto profile atrelado à API (em Zowe Explorer costuma ser a session)
        const prof = api.profile || api.session || api.session?.profile || api.mProfile || null;
        if (prof) {
            console.log(`- profName: ${prof.profName || prof.name || '(desconhecido)'}`);
            console.log(`- profType: ${prof.profType || prof.type || '(desconhecido)'}`);
            console.log(`- isDefaultProfile: ${prof.isDefaultProfile !== undefined ? prof.isDefaultProfile : '(desconhecido)'}`);
            console.log(`- profLoc: ${prof.profLoc || '(desconhecido)'}`);
        } else {
            console.log('Nenhum objeto "profile" ou "session" exposto publicamente na implementação.');
        }
    };

    if (ext.exports.mvsApiImplementations instanceof Map) {
        printProfileSafe('MVS', ext.exports.mvsApiImplementations.get('zosmf'));
    }
    if (ext.exports.jesApiImplementations instanceof Map) {
        printProfileSafe('JES', ext.exports.jesApiImplementations.get('zosmf'));
    }
    if (ext.exports.ussApiImplementations instanceof Map) {
        printProfileSafe('USS', ext.exports.ussApiImplementations.get('zosmf'));
    }

    console.log('\n==================================================');
    console.log('PROFILE DO SISTEMA (@zowe/imperative)');
    console.log('==================================================');
    try {
        const profileInfo = new ProfileInfo('zowe');
        await profileInfo.readProfilesFromDisk();
        const defaultProfile = profileInfo.getDefaultProfile('zosmf');
        
        if (defaultProfile) {
            // Usa as propriedades corretas reveladas
            const p: any = defaultProfile;
            console.log(`- profName: ${p.profName || '(desconhecido)'}`);
            console.log(`- profType: ${p.profType || '(desconhecido)'}`);
            console.log(`- isDefaultProfile: ${p.isDefaultProfile !== undefined ? p.isDefaultProfile : '(desconhecido)'}`);
            console.log(`- profLoc: ${p.profLoc || '(desconhecido)'}`);
        } else {
            console.log('Default zosmf profile: NENHUM');
        }
    } catch (e) {
        console.log(`Erro ao buscar profile: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log('\n════════════════════════════════════════════════════════════════\n');
}
