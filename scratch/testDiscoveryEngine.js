"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const componentDiscoveryEngine_1 = require("../src/mainframe/componentDiscovery/componentDiscoveryEngine");
const zoweConnector_1 = require("../src/zowe/zoweConnector");
// Mock direto no objeto
zoweConnector_1.zoweConnector.listDatasetMembers = async (dataset) => {
    if (dataset === 'SYS1.PLACEHOLDER.COBOL')
        return ['ABC123', 'XYZ001', 'PGM999'];
    if (dataset === 'SYS1.PLACEHOLDER.COPYLIB')
        return ['CPYCLI01'];
    return [];
};
zoweConnector_1.zoweConnector.readDatasetMember = async (dataset, member) => {
    let content = '';
    if (member === 'ABC123') {
        content = `
IDENTIFICATION DIVISION.
PROGRAM-ID. ABC123.
DATA DIVISION.
WORKING-STORAGE SECTION.
01 WS-CLI-REC.
COPY CPYCLI01.
PROCEDURE DIVISION.
CALL 'XYZ001'.
EXEC CICS LINK PROGRAM('PGM999') END-EXEC.
STOP RUN.
        `;
    }
    else if (member === 'XYZ001') {
        content = `
IDENTIFICATION DIVISION.
PROGRAM-ID. XYZ001.
PROCEDURE DIVISION.
STOP RUN.
        `;
    }
    else if (member === 'PGM999') {
        content = `
IDENTIFICATION DIVISION.
PROGRAM-ID. PGM999.
PROCEDURE DIVISION.
STOP RUN.
        `;
    }
    return {
        sourceType: 'member',
        sourceIdentifier: `${dataset}(${member})`,
        content,
        charsRetrieved: content.length,
        charsSentToLlm: content.length,
        truncated: false
    };
};
const exampleArea = {
    id: "example-area",
    displayName: "Example Area (Placeholder)",
    libraries: {
        programs: ["SYS1.PLACEHOLDER.COBOL"],
        copybooks: ["SYS1.PLACEHOLDER.COPYLIB"],
        jcl: ["SYS1.PLACEHOLDER.JCL"],
        procs: ["SYS1.PLACEHOLDER.PROCLIB"]
    },
    patterns: {
        programs: ["ABC*", "XYZ*"],
        copybooks: ["CPY*"],
        jcl: ["JABC*"],
        procs: ["PABC*"]
    }
};
async function runTest() {
    console.log("Iniciando Discovery Engine para ABC123...");
    const engine = new componentDiscoveryEngine_1.ComponentDiscoveryEngine('ABC123', exampleArea);
    const { graph, telemetry } = await engine.discover();
    console.log("\n=== GRAFO GERADO ===");
    console.log(JSON.stringify(graph, null, 2));
    console.log("\n=== TELEMETRIA ===");
    console.log(JSON.stringify(telemetry, null, 2));
}
runTest();
//# sourceMappingURL=testDiscoveryEngine.js.map