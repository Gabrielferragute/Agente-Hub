import * as vscode from 'vscode';
import { handleIntent, selectModelByLevel } from './router/intentRouter';
import { logTelemetry } from './telemetry/metrics';
import { discoverModels } from './router/modelDiscovery';

import { runZoweSpike } from './zowe/zoweSpike';

import { zoweConnector } from './zowe/zoweConnector';
import { profileResolver } from './zowe/profileResolver';
import { profilePinningManager } from './zowe/profilePinning';
import {
    AmbiguousProfileError,
    NoProfileAvailableError,
    ProductionAccessDeniedError,
    ProfileNotFoundError
} from './zowe/profileTypes';

import { contextProcessor } from './context/contextProcessor';
import { promptBuilder } from './context/promptBuilder';
import { skillManager } from './skillsManager/skillManager';

export function activate(context: vscode.ExtensionContext) {
    // Inventário e Spike: rodar sequencialmente para não misturar logs
    discoverModels()
        .then(() => runZoweSpike())
        .catch(err => {
            console.error('Falha na inicialização de background (Models ou Zowe):', err);
        });

    // ════════════════════════════════════════════════════════════════
    // COMANDOS DE PROFILE PINNING
    // ════════════════════════════════════════════════════════════════

    const pinProfileCmd = vscode.commands.registerCommand('mainframeHub.pinProfile', async () => {
        const available = profileResolver.getAvailableProfiles();
        if (available.length === 0) {
            vscode.window.showWarningMessage('Nenhum profile Zowe (zosmf) encontrado.');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            available.map(name => ({
                label: name,
                description: profileResolver.getEnvironmentClass(name) !== 'UNKNOWN'
                    ? `[${profileResolver.getEnvironmentClass(name)}]`
                    : '[Não classificado]'
            })),
            {
                placeHolder: 'Selecione o profile para fixar na sessão',
                title: 'Mainframe Hub — Pin Profile'
            }
        );

        if (selected) {
            profilePinningManager.pinProfile(selected.label);
            vscode.window.showInformationMessage(`Profile "${selected.label}" fixado na sessão.`);
        }
    });
    context.subscriptions.push(pinProfileCmd);

    const unpinProfileCmd = vscode.commands.registerCommand('mainframeHub.unpinProfile', async () => {
        const current = profilePinningManager.getPinnedProfile();
        if (current) {
            profilePinningManager.unpinProfile();
            vscode.window.showInformationMessage(`Profile "${current}" desafixado.`);
        } else {
            vscode.window.showInformationMessage('Nenhum profile fixado na sessão.');
        }
    });
    context.subscriptions.push(unpinProfileCmd);

    // ════════════════════════════════════════════════════════════════
    // COMANDOS DE TESTE
    // ════════════════════════════════════════════════════════════════

    // Comando de Teste Isolado do Zowe (Sem LLM)
    const testZoweCmd = vscode.commands.registerCommand('mainframeHub.testZoweReadOnly', async () => {
        const fullDataset = await vscode.window.showInputBox({
            prompt: 'Digite o nome do Dataset(Member) para o teste read-only:',
            placeHolder: 'Ex: USER.PROCLIB(MYJOB)'
        });

        if (!fullDataset) return;

        let ds = fullDataset;
        let mem = '';
        if (fullDataset.includes('(')) {
            const parts = fullDataset.split('(');
            ds = parts[0];
            mem = parts[1].replace(')', '');
        } else {
            vscode.window.showErrorMessage('Por favor, informe Dataset e Member. Ex: A.B.C(MEM)');
            return;
        }

        try {
            // Resolve profile UMA VEZ para toda a operação
            const profileCtx = await profileResolver.resolveProfile();

            console.log(`\n--- TESTE ISOLADO ZOWE: readDatasetMember ---`);
            console.log(`Profile: ${profileCtx.profileName}`);
            console.log(`Environment: ${profileCtx.environmentClass}`);
            console.log(`Source: ${profileCtx.source}`);
            
            const startTime = Date.now();
            const result = await zoweConnector.readDatasetMember(profileCtx, ds, mem);
            const durationMs = Date.now() - startTime;
            
            console.log(`Operation: readDatasetMember`);
            console.log(`Dataset: ${result.sourceIdentifier}`);
            console.log(`Success: ${result.error ? 'NO' : 'YES'}`);
            console.log(`DurationMs: ${durationMs}`);
            console.log(`CharsRetrieved: ${result.charsRetrieved}`);
            console.log(`Truncated: ${result.truncated ? 'YES' : 'NO'}`);
            
            if (result.error) {
                console.log(`Error: ${result.error}`);
            }
            console.log(`---------------------------------------------\n`);
        } catch (error) {
            if (error instanceof NoProfileAvailableError ||
                error instanceof AmbiguousProfileError ||
                error instanceof ProductionAccessDeniedError ||
                error instanceof ProfileNotFoundError) {
                vscode.window.showWarningMessage(error.message);
            } else {
                vscode.window.showErrorMessage(`Erro inesperado: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });
    context.subscriptions.push(testZoweCmd);

    // Comando de Teste Isolado do Context Processor (Sem LLM)
    const testCtxCmd = vscode.commands.registerCommand('mainframeHub.testContextProcessor', async () => {
        const fullDataset = await vscode.window.showInputBox({
            prompt: 'Dataset(Member) para teste do Context Processor:',
            placeHolder: 'Ex: Z75221.JCL(JCL2)'
        });

        if (!fullDataset) return;

        let ds = fullDataset;
        let mem = '';
        if (fullDataset.includes('(')) {
            const parts = fullDataset.split('(');
            ds = parts[0];
            mem = parts[1].replace(')', '');
        } else {
            vscode.window.showErrorMessage('Por favor, informe Dataset e Member. Ex: A.B.C(MEM)');
            return;
        }

        // Etapa 0: Resolve profile UMA VEZ para toda a operação
        const profileCtx = await profileResolver.resolveProfile();

        // Etapa 1: Ler do Mainframe via zoweConnector (read-only)
        const zoweResult = await zoweConnector.readDatasetMember(profileCtx, ds, mem);

        // Etapa 2: Processar contexto (sem LLM, sem log de conteúdo)
        const { context: processed, metrics } = contextProcessor.process(zoweResult);

        // Etapa 3: Imprimir apenas métricas no Debug Console
        console.log(`\n--- TESTE CONTEXT PROCESSOR ---`);
        console.log(`SourceType: ${metrics.sourceType}`);
        console.log(`OriginalChars: ${metrics.originalChars}`);
        console.log(`ContextChars: ${metrics.contextChars}`);
        console.log(`Truncated: ${metrics.truncated ? 'YES' : 'NO'}`);
        console.log(`ProcessingDurationMs: ${metrics.processingDurationMs}`);
        if (processed.error) {
            console.log(`Error: ${processed.error}`);
        }
        console.log(`-------------------------------\n`);
    });
    context.subscriptions.push(testCtxCmd);

    // Comando de Teste do JCL Skill Pipeline (Dry-Run, Sem LLM)
    const testJclCmd = vscode.commands.registerCommand('mainframeHub.testJclSkillPipeline', async () => {
        const fullDataset = await vscode.window.showInputBox({
            prompt: 'Dataset(Member) para teste do JCL Skill Pipeline:',
            placeHolder: 'Ex: Z75221.JCL(JCL2)'
        });

        if (!fullDataset) return;

        let ds = fullDataset;
        let mem = '';
        if (fullDataset.includes('(')) {
            const parts = fullDataset.split('(');
            ds = parts[0];
            mem = parts[1].replace(')', '');
        } else {
            vscode.window.showErrorMessage('Por favor, informe Dataset e Member. Ex: A.B.C(MEM)');
            return;
        }

        // Etapa 0: Resolve profile UMA VEZ para toda a operação
        const profileCtx = await profileResolver.resolveProfile();

        // Etapa 1: Ler do Mainframe via zoweConnector (read-only)
        const zoweResult = await zoweConnector.readDatasetMember(profileCtx, ds, mem);
        if (zoweResult.error) {
            console.log(`\n--- TESTE JCL SKILL PIPELINE ---`);
            console.log(`Dataset: ${zoweResult.sourceIdentifier}`);
            console.log(`Skill: jcl-analysis`);
            console.log(`LLMCalled: NO`);
            console.log(`Success: NO`);
            console.log(`Error: ${zoweResult.error}`);
            console.log(`--------------------------------\n`);
            return;
        }

        // Etapa 2: Processar contexto
        const { context: processed } = contextProcessor.process(zoweResult);

        // Etapa 3: Carregar Skill jcl-analysis
        const skill = await skillManager.loadSkill('jcl-analysis');
        if (!skill) {
            console.log(`\n--- TESTE JCL SKILL PIPELINE ---`);
            console.log(`Dataset: ${zoweResult.sourceIdentifier}`);
            console.log(`Skill: jcl-analysis`);
            console.log(`LLMCalled: NO`);
            console.log(`Success: NO`);
            console.log(`Error: Skill jcl-analysis não encontrada`);
            console.log(`--------------------------------\n`);
            return;
        }

        // Etapa 4: Montar prompt (dry-run, sem enviar ao LLM)
        const userRequest = 'Analise este JCL e identifique possíveis problemas.';
        const { metrics } = promptBuilder.buildFromSkillAndContext(skill, processed, userRequest);

        // Etapa 5: Imprimir apenas métricas
        console.log(`\n--- TESTE JCL SKILL PIPELINE ---`);
        console.log(`Dataset: ${zoweResult.sourceIdentifier}`);
        console.log(`Skill: jcl-analysis`);
        console.log(`SourceChars: ${processed.originalChars}`);
        console.log(`ContextChars: ${processed.contextChars}`);
        console.log(`SkillChars: ${metrics.skillChars}`);
        console.log(`KnowledgeChars: ${metrics.knowledgeChars}`);
        console.log(`FinalPromptChars: ${metrics.finalPromptChars}`);
        console.log(`LLMCalled: NO`);
        console.log(`Success: YES`);
        console.log(`--------------------------------\n`);
    });
    context.subscriptions.push(testJclCmd);

    // Comando Temporário de Inventário e Acesso
    const testModelAccessCmd = vscode.commands.registerCommand('mainframeHub.testModelAccess', async () => {
        console.log(`\n--- TESTE MODEL ACCESS ---`);
        const availableModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        
        for (const m of availableModels) {
            const canSend = context.languageModelAccessInformation.canSendRequest(m);
            let canSendStr = 'UNKNOWN';
            if (canSend === true) canSendStr = 'YES';
            else if (canSend === false) canSendStr = 'NO';
            
            let reason = '';
            if (canSend === false) reason = 'ACCESS_DENIED_FOR_EXTENSION';
            else if (canSend === undefined) reason = 'ACCESS_UNKNOWN';
            
            if (m.family === 'gpt-5.6-luna' && canSend === false) {
                reason = 'VS Code core only';
            }

            console.log(`ID: ${m.id}`);
            console.log(`Name: ${m.name}`);
            console.log(`Family: ${m.family}`);
            console.log(`Discovered: YES`);
            console.log(`CanSendRequest: ${canSendStr}`);
            console.log(`RoutingEligible: ${canSend === true ? 'YES' : 'NO'}`);
            if (reason) console.log(`Reason: ${reason}`);
            console.log(`----------------------------------`);
        }
        console.log(`\n`);
    });
    context.subscriptions.push(testModelAccessCmd);

    // Comando Temporário de Smoke Test do GPT-4o Mini
    const testGpt4oMiniCallCmd = vscode.commands.registerCommand('mainframeHub.testGpt4oMiniCall', async () => {
        const availableModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        const targetModel = availableModels.find(m => m.id === 'gpt-4o-mini');

        if (!targetModel) {
            console.log(`\n--- MODEL RUNTIME CALLABILITY TEST ---`);
            console.log(`RequestedModelId: gpt-4o-mini`);
            console.log(`SelectedModelId: NOT_FOUND`);
            console.log(`SelectedModelName: NOT_FOUND`);
            console.log(`CanSendRequest: UNKNOWN`);
            console.log(`SendRequestAttempted: NO`);
            console.log(`RuntimeCallable: NO`);
            console.log(`DurationMs: 0`);
            console.log(`Success: NO`);
            console.log(`ErrorCode: MODEL_NOT_FOUND`);
            console.log(`ErrorMessage: Model gpt-4o-mini not found in selectChatModels.`);
            console.log(`----------------------------------\n`);
            return;
        }

        const canSend = context.languageModelAccessInformation.canSendRequest(targetModel);
        let canSendStr = 'UNKNOWN';
        if (canSend === true) canSendStr = 'YES';
        else if (canSend === false) canSendStr = 'NO';

        let sendAttempted = 'NO';
        let runtimeCallable = 'NO';
        let duration = 0;
        let success = 'NO';
        let errorCode = '';
        let errorMessage = '';

        const messages = [
            vscode.LanguageModelChatMessage.User('Responda somente com OK.')
        ];

        console.log(`\n--- MODEL RUNTIME CALLABILITY TEST ---`);
        console.log(`RequestedModelId: gpt-4o-mini`);
        console.log(`SelectedModelId: ${targetModel.id}`);
        console.log(`SelectedModelName: ${targetModel.name}`);
        console.log(`CanSendRequest: ${canSendStr}`);

        const startTime = Date.now();
        sendAttempted = 'YES';
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Mainframe Hub: Testando runtime callability do GPT-4o Mini...",
                cancellable: false
            }, async () => {
                const chatResponse = await targetModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                for await (const chunk of chatResponse.text) {
                    // apenas consumir a stream
                }
            });
            duration = Date.now() - startTime;
            success = 'YES';
            runtimeCallable = 'YES';
            console.log(`SendRequestAttempted: ${sendAttempted}`);
            console.log(`RuntimeCallable: ${runtimeCallable}`);
            console.log(`ResponseReceived: YES`);
            console.log(`DurationMs: ${duration}`);
            console.log(`Success: ${success}`);
        } catch (error: any) {
            duration = Date.now() - startTime;
            errorCode = error.name || error.code || 'UNKNOWN_ERROR';
            errorMessage = error.message;
            console.log(`SendRequestAttempted: ${sendAttempted}`);
            console.log(`RuntimeCallable: ${runtimeCallable}`);
            console.log(`DurationMs: ${duration}`);
            console.log(`Success: ${success}`);
            console.log(`ErrorCode: ${errorCode}`);
            console.log(`ErrorMessage: ${errorMessage}`);
        }
        console.log(`----------------------------------\n`);
    });
    context.subscriptions.push(testGpt4oMiniCallCmd);

    // Comando de Teste do JCL Router Pipeline (Dry-Run, Sem LLM)
    const testRouterCmd = vscode.commands.registerCommand('mainframeHub.testJclRouterPipeline', async () => {
        const fullDataset = await vscode.window.showInputBox({
            prompt: 'Dataset(Member) para teste do JCL Router Pipeline:',
            placeHolder: 'Ex: Z75221.JCL(JCL2)'
        });

        if (!fullDataset) return;

        let ds = fullDataset;
        let mem = '';
        if (fullDataset.includes('(')) {
            const parts = fullDataset.split('(');
            ds = parts[0];
            mem = parts[1].replace(')', '');
        } else {
            vscode.window.showErrorMessage('Por favor, informe Dataset e Member. Ex: A.B.C(MEM)');
            return;
        }

        // Simulação do user prompt
        const userPrompt = 'analise este jcl e identifique possíveis problemas';

        // 0. Resolve profile UMA VEZ para toda a operação
        const profileCtx = await profileResolver.resolveProfile();

        // 1. Zowe Read-Only
        const zoweResult = await zoweConnector.readDatasetMember(profileCtx, ds, mem);
        if (zoweResult.error) {
            console.log(`\n--- TESTE JCL ROUTER PIPELINE ---`);
            console.log(`Success: NO`);
            console.log(`Error: ${zoweResult.error}`);
            console.log(`----------------------------------\n`);
            return;
        }

        // 2. Context Processor
        const { context: processed } = contextProcessor.process(zoweResult);

        // 3. Simulação de Intent Router (Classificação)
        const intent = 'analyze-jcl'; // baseado nas palavras do prompt
        const selectedSkillName = 'jcl-analysis';
        const skill = await skillManager.loadSkill(selectedSkillName);
        
        if (!skill) {
            console.log(`\n--- TESTE JCL ROUTER PIPELINE ---`);
            console.log(`Success: NO`);
            console.log(`Error: Skill ${selectedSkillName} não encontrada.`);
            console.log(`----------------------------------\n`);
            return;
        }

        // Avaliação de Tier / Escalation
        let tier = skill.defaultTier || 'ECONOMY';
        if (tier === 'STANDARD' && (userPrompt.includes('dump') || userPrompt.includes('vários arquivos'))) {
            tier = 'DEEP';
        }

        // 4. Prompt Builder
        const { metrics } = promptBuilder.buildFromSkillAndContext(skill, processed, userPrompt);

        // 5. Model Selection (Dry-Run)
        let requestedTier = tier;
        let effectiveTier = tier;
        let tierDowngraded = false;
        let preferredModel = 'unknown';
        let selectorReturned = false;
        let exactIdMatch = false;
        let exactFamilyMatch = false;
        let preferredModelAvailable = false;
        let selectedModelId = 'unknown';
        let selectedModelName = 'Nenhum modelo selecionado';
        let selectedModelFamily = 'unknown';
        let exactMatch = false;
        let selectionReason = '';
        let fallbackUsed = false;
        let fallbackReason = '';
        
        try {
            const selectionResult = await selectModelByLevel(tier, context.languageModelAccessInformation);
            requestedTier = selectionResult.requestedTier;
            effectiveTier = selectionResult.effectiveTier;
            tierDowngraded = selectionResult.tierDowngraded;
            preferredModel = selectionResult.preferredModel;
            selectorReturned = selectionResult.selectorReturned;
            exactIdMatch = selectionResult.exactIdMatch;
            exactFamilyMatch = selectionResult.exactFamilyMatch;
            preferredModelAvailable = selectionResult.preferredModelAvailable;
            selectedModelId = selectionResult.selectedModelId;
            selectedModelName = selectionResult.selectedModelName;
            selectedModelFamily = selectionResult.selectedModelFamily;
            exactMatch = selectionResult.exactMatch;
            selectionReason = selectionResult.selectionReason;
            fallbackUsed = selectionResult.fallbackUsed;
            fallbackReason = selectionResult.fallbackReason;
        } catch (error: any) {
            selectedModelName = `ERRO: ${error.message}`;
            selectionReason = 'Error during model selection';
        }

        // 6. Saída do Dry-Run
        console.log(`\n--- TESTE JCL ROUTER PIPELINE ---`);
        console.log(`Dataset: ${zoweResult.sourceIdentifier}`);
        console.log(`Intent: ${intent}`);
        console.log(`Skill: ${selectedSkillName}`);
        console.log(``);
        console.log(`RequestedTier: ${requestedTier}`);
        console.log(`EffectiveTier: ${effectiveTier}`);
        console.log(`TierDowngraded: ${tierDowngraded ? 'YES' : 'NO'}`);
        console.log(``);
        console.log(`PreferredModel: ${preferredModel}`);
        console.log(`PreferredModelAvailable: ${preferredModelAvailable ? 'YES' : 'NO'}`);
        console.log(``);
        console.log(`SelectedModelId: ${selectedModelId}`);
        console.log(`SelectedModelName: ${selectedModelName}`);
        console.log(`SelectedModelFamily: ${selectedModelFamily}`);
        console.log(``);
        console.log(`SelectorReturned: ${selectorReturned ? 'YES' : 'NO'}`);
        console.log(`ExactIdMatch: ${exactIdMatch ? 'YES' : 'NO'}`);
        console.log(`ExactFamilyMatch: ${exactFamilyMatch ? 'YES' : 'NO'}`);
        console.log(`ExactMatch: ${exactMatch ? 'YES' : 'NO'}`);
        console.log(`SelectionReason: ${selectionReason}`);
        console.log(`FallbackUsed: ${fallbackUsed ? 'YES' : 'NO'}`);
        if (fallbackUsed) {
            console.log(`FallbackReason: ${fallbackReason}`);
        }
        console.log(`SourceChars: ${processed.originalChars}`);
        console.log(`ContextChars: ${processed.contextChars}`);
        console.log(`SkillChars: ${metrics.skillChars}`);
        console.log(`KnowledgeChars: ${metrics.knowledgeChars}`);
        console.log(`FinalPromptChars: ${metrics.finalPromptChars}`);
        console.log(`LLMCalled: NO`);
        console.log(`Success: YES`);
        console.log(`----------------------------------\n`);
    });
    context.subscriptions.push(testRouterCmd);

    // Comando de Teste do JCL LLM Pipeline (Completo)
    const testLlmCmd = vscode.commands.registerCommand('mainframeHub.testJclLlmPipeline', async () => {
        const fullDataset = await vscode.window.showInputBox({
            prompt: 'Dataset(Member) para teste do JCL LLM Pipeline:',
            placeHolder: 'Ex: Z75221.JCL(JCL2)'
        });

        if (!fullDataset) return;

        let ds = fullDataset;
        let mem = '';
        if (fullDataset.includes('(')) {
            const parts = fullDataset.split('(');
            ds = parts[0];
            mem = parts[1].replace(')', '');
        } else {
            vscode.window.showErrorMessage('Por favor, informe Dataset e Member. Ex: A.B.C(MEM)');
            return;
        }

        // Simulação do user prompt
        const userPrompt = 'Analise este JCL e explique de forma objetiva o que ele faz. Aponte também possíveis problemas ou pontos de atenção.';

        // 0. Resolve profile UMA VEZ para toda a operação
        const profileCtx = await profileResolver.resolveProfile();

        // 1. Zowe Read-Only
        const zoweResult = await zoweConnector.readDatasetMember(profileCtx, ds, mem);
        if (zoweResult.error) {
            console.log(`\n--- TESTE JCL LLM PIPELINE ---`);
            console.log(`Success: NO`);
            console.log(`Error: ${zoweResult.error}`);
            console.log(`-------------------------------\n`);
            return;
        }

        // 2. Context Processor
        const { context: processed } = contextProcessor.process(zoweResult);

        // 3. Simulação de Intent Router (Classificação)
        const intent = 'analyze-jcl';
        const selectedSkillName = 'jcl-analysis';
        const skill = await skillManager.loadSkill(selectedSkillName);
        
        if (!skill) {
            console.log(`\n--- TESTE JCL LLM PIPELINE ---`);
            console.log(`Success: NO`);
            console.log(`Error: Skill ${selectedSkillName} não encontrada.`);
            console.log(`-------------------------------\n`);
            return;
        }

        // Avaliação de Tier / Escalation
        let tier = skill.defaultTier || 'ECONOMY';

        // 4. Prompt Builder
        const { finalPrompt, metrics } = promptBuilder.buildFromSkillAndContext(skill, processed, userPrompt);

        console.log(`\n--- ESTRUTURA DO CONTEXTO NO PROMPT ---`);
        console.log(`ContextContentDefined: ${processed.content ? 'YES' : 'NO'}`);
        console.log(`ContextContentType: ${typeof processed.content}`);
        console.log(`ContextContentChars: ${processed.content?.length || 0}`);
        const inserted = processed.content && finalPrompt.includes(processed.content);
        console.log(`ContextInsertedIntoPrompt: ${inserted ? 'YES' : 'NO'}`);
        const startIndex = processed.content ? finalPrompt.indexOf(processed.content) : -1;
        console.log(`ContextStartIndex: ${startIndex}`);
        console.log(`ContextEndIndex: ${startIndex !== -1 ? startIndex + processed.content.length : -1}`);
        console.log(`---------------------------------------\n`);

        // 5. Model Selection
        let selectionResult;
        try {
            selectionResult = await selectModelByLevel(tier, context.languageModelAccessInformation);
        } catch (error: any) {
            console.log(`\n--- TESTE JCL LLM PIPELINE ---`);
            console.log(`Success: NO`);
            console.log(`Error: Falha na seleção de modelo - ${error.message}`);
            console.log(`-------------------------------\n`);
            return;
        }

        // 6. Chamada Real ao LLM
        const startTime = Date.now();
        let responseContent = '';
        let llmSuccess = false;

        try {
            const messages = [
                vscode.LanguageModelChatMessage.User(finalPrompt)
            ];

            // Criar doc Untitled antes para ir atualizando via progresso se possível, 
            // mas como é API direta e stream pode ser complexo no teste isolado, 
            // vamos apenas aguardar o texto completo e mostrar num novo arquivo.
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Mainframe Hub: Analisando JCL com LLM...",
                cancellable: false
            }, async () => {
                const chatResponse = await selectionResult.model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                for await (const chunk of chatResponse.text) {
                    responseContent += chunk;
                }
            });
            llmSuccess = true;
        } catch (error: any) {
            console.log(`\n--- TESTE JCL LLM PIPELINE ---`);
            console.log(`LLMCalled: YES`);
            console.log(`Success: NO`);
            console.log(`Error: Falha na chamada LLM - ${error.message}`);
            console.log(`-------------------------------\n`);
            return;
        }

        const durationMs = Date.now() - startTime;

        // 7. Exibição da resposta em novo arquivo
        if (llmSuccess) {
            const newDoc = await vscode.workspace.openTextDocument({
                content: responseContent,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(newDoc, { preview: false });
        }

        // 8. Logs
        console.log(`\n--- TESTE JCL LLM PIPELINE ---`);
        console.log(``);
        console.log(`Dataset: ${zoweResult.sourceIdentifier}`);
        console.log(`Intent: ${intent}`);
        console.log(`Skill: ${selectedSkillName}`);
        console.log(``);
        console.log(`RequestedTier: ${selectionResult.requestedTier}`);
        console.log(`EffectiveTier: ${selectionResult.effectiveTier}`);
        console.log(`TierDowngraded: ${selectionResult.tierDowngraded ? 'YES' : 'NO'}`);
        console.log(``);
        console.log(`SelectedModelId: ${selectionResult.selectedModelId}`);
        console.log(`SelectedModelName: ${selectionResult.selectedModelName}`);
        console.log(`RuntimeCallable: ${llmSuccess ? 'YES' : 'NO'}`);
        console.log(``);
        console.log(`FallbackUsed: ${selectionResult.fallbackUsed ? 'YES' : 'NO'}`);
        console.log(`FallbackReason: ${selectionResult.fallbackUsed ? selectionResult.fallbackReason : ''}`);
        console.log(``);
        console.log(`SourceChars: ${processed.originalChars}`);
        console.log(`ContextChars: ${processed.contextChars}`);
        console.log(`SkillChars: ${metrics.skillChars}`);
        console.log(`KnowledgeChars: ${metrics.knowledgeChars}`);
        console.log(`FinalPromptChars: ${metrics.finalPromptChars}`);
        console.log(``);
        console.log(`LLMCalled: YES`);
        console.log(`ResponseReceived: ${llmSuccess ? 'YES' : 'NO'}`);
        console.log(`ResponseChars: ${responseContent.length}`);
        console.log(`DurationMs: ${durationMs}`);
        console.log(`Success: ${llmSuccess ? 'YES' : 'NO'}`);
        console.log(`----------------------------------\n`);
    });
    context.subscriptions.push(testLlmCmd);

    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        const startTime = Date.now();
        let finalModel = 'unknown';
        let finalTier = 'unknown';
        let finalSkillId = 'unknown';
        let finalPromptLength = request.prompt.length;

        // ═══════════════════════════════════════════════════════
        // TESTE 2 — REQUEST.MODEL (Modelo escolhido pelo picker)
        // Remover este bloco após a coleta de dados.
        // ═══════════════════════════════════════════════════════
        const reqModel = (request as any).model;
        if (reqModel) {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║   TESTE 2 — REQUEST.MODEL (Modelo do Picker)               ║');
            console.log('╚══════════════════════════════════════════════════════════════╝');
            console.log(`   id             : ${reqModel.id ?? '(indisponível)'}`);
            console.log(`   name           : ${reqModel.name ?? '(indisponível)'}`);
            console.log(`   family         : ${reqModel.family ?? '(indisponível)'}`);
            console.log(`   vendor         : ${reqModel.vendor ?? '(indisponível)'}`);
            console.log(`   version        : ${reqModel.version ?? '(indisponível)'}`);
            console.log(`   maxInputTokens : ${reqModel.maxInputTokens ?? '(indisponível)'}`);
            console.log('══════════════════════════════════════════════════════════════\n');
        } else {
            console.log('\n⚠️  TESTE 2: request.model está undefined/null nesta requisição.\n');
        }

        let result: any;
        try {
            // 1. O Roteador de Intenção decide o modelo, carrega as Skills relevantes,
            // interage com o Zowe (se necessário) e faz a chamada ao LLM.
            result = await handleIntent(request, chatContext, stream, token, context.languageModelAccessInformation);
            
            // 2. Log de diagnóstico temporário exigido
            console.log(`\n--- CHAT PIPELINE DIAGNOSTIC ---`);
            console.log(`DetectedIntent: ${result.intent}`);
            console.log(`SelectedSkill: ${result.skill}`);
            console.log(`ResourceReferenceFound: ${result.resourceType !== 'none' ? 'YES' : 'NO'}`);
            console.log(`ResourceType: ${result.resourceType}`);
            console.log(`ZoweReadAttempted: ${result.zoweReadAttempted ? 'YES' : 'NO'}`);
            console.log(`LLMCalled: ${result.llmCalled ? 'YES' : 'NO'}`);
            console.log(`----------------------------------\n`);

            finalModel = result.selectedModelId;
            finalTier = result.effectiveTier;
            finalSkillId = result.skill;
            finalPromptLength = result.finalPromptChars;
        } catch (error) {
            stream.markdown(`**Erro no Mainframe Hub Assistant**: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Log de telemetria interna base
            const durationMs = Date.now() - startTime;
            
            // Variáveis de telemetria base se result for undefined (falhou antes de retornar)
            const telemetryPayload: any = {
                command: request.command,
                modelUsed: finalModel,
                tier: finalTier,
                skillId: finalSkillId,
                promptLength: finalPromptLength,
                durationMs
            };

            // Se o router retornou com sucesso, mesclar as novas métricas do MVP v0.1
            // Usaremos any temporariamente para extrair os campos extras já tipados no result
            const res = result as any;
            if (res) {
                if (res.historyMessagesAvailable !== undefined) telemetryPayload.historyMessagesAvailable = res.historyMessagesAvailable;
                if (res.historyMessagesIncluded !== undefined) telemetryPayload.historyMessagesIncluded = res.historyMessagesIncluded;
                if (res.historyCharsIncluded !== undefined) telemetryPayload.historyCharsIncluded = res.historyCharsIncluded;
                if (res.historyTruncated !== undefined) telemetryPayload.historyTruncated = res.historyTruncated;
                if (res.editorContextMode !== undefined) telemetryPayload.editorContextMode = res.editorContextMode;
                if (res.visibleEditorsFound !== undefined) telemetryPayload.visibleEditorsFound = res.visibleEditorsFound;
                if (res.editorsIncluded !== undefined) telemetryPayload.editorsIncluded = res.editorsIncluded;
                if (res.routingDecisionSource !== undefined) telemetryPayload.routingDecisionSource = res.routingDecisionSource;
                if (res.semanticRouterCalled !== undefined) telemetryPayload.semanticRouterCalled = res.semanticRouterCalled;
                if (res.semanticRouterDurationMs !== undefined) telemetryPayload.semanticRouterDurationMs = res.semanticRouterDurationMs;
                if (res.semanticSkillRequested !== undefined) telemetryPayload.semanticSkillRequested = res.semanticSkillRequested;
                if (res.semanticSkillValid !== undefined) telemetryPayload.semanticSkillValid = res.semanticSkillValid;
                if (res.editorContextRequested !== undefined) telemetryPayload.editorContextRequested = res.editorContextRequested;
                if (res.editorContextIncluded !== undefined) telemetryPayload.editorContextIncluded = res.editorContextIncluded;
                if (res.editorContextReason !== undefined) telemetryPayload.editorContextReason = res.editorContextReason;
                if (res.contextBudgetTotalChars !== undefined) telemetryPayload.contextBudgetTotalChars = res.contextBudgetTotalChars;
                if (res.contextCharsIncluded !== undefined) telemetryPayload.contextCharsIncluded = res.contextCharsIncluded;
                if (res.knowledgeCharsIncluded !== undefined) telemetryPayload.knowledgeCharsIncluded = res.knowledgeCharsIncluded;
                if (res.mainframeContextCharsIncluded !== undefined) telemetryPayload.mainframeContextCharsIncluded = res.mainframeContextCharsIncluded;
                if (res.contextBudgetExceeded !== undefined) telemetryPayload.contextBudgetExceeded = res.contextBudgetExceeded;
                if (res.knowledgeTruncated !== undefined) telemetryPayload.knowledgeTruncated = res.knowledgeTruncated;
                if (res.mainframeContextTruncated !== undefined) telemetryPayload.mainframeContextTruncated = res.mainframeContextTruncated;
                if (res.historyTruncationReason !== undefined) telemetryPayload.historyTruncationReason = res.historyTruncationReason;
                if (res.knowledgeTruncationReason !== undefined) telemetryPayload.knowledgeTruncationReason = res.knowledgeTruncationReason;
                if (res.mainframeContextTruncationReason !== undefined) telemetryPayload.mainframeContextTruncationReason = res.mainframeContextTruncationReason;
                if (res.truncationReason !== undefined) telemetryPayload.truncationReason = res.truncationReason;
                if (res.contextBuildSuccess !== undefined) telemetryPayload.contextBuildSuccess = res.contextBuildSuccess;
                if (res.contextBuildFailureReason !== undefined) telemetryPayload.contextBuildFailureReason = res.contextBuildFailureReason;
                // H-02 Model Router
                if (res.tierSelectionReason !== undefined) telemetryPayload.tierSelectionReason = res.tierSelectionReason;
                if (res.tierEscalated !== undefined) telemetryPayload.tierEscalated = res.tierEscalated;
                if (res.tierOriginal !== undefined) telemetryPayload.tierOriginal = res.tierOriginal;
                if (res.tierSelectionDetails !== undefined) telemetryPayload.tierSelectionDetails = res.tierSelectionDetails;
            }

            logTelemetry(telemetryPayload);
        }
    };

    const participant = vscode.chat.createChatParticipant('mainframe.hubAssistant', handler);
    participant.iconPath = new vscode.ThemeIcon('server-environment');
    
    context.subscriptions.push(participant);
}

export function deactivate() {}
