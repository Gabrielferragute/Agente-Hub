import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { zoweConnector } from '../zowe/zoweConnector';
import { parseResourceReference } from '../mainframe/resourceParser';
import { contextProcessor } from '../context/contextProcessor';
import { promptBuilder } from '../context/promptBuilder';
import { skillManager } from '../skillsManager/skillManager';
import { codeClassifier } from '../mainframe/codeClassifier';
import { areaConfigManager } from '../mainframe/areaConfigManager';
import { ComponentDiscoveryEngine } from '../mainframe/componentDiscovery/componentDiscoveryEngine';
import { semanticRouter } from './semanticRouter';

export interface IntentRouterTelemetry {
    intent: string;
    resourceType: string;
    dataset: string;
    skill: string;
    skillProvider: string;
    detectedCodeType: string;
    codeTypeConfidence: string;
    requestedTier: string;
    effectiveTier: string;
    selectedModelId: string;
    fallbackUsed: boolean;
    zoweReadAttempted: boolean;
    llmCalled: boolean;
    sourceChars: number;
    contextChars: number;
    finalPromptChars: number;
    responseChars: number;
    durationMs: number;
    success: boolean;
    discoveryTelemetry?: any; // Para carregar os dados detalhados da descoberta
    
    // Novas métricas MVP v0.1
    historyMessagesAvailable?: number;
    historyMessagesIncluded?: number;
    historyCharsIncluded?: number;
    historyTruncated?: boolean;
    editorContextMode?: 'ACTIVE_ONLY' | 'MULTI_VISIBLE' | 'NONE';
    visibleEditorsFound?: number;
    editorsIncluded?: number;
    routingDecisionSource?: 'CODE_CLASSIFIER' | 'EXPLICIT_INTENT' | 'SEMANTIC_ROUTER' | 'FALLBACK';
    semanticRouterCalled?: boolean;
    semanticRouterDurationMs?: number;
}

let hasLoggedInventory = false;

