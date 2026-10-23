import * as fs from 'fs';
import * as path from 'path';

export interface AreaLibraries {
    programs: string[];
    copybooks: string[];
    jcl: string[];
    procs: string[];
}

export interface AreaPatterns {
    programs: string[];
    copybooks: string[];
    jcl: string[];
    procs: string[];
}

export interface AreaConfig {
    id: string;
    displayName: string;
    libraries: AreaLibraries;
    patterns: AreaPatterns;
}

export class AreaConfigManager {
    private areas: Map<string, AreaConfig> = new Map();
    private areasDir: string;

    constructor() {
        this.areasDir = path.join(__dirname, '../../config/areas');
        this.loadAllAreas();
    }

    private loadAllAreas() {
        if (!fs.existsSync(this.areasDir)) {
            return;
        }

        const files = fs.readdirSync(this.areasDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(this.areasDir, file), 'utf8');
                    const config: AreaConfig = JSON.parse(content);
                    
                    if (this.validateSchema(config)) {
                        this.areas.set(config.id.toLowerCase(), config);
                    } else {
                        console.error(`[AreaConfigManager] Schema inválido para a área: ${file}`);
                    }
                } catch (err) {
                    console.error(`[AreaConfigManager] Erro ao carregar área ${file}:`, err);
                }
            }
        }
    }

    private validateSchema(config: any): config is AreaConfig {
        if (!config || typeof config.id !== 'string' || typeof config.displayName !== 'string') {
            return false;
        }
        if (!config.libraries || !Array.isArray(config.libraries.programs) || !Array.isArray(config.libraries.copybooks)) {
            return false;
        }
        return true;
    }

    public getArea(id: string): AreaConfig | undefined {
        return this.areas.get(id.toLowerCase());
    }

    public listAreas(): AreaConfig[] {
        return Array.from(this.areas.values());
    }
}

export const areaConfigManager = new AreaConfigManager();
