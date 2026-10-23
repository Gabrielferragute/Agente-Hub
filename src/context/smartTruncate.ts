/**
 * Preparação de fonte COBOL/JCL para o modelo, no lugar do corte cego de N caracteres.
 *
 * O que faz:
 *  1. Normaliza: remove área de sequência (colunas 73-80, só em formato fixo) e
 *     brancos à direita. Em fonte de 80 colunas isso costuma liberar bastante espaço.
 *  2. Se ainda não couber, corta SEMPRE em fronteira de linha, preservando a
 *     DATA DIVISION (até ~35% do orçamento) e dando o resto à PROCEDURE DIVISION,
 *     preferindo terminar em fronteira de parágrafo.
 *  3. Sem PROCEDURE DIVISION (JCL, copybook): início + fim.
 *  4. Devolve um texto de cobertura dizendo exatamente quais linhas foram
 *     enviadas e quais foram omitidas. Esse texto deve ir no prompt, junto com
 *     a instrução de não concluir "ausência" a partir do que não foi enviado.
 */

export interface PreparedSource {
    text: string;
    truncated: boolean;
    totalLines: number;
    sentLines: number;
    /** Frase para incluir no prompt. */
    coverage: string;
}

export interface PrepareOptions {
    maxChars: number;
    dropBlankLines?: boolean;
}

interface Line { n: number; text: string; }

const PARAGRAPH_HEADER = /^.{7}[A-Z0-9][A-Z0-9-]*\.\s*$/i;

export function normalizeSource(content: string): string[] {
    const raw = content.split(/\r?\n/);
    const isFree = raw.slice(0, 50).some(l => /^\s*>>\s*SOURCE\s+FORMAT\s+(?:IS\s+)?FREE/i.test(l));
    return raw.map(l => {
        const line = (!isFree && l.length > 72 && l.length <= 80) ? l.slice(0, 72) : l;
        return line.replace(/\s+$/, '');
    });
}

const size = (lines: Line[]): number => lines.reduce((s, l) => s + l.text.length + 1, 0);

function takeHead(lines: Line[], budget: number): Line[] {
    const out: Line[] = [];
    let used = 0;
    for (const l of lines) {
        used += l.text.length + 1;
        if (used > budget) { break; }
        out.push(l);
    }
    return out;
}

function takeTail(lines: Line[], budget: number): Line[] {
    const out: Line[] = [];
    let used = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        used += lines[i].text.length + 1;
        if (used > budget) { break; }
        out.unshift(lines[i]);
    }
    return out;
}

function preferParagraphBoundary(kept: Line[]): Line[] {
    const minKeep = Math.floor(kept.length * 0.75);
    for (let i = kept.length - 1; i >= minKeep && i > 0; i--) {
        if (PARAGRAPH_HEADER.test(kept[i].text)) { return kept.slice(0, i); }
    }
    return kept;
}

const range = (a: number, b: number): string => (a === b ? `${a}` : `${a}-${b}`);

export function prepareForLlm(content: string, opts: PrepareOptions): PreparedSource {
    const normalized = normalizeSource(content);
    const totalLines = normalized.length;
    let lines: Line[] = normalized.map((text, i) => ({ n: i + 1, text }));
    if (opts.dropBlankLines) { lines = lines.filter(l => l.text.trim() !== ''); }

    if (size(lines) <= opts.maxChars) {
        return {
            text: lines.map(l => l.text).join('\n'),
            truncated: false,
            totalLines,
            sentLines: lines.length,
            coverage: `Fonte completo enviado (${totalLines} linhas).`
        };
    }

    const isComment = (t: string): boolean => t.length > 6 && (t[6] === '*' || t[6] === '/');
    const procIdx = lines.findIndex(l => /\bPROCEDURE\s+DIVISION\b/i.test(l.text) && !isComment(l.text));

    let kept: Line[][] = [];      // blocos contíguos enviados
    let omitted: { from: number; to: number; label: string }[] = [];

    if (procIdx > 0) {
        const data = lines.slice(0, procIdx);
        const proc = lines.slice(procIdx);
        const dataKept = size(data) <= Math.floor(opts.maxChars * 0.35)
            ? data
            : takeHead(data, Math.floor(opts.maxChars * 0.35));
        const procBudget = opts.maxChars - size(dataKept);
        let procKept = size(proc) <= procBudget ? proc : preferParagraphBoundary(takeHead(proc, procBudget));

        kept = [dataKept, procKept];
        if (dataKept.length < data.length) {
            omitted.push({ from: dataKept.length ? dataKept[dataKept.length - 1].n + 1 : data[0].n, to: data[data.length - 1].n, label: 'DATA DIVISION' });
        }
        if (procKept.length < proc.length) {
            omitted.push({ from: procKept.length ? procKept[procKept.length - 1].n + 1 : proc[0].n, to: proc[proc.length - 1].n, label: 'PROCEDURE DIVISION' });
        }
    } else {
        const head = takeHead(lines, Math.floor(opts.maxChars * 0.7));
        const tail = takeTail(lines.slice(head.length), Math.floor(opts.maxChars * 0.3));
        kept = [head, tail];
        const from = head.length ? head[head.length - 1].n + 1 : 1;
        const to = tail.length ? tail[0].n - 1 : totalLines;
        if (to >= from) { omitted.push({ from, to, label: 'trecho intermediário' }); }
    }

    // Monta o texto com marcadores explícitos de omissão.
    const parts: string[] = [];
    const [first, second] = kept;
    parts.push(...first.map(l => l.text));
    const gapBetween = first.length && second.length ? second[0].n - first[first.length - 1].n - 1 : 0;
    if (gapBetween > 0) {
        parts.push(`*** [TRECHO OMITIDO: linhas ${range(first[first.length - 1].n + 1, second[0].n - 1)}] ***`);
    }
    parts.push(...second.map(l => l.text));
    const lastKept = (second.length ? second : first);
    const lastN = lastKept.length ? lastKept[lastKept.length - 1].n : 0;
    if (lastN < totalLines && !(procIdx <= 0)) {
        parts.push(`*** [TRECHO OMITIDO ATÉ O FIM: linhas ${range(lastN + 1, totalLines)}] ***`);
    }

    const sentLines = first.length + second.length;
    const omittedText = omitted.map(o => `${range(o.from, o.to)} (${o.label})`).join('; ');
    return {
        text: parts.join('\n'),
        truncated: true,
        totalLines,
        sentLines,
        coverage: `Enviadas ${sentLines} de ${totalLines} linhas. Omitidas: ${omittedText}. `
            + 'Analise somente o que foi enviado e NÃO conclua que algo está ausente a partir do trecho omitido.'
    };
}
