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
import { CodeClassification, CodeConfidence } from '../mainframe/codeClassificationTypes';
import { shouldUseEditorContext, EditorContextReason } from '../context/editorContextPolicy';
import { decideDeterministicRouting, RoutingDecisionSource, validateSemanticSkill } from './routingContracts';
import {
    BudgetHistoryMessage,
    CONTEXT_MANDATORY_ENVELOPE_TOO_LARGE,
    ContextBudgetError,
    TruncationReason
} from '../context/contextBudget';

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
    routingDecisionSource?: RoutingDecisionSource;
    semanticRouterCalled?: boolean;
    semanticRouterDurationMs?: number;
    semanticSkillRequested?: string;
    semanticSkillValid?: boolean;
    editorContextRequested?: boolean;
    editorContextIncluded?: boolean;
    editorContextReason?: EditorContextReason;
    contextBudgetTotalChars?: number;
    contextCharsIncluded?: number;
    knowledgeCharsIncluded?: number;
    mainframeContextCharsIncluded?: number;
    contextBudgetExceeded?: boolean;
    knowledgeTruncated?: boolean;
    mainframeContextTruncated?: boolean;
    historyTruncationReason?: TruncationReason;
    knowledgeTruncationReason?: TruncationReason;
    mainframeContextTruncationReason?: TruncationReason;
    truncationReason?: TruncationReason;
    contextBuildSuccess?: boolean;
    contextBuildFailureReason?: typeof CONTEXT_MANDATORY_ENVELOPE_TOO_LARGE;
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
    let codeTypeConfidence: CodeConfidence | 'NONE' = 'NONE';
    let classification: CodeClassification = { detectedType: 'unknown', confidence: 'LOW', evidence: [] };
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
    let routingDecisionSource: RoutingDecisionSource = 'FALLBACK';
    let semanticRouterCalled = false;
    let semanticRouterDurationMs = 0;
    let semanticSkillRequested = 'none';
    let semanticSkillValid = false;
    const editorDecision = shouldUseEditorContext(request.prompt);
    const editorContextRequested = editorDecision.requested;
    let editorContextIncluded = false;
    const editorContextReason: EditorContextReason = editorDecision.reason;

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
        if (!zoweContextResult && editorContextRequested) {
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
                        stream.progress('Lendo conteudo explicitamente solicitado do editor ativo...');
                        zoweContextResult = {
                            sourceType: 'member',
                            sourceIdentifier: 'active-editor',
                            content: text,
                            charsRetrieved: text.length,
                            charsSentToLlm: text.length,
                            truncated: false
                        };
                        resourceType = 'active-editor';
                        dataset = 'active-editor';
                        editorsIncluded = 1;
                        editorContextIncluded = true;
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

            classification = codeClassifier.classify(contextContent);
            detectedCodeType = classification.detectedType;
            codeTypeConfidence = classification.confidence;
        }

        // 3. SKILL SELECTION
        const deterministicDecision = decideDeterministicRouting(classification);
        selectedSkillName = deterministicDecision.selectedSkill;
        routingDecisionSource = deterministicDecision.source;

        if (deterministicDecision.shouldCallSemantic) {
            // ROTEADOR SEMÂNTICO
            stream.progress('Classificando intenção via Roteador Semântico...');
            semanticRouterCalled = true;
            const srStart = Date.now();
            const semanticResult = await semanticRouter.classify(request.prompt, accessInfo);
            semanticRouterDurationMs = Date.now() - srStart;
            
            // Fail Closed: Nenhuma skill assumida silenciosamente se a confiança for baixa ou genérica
            const validation = await validateSemanticSkill(
                semanticResult.selectedSkill,
                semanticResult.confidence,
                skillIdToValidate => skillManager.hasSkill(skillIdToValidate)
            );
            semanticSkillRequested = validation.requested;
            semanticSkillValid = validation.valid;
            selectedSkillName = validation.selectedSkill;
            routingDecisionSource = validation.valid ? 'SEMANTIC_ROUTER' : 'FALLBACK';
            intent = validation.selectedSkill ?? 'unknown';
            console.log(`[SemanticRouter] Requested=${semanticSkillRequested} | Valid=${semanticSkillValid ? 'YES' : 'NO'} | Confidence=${semanticResult.confidence}`);
        }
    }

    let skillInstructions = '';
    let knowledgeContent = '';
    
    if (selectedSkillName) {
        const loadedSkill = await skillManager.loadSkill(selectedSkillName);
        if (loadedSkill) {
            skillId = loadedSkill.id || 'unknown';
            skillProvider = loadedSkill.providerId || 'local';
            defaultTier = loadedSkill.defaultTier || 'ECONOMY';
            
            if (defaultTier === 'STANDARD' && (userPrompt.includes('dump') || userPrompt.includes('vários arquivos'))) {
                defaultTier = 'DEEP';
            }

            skillInstructions = `[Meta-Contexto: skill '${selectedSkillName}']\n\n${loadedSkill.content}`;
            knowledgeContent = loadedSkill.knowledgeContent || '';
            stream.progress(`Skill carregada: ${selectedSkillName} [via ${skillProvider}]...`);
        } else {
            selectedSkillName = null;
            routingDecisionSource = 'FALLBACK';
            semanticSkillValid = false;
        }
    }

    if (!selectedSkillName && processedContext) {
        stream.progress('Classificação neutra. Nenhuma skill específica carregada.');
        systemPrompt = 'Você é o Mainframe Hub Assistant. Analise o contexto fornecido de forma neutra, sucinta e direta.';
    }

    // 4. CONTEXT BUILD
    const historyMessagesAvailable = chatContext.history.length;
    const historyInput: BudgetHistoryMessage[] = [];
    for (const turn of chatContext.history) {
        if (turn instanceof vscode.ChatRequestTurn) {
            historyInput.push({ role: 'user', content: turn.prompt });
        } else if (turn instanceof vscode.ChatResponseTurn) {
            let responseText = '';
            for (const part of turn.response) {
                if (part instanceof vscode.ChatResponseMarkdownPart) {
                    responseText += part.value.value;
                }
            }
            if (responseText) historyInput.push({ role: 'assistant', content: responseText });
        }
    }

    let budgetedChat;
    try {
        budgetedChat = promptBuilder.buildBudgetedChat({
            assistantInstructions: systemPrompt,
            skillInstructions,
            knowledge: knowledgeContent,
            mainframeContext: processedContext?.content ?? '',
            userRequest: request.prompt,
            history: historyInput,
            maxHistoryMessages: 6
        });
    } catch (error: unknown) {
        if (!(error instanceof ContextBudgetError)) throw error;
        stream.markdown('O contexto necessário para esta solicitação excede o limite atual. Reduza o conteúdo analisado ou selecione uma parte mais específica.');
        return {
            intent, resourceType, dataset, skill: skillId, skillProvider,
            detectedCodeType, codeTypeConfidence,
            requestedTier: defaultTier, effectiveTier: 'unknown',
            selectedModelId: 'unknown', fallbackUsed: false,
            zoweReadAttempted, llmCalled: false,
            sourceChars, contextChars, finalPromptChars: 0,
            responseChars: 0, durationMs: 0, success: false,
            discoveryTelemetry,
            historyMessagesAvailable,
            historyMessagesIncluded: 0,
            historyCharsIncluded: 0,
            historyTruncated: false,
            editorContextMode,
            visibleEditorsFound,
            editorsIncluded,
            editorContextRequested,
            editorContextIncluded,
            editorContextReason,
            routingDecisionSource,
            semanticRouterCalled,
            semanticRouterDurationMs,
            semanticSkillRequested,
            semanticSkillValid,
            contextBudgetTotalChars: error.maxTotalChars,
            contextCharsIncluded: 0,
            knowledgeCharsIncluded: 0,
            mainframeContextCharsIncluded: 0,
            contextBudgetExceeded: true,
            knowledgeTruncated: false,
            mainframeContextTruncated: false,
            historyTruncationReason: 'NONE',
            knowledgeTruncationReason: 'NONE',
            mainframeContextTruncationReason: 'NONE',
            truncationReason: 'NONE',
            contextBuildSuccess: false,
            contextBuildFailureReason: error.code
        };
    }

    // 5. MODEL SELECTION
    const selectionResult = await selectModelByLevel(defaultTier, accessInfo);
    const selectedModel = selectionResult.model;

    // 6. INVOCACAO DO LLM
    const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(budgetedChat.systemMessage)
    ];
    for (const historyMessage of budgetedChat.history) {
        messages.push(historyMessage.role === 'user'
            ? vscode.LanguageModelChatMessage.User(historyMessage.content)
            : vscode.LanguageModelChatMessage.Assistant(historyMessage.content));
    }
    messages.push(vscode.LanguageModelChatMessage.User(budgetedChat.currentUserMessage));
    const finalPromptChars = budgetedChat.metrics.contextCharsIncluded;

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
        historyMessagesIncluded: budgetedChat.metrics.historyMessagesIncluded,
        historyCharsIncluded: budgetedChat.metrics.historyCharsIncluded,
        historyTruncated: budgetedChat.metrics.historyTruncated,
        editorContextMode,
        visibleEditorsFound,
        editorsIncluded,
        editorContextRequested,
        editorContextIncluded,
        editorContextReason,
        routingDecisionSource,
        semanticRouterCalled,
        semanticRouterDurationMs,
        semanticSkillRequested,
        semanticSkillValid,
        contextBudgetTotalChars: budgetedChat.metrics.contextBudgetTotalChars,
        contextCharsIncluded: budgetedChat.metrics.contextCharsIncluded,
        knowledgeCharsIncluded: budgetedChat.metrics.knowledgeCharsIncluded,
        mainframeContextCharsIncluded: budgetedChat.metrics.mainframeContextCharsIncluded,
        contextBudgetExceeded: budgetedChat.metrics.contextBudgetExceeded,
        knowledgeTruncated: budgetedChat.metrics.knowledgeTruncated,
        mainframeContextTruncated: budgetedChat.metrics.mainframeContextTruncated,
        historyTruncationReason: budgetedChat.metrics.historyTruncationReason,
        knowledgeTruncationReason: budgetedChat.metrics.knowledgeTruncationReason,
        mainframeContextTruncationReason: budgetedChat.metrics.mainframeContextTruncationReason,
        truncationReason: budgetedChat.metrics.truncationReason,
        contextBuildSuccess: true
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
