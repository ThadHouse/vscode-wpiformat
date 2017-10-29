'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path'
import * as child_process from 'child_process'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-wpiformat" is now active!');

    let onDidSaveEvent = vscode.workspace.onDidSaveTextDocument((td) => {
        let config = vscode.workspace.getConfiguration('wpiformat').get('runFormatOnSave');
        if (config === false) {
            return;
        }
        
        if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length < 1) {
            return;
        }

        let isStyleguideWorkspace = detectIfStyleguideRepoWorkspace(vscode.workspace.workspaceFolders);

        if (!detectIfStyleguideRepoWorkspace(vscode.workspace.workspaceFolders)) {
            return;
        }

        runWpiformatOnFile(td.uri, (s) => {
            
        });
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.wpiformatfile', () => {
        // The code you place here will be executed every time your command is executed

        let editor = vscode.window.activeTextEditor;
        if (!editor) return;

        //editor.document.fileName

        runWpiformatOnFile(editor.document.uri, (s) => {
            
        });

        // Display a message box to the user
        //vscode.window.showInformationMessage(editor.document.fileName);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(onDidSaveEvent);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function getRepoRoot(fullPath: string): string {
    var currentDir = path.resolve(fullPath);
    while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return undefined;
}

function detectIfStyleguideRepoWorkspace(workspaces: vscode.WorkspaceFolder[]): boolean {
    var index = 0;
    for (index = 0; index < workspaces.length; index++) {
        let fPath = workspaces[index].uri.fsPath
        if (fs.existsSync(path.join(fPath, '.styleguide'))) {
            return true;
        }
    }
    return false;
}

function runWpiformatOnFile(fileUri: vscode.Uri, onSuccess: (output: string) => void) {
    let file : string = fileUri.fsPath;
    var gitRepo = getRepoRoot(file);

    if (gitRepo === undefined) {
        vscode.window.showErrorMessage('File is not in a git repo');
        return;
    }

    var filePath = path.resolve(file).substring(gitRepo.length + 1);

    var exec = child_process.exec;

    const arg = [`-f ${filePath}`];

    const child = exec(`wpiformat -f ${filePath}`, {
        cwd: gitRepo
    }, (err, stdout, stderr) => {
        if (err == null) return;
        if (detectClangFormatMissing(stderr)) {
            vscode.window.showErrorMessage("clang-format not found in PATH. Is it installed?");
        }
        let fileErrors = decodeFileErrors(stderr, file);
        let diagnostics : vscode.Diagnostic[] = [];
        fileErrors.forEach((f)=> {
            let severity = vscode.DiagnosticSeverity.Error;
            let message : string = f[0];
            let range = new vscode.Range(f[1] - 1, 0, f[1] - 1, Number.MAX_VALUE);
            let diagnostic = new vscode.Diagnostic(range, message, severity);
            diagnostics.push(diagnostic);
        });
        let diag = vscode.languages.createDiagnosticCollection("file");
        diag.set(fileUri, diagnostics);
        console.log(err);
        ;
    });
}

function detectClangFormatMissing(error: string) : boolean {
    return error.indexOf("clang-format not found in PATH. Is it installed?") >= 0;
}

function decodeFileErrors(error: string, searchFile: string) : [string, number][] {
    let infoArr : [string, number][] = [];
    // split error string by line
    let fileLen = searchFile.length;
    let lines = error.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let startIndex = lines[i].indexOf(searchFile);
        if (startIndex >= 0) {
            let afterFile = lines[i].substring(startIndex + fileLen + 1);
            let splitLine = afterFile.split(':');
            if (splitLine.length < 2) continue;
            let errorLine = parseInt(splitLine[0].trim());
            let errorString = splitLine[1].trim();
            let errorInfo : [string, number] = [errorString, errorLine];
            infoArr.push(errorInfo);
            // Found file. Find error line

        }
    }
    return infoArr;
}
