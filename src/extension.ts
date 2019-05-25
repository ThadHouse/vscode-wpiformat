'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as mm from 'micromatch';
import * as path from 'path';
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-wpiformat" is now active!');

    const format = new WPIFormat();

    context.subscriptions.push(vscode.workspace.onWillSaveTextDocument((e) => {
        const td = e.document;

        const formatConfig = vscode.workspace.getConfiguration('wpiformat');

        const lfsave = formatConfig.get('forceLFOnSave');

        if (lfsave === true) {
            const origIgnoreFiles: string[] | undefined = formatConfig.get('ignoreForceLFSaveFiles');
            const ignoreFiles: string[] = origIgnoreFiles !== undefined ? origIgnoreFiles : [];
            const fname = path.basename(td.fileName);

            const matches: string[] = mm([fname], ignoreFiles);

            if (matches.length === 0 && td.eol === vscode.EndOfLine.CRLF) {
                const edit = vscode.TextEdit.setEndOfLine(vscode.EndOfLine.LF);
                e.waitUntil(Promise.resolve([edit]));
            }

        }
    }));

    const onDidSaveEvent = vscode.workspace.onDidSaveTextDocument((td) => {
        format.runFormatOnSave(td);
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const formatFile = vscode.commands.registerCommand('extension.wpiformatfile', async () => {
        await format.runFormatOnRequest();
    });

    context.subscriptions.push(formatFile);
    context.subscriptions.push(onDidSaveEvent);
    context.subscriptions.push(format);
}

// this method is called when your extension is deactivated
// tslint:disable-next-line:no-empty
export function deactivate() { }

function getRepoRoot(fullPath: string): string | undefined {
    let currentDir = path.resolve(fullPath);
    while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return undefined;
}

function detectIfWorkspaceHasStyleGuide(uri: vscode.Uri): boolean {
    const ret = vscode.workspace.getWorkspaceFolder(uri);
    if (!ret) { return false; }
    return fs.existsSync(path.join(ret.uri.fsPath, '.styleguide'));
}

function detectClangFormatMissing(error: string): boolean {
    return error.indexOf('clang-format not found in PATH. Is it installed?') >= 0;
}

function detectWPIFormatMissing(error: string): boolean {
    // tslint:disable-next-line:quotemark
    return error.indexOf("\'wpiformat\' is not recognized") >= 0;
}

function decodeFileErrors(error: string, searchFile: string): Array<[string, number]> {
    const infoArr: Array<[string, number]> = [];
    // split error string by line
    const fileLen = searchFile.length;
    const lines = error.split('\n');
    for (const line of lines) {
        const startIndex = line.indexOf(searchFile);
        if (startIndex >= 0) {
            const afterFile = line.substring(startIndex + fileLen + 1);
            const splitLine = afterFile.split(':');
            if (splitLine.length < 2) { continue; }
            const errorLine = parseInt(splitLine[0].trim(), 10);
            const errorString = splitLine[1].trim();
            const errorInfo: [string, number] = [errorString, errorLine];
            infoArr.push(errorInfo);
            // Found file. Find error line

        }
    }
    return infoArr;
}

class WPIFormat {
    private readonly _statusBarItem: vscode.StatusBarItem;
    private readonly _diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._statusBarItem.hide();
        this._diagnosticCollection = vscode.languages.createDiagnosticCollection('wpiformat');
        //
    }

    public runFormatOnSave(td: vscode.TextDocument): void {
        const formatConfig = vscode.workspace.getConfiguration('wpiformat');

        const config = formatConfig.get('runFormatOnSave');
        if (config === false) {
            return;
        }

        if (!detectIfWorkspaceHasStyleGuide(td.uri)) {
            return;
        }

        this.runWpiformatOnFile(td.uri);
    }

    public async runFormatOnRequest(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const config = vscode.workspace.getConfiguration('wpiformat').get('saveOnFormatRequest');
        const window = vscode.window.activeTextEditor;
        if (config === true && window) {
             await window.document.save();
        }

        this.runWpiformatOnFile(editor.document.uri);
    }

    public runWpiformatOnFile(fileUri: vscode.Uri) {
        const file: string = fileUri.fsPath;
        const gitRepo = getRepoRoot(file);

        if (gitRepo === undefined) {
            vscode.window.showErrorMessage('File is not in a git repo');
            return;
        }

        const filePath = path.resolve(file).substring(gitRepo.length + 1);

        const exec = child_process.exec;

        this._statusBarItem.text = 'Running WPIFormat';
        this._statusBarItem.show();

        exec(`wpiformat -f ${filePath}`, {
            cwd: gitRepo,
        }, (err, _, stderr) => {
            this._statusBarItem.hide();
            this._diagnosticCollection.clear();
            if (err === null)  {
                return;
            }
            if (detectClangFormatMissing(stderr)) {
                vscode.window.showErrorMessage('clang-format not found in PATH. Is it installed?');
            }
            if (detectWPIFormatMissing(stderr)) {
                vscode.window.showErrorMessage('wpiformat was not found in PATH. Is it installed?');
                return;
            }
            const fileErrors = decodeFileErrors(stderr, file);
            const diagnostics: vscode.Diagnostic[] = [];
            fileErrors.forEach((f) => {
                const severity = vscode.DiagnosticSeverity.Error;
                const message: string = f[0];
                const range = new vscode.Range(f[1] - 1, 0, f[1] - 1, Number.MAX_VALUE);
                const diagnostic = new vscode.Diagnostic(range, message, severity);
                diagnostics.push(diagnostic);
            });
            this._diagnosticCollection.set(fileUri, diagnostics);
            console.log(err);

        });
    }

    public dispose() {
        this._statusBarItem.dispose();
        this._diagnosticCollection.dispose();
    }
}