export async function handleIntent(
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    accessInfo: vscode.LanguageModelAccessInformation
): Promise<IntentRouterTelemetry> {
    
    let defaultTier = 'ECONOMY';
    let systemPrompt = 'Você é o Mainframe Hub Assistant. Ajude de forma sucinta e direta.';
    const userPrompt = request.prompt.toLowerCase();
    
    let intent = 'unknown';
    let resourceType = 'none';
    let dataset = 'none';
    let skillId = 'unknown';
    let skillProvider = 'none';
    let detectedCodeType = 'unknown';
    let codeTypeConfidence = 'none';
    let sourceChars = 0;
    let contextChars = 0;
    let zoweReadAttempted = false;
    let selectedSkillName: string | null = null;
    let contextContent = '';
    let processedContext: any = null;
    let zoweContextResult: any = null;
    let discoveryTelemetry: any = null;
    
    // Telemetria MVP v0.1
    let editorContextMode: 'ACTIVE_ONLY' | 'MULTI_VISIBLE' | 'NONE' = 'NONE';
    let visibleEditorsFound = 0;
    let editorsIncluded = 0;
    let routingDecisionSource: 'CODE_CLASSIFIER' | 'EXPLICIT_INTENT' | 'SEMANTIC_ROUTER' | 'FALLBACK' = 'FALLBACK';
    let semanticRouterCalled = false;
    let semanticRouterDurationMs = 0;

    // 1. DISCOVERY INTENT (Component Discovery Engine)
    if (userPrompt.includes('mapeie') || userPrompt.includes('impacto') || userPrompt.includes('relacionados')) {
        intent = 'discover-components';
        selectedSkillName = 'component-discovery';
        
        // Exemplo: "mapeie componentes relacionados ao programa ABC123 na área example-area"
        // Regex simplificado para MVP
        const areaMatch = userPrompt.match(/área\s+([\w-]+)/i);
        const areaId = areaMatch ? areaMatch[1] : 'example-area';
        const areaConfig = areaConfigManager.getArea(areaId);

        const parsed = parseResourceReference(request.prompt);
        // O resourceParser pode não pegar o membro solto "ABC123", então vamos tentar pegar "programa XYZ"
        let seedMember = parsed?.member || parsed?.dataset;
        if (!seedMember) {
            const pgmMatch = userPrompt.match(/programa\s+([a-z0-9]+)/i);
            if (pgmMatch) seedMember = pgmMatch[1].toUpperCase();
        }

        if (areaConfig && seedMember) {
            stream.progress(`Iniciando Discovery Engine para ${seedMember} na área ${areaConfig.displayName}...`);
            const engine = new ComponentDiscoveryEngine(seedMember.toUpperCase(), areaConfig);
            const { graph, telemetry } = await engine.discover();
            
            // Serializa o grafo para jogar no contexto do LLM
            contextContent = JSON.stringify(graph, null, 2);
            processedContext = {
                content: contextContent,
                originalChars: 0,
                contextChars: contextContent.length
            };
            sourceChars = 0;
            contextChars = contextContent.length;

            if (telemetry.discoveryTruncated) {
                stream.progress(`Aviso: Limite do Search Budget atingido (${telemetry.componentsFound} componentes encontrados).`);
            } else {
                stream.progress(`Busca concluída: ${telemetry.componentsFound} componentes encontrados.`);
            }

            // Deixa seguir para carregar a skill 'component-discovery' e bater no LLM
        } else {
            stream.markdown(`Para iniciar o mapa de impacto, forneça o componente e a área. Ex: "@mainframehub mapeie o programa ABC123 na área example-area"`);
            return {
                intent, resourceType, dataset, skill: skillId, skillProvider,
                detectedCodeType, codeTypeConfidence,
                requestedTier: defaultTier, effectiveTier: 'unknown',
                selectedModelId: 'unknown', fallbackUsed: false,
                zoweReadAttempted: false, llmCalled: false,
                sourceChars, contextChars, finalPromptChars: 0,
                responseChars: 0, durationMs: 0, success: false
            };
        }
    } else {
        // 1.B RESOURCE PARSING & EXTRACTION (Agnóstico a Skill)
        const parsed = parseResourceReference(request.prompt);

        if (parsed && parsed.dataset && parsed.member) {
            resourceType = 'dataset-member';
            dataset = `${parsed.dataset}(${parsed.member})`;
            intent = 'analyze-code';

            stream.progress(`Buscando conteúdo de ${dataset} via Zowe Explorer...`);
            zoweReadAttempted = true;
            const zoweResult = await zoweConnector.readDatasetMember(parsed.dataset, parsed.member);

            if (zoweResult.error) {
                stream.markdown(`Não consegui acessar ${dataset}. Verifique se o dataset/member existe e se o seu profile Zowe possui acesso.`);
                return {
                    intent, resourceType, dataset, skill: skillId, skillProvider,
                    detectedCodeType, codeTypeConfidence,
                    requestedTier: defaultTier, effectiveTier: 'unknown',
                    selectedModelId: 'unknown', fallbackUsed: false,
                    zoweReadAttempted, llmCalled: false,
                    sourceChars, contextChars, finalPromptChars: 0,
                    responseChars: 0, durationMs: 0, success: false,
                    routingDecisionSource: 'FALLBACK', semanticRouterCalled: false
                };
            }

            zoweContextResult = zoweResult;
        }

        // 1.C FALLBACK PARA ACTIVE EDITOR
        if (!zoweContextResult) {
            const activeEditor = vscode.window.activeTextEditor;
            const validEditors = vscode.window.visibleTextEditors.filter(e => e.document.uri.scheme !== 'output' && e.document.uri.scheme !== 'debug');
            visibleEditorsFound = validEditors.length;
            
            const isCompareIntent = request.prompt.toLowerCase().includes('compare') || request.prompt.toLowerCase().includes('comparar');
            let editorsToProcess: vscode.TextEditor[] = [];

            if (activeEditor && activeEditor.document.uri.scheme !== 'output' && activeEditor.document.uri.scheme !== 'debug') {
                editorsToProcess = [activeEditor];
                editorContextMode = 'ACTIVE_ONLY';
            } else if (isCompareIntent && validEditors.length === 2) {
                editorsToProcess = validEditors;
                editorContextMode = 'MULTI_VISIBLE';
            } else if (validEditors.length > 0) {
                editorsToProcess = [validEditors[0]];
                editorContextMode = 'ACTIVE_ONLY'; // Trata como active
            }

            if (editorsToProcess.length > 0) {
                // Por enquanto lê apenas o primeiro (evitando concatenação silenciosa)
                const editor = editorsToProcess[0];
                if (editor && editor.document) {
                    const text = editor.document.getText();
                    if (text.trim().length > 0) {
                        const fileName = path.basename(editor.document.fileName);
                        stream.progress(`Lendo arquivo aberto no editor: ${fileName}...`);
                        zoweContextResult = {
                            sourceType: 'member',
                            sourceIdentifier: fileName,
                            content: text,
                            charsRetrieved: text.length,
                            charsSentToLlm: text.length,
                            truncated: false
                        };
                        resourceType = 'active-editor';
                        dataset = fileName;
                        editorsIncluded = 1;
                    }
                }
            }
        }

        // 2. CODE CLASSIFICATION
        if (zoweContextResult) {
            const result = contextProcessor.process(zoweContextResult);
            processedContext = result.context;
            contextContent = processedContext.content;
            sourceChars = processedContext.originalChars;
            contextChars = processedContext.contextChars;

            const classification = codeClassifier.classify(contextContent);
            detectedCodeType = classification.detectedType;
            codeTypeConfidence = classification.confidence;
        }

        // 3. SKILL SELECTION
        if (detectedCodeType === 'jcl' && codeTypeConfidence === 'HIGH') {
            selectedSkillName = 'jeff-jcl';
            routingDecisionSource = 'CODE_CLASSIFIER';
        } else if (detectedCodeType === 'cobol' && codeTypeConfidence === 'HIGH') {
            selectedSkillName = 'cobol-debug';
            routingDecisionSource = 'CODE_CLASSIFIER';
        } else if (detectedCodeType === 'unknown' && zoweContextResult) {
            selectedSkillName = null;
            routingDecisionSource = 'FALLBACK';
        } else {
            // ROTEADOR SEMÂNTICO
            stream.progress('Classificando intenção via Roteador Semântico...');
            semanticRouterCalled = true;
            const srStart = Date.now();
            const semanticResult = await semanticRouter.classify(request.prompt, accessInfo);
            semanticRouterDurationMs = Date.now() - srStart;
            
            // Fail Closed: Nenhuma skill assumida silenciosamente se a confiança for baixa ou genérica
            if (semanticResult.confidence === 'LOW' || semanticResult.selectedSkill === 'onboarding') {
                selectedSkillName = null;
                routingDecisionSource = 'FALLBACK';
            } else {
                selectedSkillName = semanticResult.selectedSkill;
                routingDecisionSource = 'SEMANTIC_ROUTER';
            }
            
            intent = semanticResult.selectedSkill;
            console.log(`[SemanticRouter] Skill: ${semanticResult.selectedSkill} | Confiança: ${semanticResult.confidence} | ${semanticResult.reasoning}`);
        }
    }

    let finalPrompt = request.prompt;
    let finalPromptChars = 0;
    
    if (selectedSkillName) {
        const loadedSkill = await skillManager.loadSkill(selectedSkillName);
        if (loadedSkill) {
            skillId = loadedSkill.id || 'unknown';
            skillProvider = loadedSkill.providerId || 'local';
            defaultTier = loadedSkill.defaultTier || 'ECONOMY';
            
            if (defaultTier === 'STANDARD' && (userPrompt.includes('dump') || userPrompt.includes('vários arquivos'))) {
                defaultTier = 'DEEP';
            }

            systemPrompt = `[Meta-Contexto: Você está operando sob a skill '${selectedSkillName}']\n\n` + loadedSkill.content;
            if (loadedSkill.knowledgeContent) {
                systemPrompt += loadedSkill.knowledgeContent;
            }
            
            stream.progress(`Skill carregada: ${selectedSkillName} [via ${skillProvider}]...`);

            if (processedContext) {
                // Se tem contexto, usa o prompt builder
                const buildResult = promptBuilder.buildFromSkillAndContext(
                    loadedSkill,
                    processedContext, 
                    request.prompt
                );
                finalPrompt = buildResult.finalPrompt;
                finalPromptChars = buildResult.metrics.finalPromptChars;
            } else {
                finalPromptChars = systemPrompt.length + request.prompt.length;
            }
        }
    } else {
        if (processedContext) {
            // Comportamento neutro quando UNKNOWN
            stream.progress('Classificação de código neutra. Nenhuma skill específica carregada.');
            systemPrompt = "Você é o Mainframe Hub Assistant. O usuário forneceu um código desconhecido extraído do Mainframe. Analise-o da melhor forma possível.";
            
            const buildResult = promptBuilder.build({
                skillInstructions: systemPrompt,
                knowledge: '',
                mainframeContext: processedContext.content,
                userRequest: request.prompt
            });
            finalPrompt = buildResult.finalPrompt;
            finalPromptChars = buildResult.metrics.finalPromptChars;
        } else {
            finalPromptChars = systemPrompt.length + request.prompt.length;
        }
    }

    // 4. MODEL SELECTION
    const selectionResult = await selectModelByLevel(defaultTier, accessInfo);
    let selectedModel = selectionResult.model;

    // 5. INVOCAÇÃO DO LLM
    // 5. INVOCAÇÃO DO LLM
    const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemPrompt)
    ];

    // Injeta o histórico da conversa para manter o contexto
    let historyTruncated = false;
    let historyMessagesAvailable = chatContext.history.length;
    let historyMessagesToInclude = chatContext.history;
    const maxHistoryMessages = 6; // PROVISIONAL
    
    if (chatContext.history.length > maxHistoryMessages) {
        historyMessagesToInclude = chatContext.history.slice(-maxHistoryMessages);
        historyTruncated = true;
    }
    
    let historyCharsIncluded = 0;

    for (const turn of historyMessagesToInclude) {
        if (turn instanceof vscode.ChatRequestTurn) {
            messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
            historyCharsIncluded += turn.prompt.length;
        } else if (turn instanceof vscode.ChatResponseTurn) {
            let responseText = '';
            for (const part of turn.response) {
                if (part instanceof vscode.ChatResponseMarkdownPart) {
                    responseText += part.value.value;
                }
            }
            messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
            historyCharsIncluded += responseText.length;
        }
    }

    // Adiciona o prompt final da requisição atual
    messages.push(vscode.LanguageModelChatMessage.User(finalPrompt));

    const startTime = Date.now();
    let responseChars = 0;
    let llmSuccess = false;
    
    try {
        const chatResponse = await selectedModel.sendRequest(messages, {}, token);
        for await (const chunk of chatResponse.text) {
            stream.markdown(chunk);
            responseChars += chunk.length;
        }
        llmSuccess = true;
    } catch(error: any) {
        stream.markdown(`\n\n**Erro:** Falha na chamada ao LLM (${error.message})`);
    }

    return { 
        intent,
        resourceType,
        dataset,
        skill: skillId,
        skillProvider,
        detectedCodeType,
        codeTypeConfidence,
        requestedTier: selectionResult.requestedTier,
        effectiveTier: selectionResult.effectiveTier,
        selectedModelId: selectionResult.selectedModelId,
        fallbackUsed: selectionResult.fallbackUsed,
        zoweReadAttempted,
        llmCalled: true,
        sourceChars,
        contextChars,
        finalPromptChars,
        responseChars,
        durationMs: Date.now() - startTime,
        success: llmSuccess,
        discoveryTelemetry,
        historyMessagesAvailable,
        historyMessagesIncluded: historyMessagesToInclude.length,
        historyCharsIncluded,
        historyTruncated,
        editorContextMode,
        visibleEditorsFound,
        editorsIncluded,
        routingDecisionSource,
        semanticRouterCalled,
        semanticRouterDurationMs
    };
}

