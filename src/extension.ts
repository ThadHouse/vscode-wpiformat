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

    let format = new WPIFormat();

    let onDidSaveEvent = vscode.workspace.onDidSaveTextDocument((td) => {
        format.runFormatOnSave(td);
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let formatFile = vscode.commands.registerCommand('extension.wpiformatfile', async () =>
    {
        await format.runFormatOnRequest()
    });

    context.subscriptions.push(formatFile);
    context.subscriptions.push(onDidSaveEvent);
    context.subscriptions.push(format);
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

function detectClangFormatMissing(error: string) : boolean {
    return error.indexOf("clang-format not found in PATH. Is it installed?") >= 0;
}

function detectWPIFormatMissing(error: string) : boolean {
    return error.indexOf("\'wpiformat\' is not recognized") >= 0;
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

class WPIFormat {
    private _statusBarItem: vscode.StatusBarItem;
    private _diagnosticCollection: vscode.DiagnosticCollection;

    public runFormatOnSave(td: vscode.TextDocument) : void {
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

        this.runWpiformatOnFile(td.uri);
    }

    public async runFormatOnRequest(): Promise<void> {
        let editor = vscode.window.activeTextEditor;
        if (!editor) return;

        let config = vscode.workspace.getConfiguration('wpiformat').get('saveOnFormatRequest');
        if (config === true) {
             await vscode.window.activeTextEditor.document.save()
        }


        this.runWpiformatOnFile(editor.document.uri);
    }

    public runWpiformatOnFile(fileUri: vscode.Uri) {
        let file : string = fileUri.fsPath;
        var gitRepo = getRepoRoot(file);

        if (gitRepo === undefined) {
            vscode.window.showErrorMessage('File is not in a git repo');
            return;
        }

        var filePath = path.resolve(file).substring(gitRepo.length + 1);

        var exec = child_process.exec;

        const arg = [`-f ${filePath}`];

        if (!this._statusBarItem) {
            this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        }

        if (!this._diagnosticCollection) {
            this._diagnosticCollection = vscode.languages.createDiagnosticCollection("wpiformat");
        }

        this._statusBarItem.text = 'Running WPIFormat'
        this._statusBarItem.show();

        const child = exec(`wpiformat -f ${filePath}`, {
            cwd: gitRepo
        }, (err, stdout, stderr) => {
            this._statusBarItem.hide();
            this._diagnosticCollection.clear();
            if (err == null)  {
                return;
            }
            if (detectClangFormatMissing(stderr)) {
                vscode.window.showErrorMessage("clang-format not found in PATH. Is it installed?");
            }
            if (detectWPIFormatMissing(stderr)) {
                vscode.window.showErrorMessage("wpiformat was not found in PATH. Is it installed?");
                return;
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
            this._diagnosticCollection.set(fileUri, diagnostics);
            console.log(err);
            ;
        });
    }



    dispose() {
        if (this._statusBarItem) {
            this._statusBarItem.dispose();
        }
        if (this._diagnosticCollection) {
            this._diagnosticCollection.dispose();
        }
    }
}
