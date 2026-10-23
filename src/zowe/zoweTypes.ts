/**
 * Interfaces TypeScript para dados retornados pelo Zowe.
 * Mantemos as interfaces internas para não depender de tipagens externas pesadas.
 */

export interface ZoweDatasetMember {
    dsName: string;
    member?: string;
    content: string;
}

export interface ZoweJobInfo {
    jobId: string;
    jobName: string;
    owner: string;
    status: string;
    retCode: string | null;
    type: string;
}

export interface ZoweSpoolContent {
    jobId: string;
    jobName: string;
    spoolId: number;
    ddName: string;
    content: string;
}

export interface ZoweConnectionStatus {
    connected: boolean;
    profileName: string | null;
    reason: string;
}