export interface ModelSelectionResult {
    model: vscode.LanguageModelChat;
    requestedTier: string;
    effectiveTier: string;
    tierDowngraded: boolean;
    preferredModel: string;
    selectorReturned: boolean;
    exactIdMatch: boolean;
    exactFamilyMatch: boolean;
    preferredModelAvailable: boolean;
    selectedModelId: string;
    selectedModelName: string;
    selectedModelFamily: string;
    exactMatch: boolean;
    selectionReason: string;
    fallbackUsed: boolean;
    fallbackReason: string;
}

export async function selectModelByLevel(level: string, accessInfo: vscode.LanguageModelAccessInformation): Promise<ModelSelectionResult> {
    const catalogPath = path.join(__dirname, '../../config/catalog.json');
    let familyCandidates: string[] = [];

    try {
        if (fs.existsSync(catalogPath)) {
            const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
            if (catalog.levels && catalog.levels[level]) {
                const f = catalog.levels[level].family;
                familyCandidates = Array.isArray(f) ? f : [f];
            }
        }
    } catch (e) {
        console.error('Erro ao ler catalog.json', e);
    }

    // Fallbacks explícitos se o catálogo falhar ou não estiver definido
    if (familyCandidates.length === 0) {
        if (level === 'ECONOMY') familyCandidates = ['gpt-3.5-turbo', 'gpt-4o-mini', 'claude-3-haiku'];
        else if (level === 'STANDARD') familyCandidates = ['gpt-4o', 'gpt-4', 'claude-3-5-sonnet'];
        else if (level === 'DEEP') familyCandidates = ['o1-preview', 'o1-mini', 'gpt-4o', 'claude-3-opus'];
        else familyCandidates = ['gpt-4o'];
    }

    const preferredModel = familyCandidates[0] || 'unknown';

    const availableModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });

    if (!hasLoggedInventory) {
        console.log(`\n--- INVENTÁRIO DE MODELOS DISPONÍVEIS NA CONTA ---`);
        for (const m of availableModels) {
            console.log(`ID: ${m.id} | Name: ${m.name} | Family: ${m.family} | Vendor: ${m.vendor} | Version: ${m.version} | Max Tokens: ${m.maxInputTokens}`);
        }
        console.log(`--------------------------------------------------\n`);
        hasLoggedInventory = true;
    }

    let preferredModelAvailable = false;
    
    // Check se o preferred model está disponível E acessível
    const preferredMatch = availableModels.find(m => m.id === preferredModel || m.family === preferredModel);
    if (preferredMatch && accessInfo.canSendRequest(preferredMatch) === true) {
        preferredModelAvailable = true;
    }

    // Tentar encontrar um modelo que bata com a ordem de preferência usando MATCH EXATO
    for (const candidate of familyCandidates) {
        const match = availableModels.find(m => m.id === candidate || m.family === candidate);
        if (match && accessInfo.canSendRequest(match) === true) {
            const isFallback = candidate !== preferredModel;
            return {
                model: match,
                requestedTier: level,
                effectiveTier: level,
                tierDowngraded: false,
                preferredModel: preferredModel,
                selectorReturned: true,
                exactIdMatch: match.id === candidate,
                exactFamilyMatch: match.family === candidate,
                preferredModelAvailable: preferredModelAvailable,
                selectedModelId: match.id,
                selectedModelName: match.name || 'unknown',
                selectedModelFamily: match.family || 'unknown',
                exactMatch: !isFallback,
                selectionReason: isFallback ? `Preferred model unavailable or access denied, matched alternative candidate: ${candidate}` : 'Preferred model is available and accessible',
                fallbackUsed: isFallback,
                fallbackReason: isFallback ? `Preferred model ${preferredModel} not found or access denied` : ''
            };
        }
    }
    
    // FAIL CLOSED: Ambiente de teste permite apenas fallbacks específicos
    const safeFallbacks = ['gpt-4o-mini'];
    for (const safe of safeFallbacks) {
        const match = availableModels.find(m => m.id === safe || m.family === safe);
        if (match && accessInfo.canSendRequest(match) === true) {
            return {
                model: match,
                requestedTier: level,
                effectiveTier: 'ECONOMY',
                tierDowngraded: level !== 'ECONOMY',
                preferredModel: preferredModel,
                selectorReturned: true,
                exactIdMatch: match.id === safe,
                exactFamilyMatch: match.family === safe,
                preferredModelAvailable: preferredModelAvailable,
                selectedModelId: match.id,
                selectedModelName: match.name || 'unknown',
                selectedModelFamily: match.family || 'unknown',
                exactMatch: false,
                selectionReason: `Requested candidates unavailable; explicit safe fallback selected: ${safe}`,
                fallbackUsed: true,
                fallbackReason: `${level} candidates unavailable; validated development fallback selected`
            };
        }
    }
    
    throw new Error(`NoCompatibleModelAvailable`);
}
