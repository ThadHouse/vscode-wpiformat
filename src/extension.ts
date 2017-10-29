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
        if (config === false) return;

        runWpiformatOnFile(td.fileName, false);
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.wpiformatfile', () => {
        // The code you place here will be executed every time your command is executed

        let editor = vscode.window.activeTextEditor;
        if (!editor) return;

        //editor.document.fileName

        runWpiformatOnFile(editor.document.fileName, true);

        // Display a message box to the user
        //vscode.window.showInformationMessage(editor.document.fileName);
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function getRepoRoot(fullPath: string) : string {
    var currentDir = path.resolve(fullPath);
    while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }
    return undefined;
}

function runWpiformatOnFile(file: string, messageOnError: boolean) {
    var gitRepo = getRepoRoot(file);

    if (gitRepo === undefined) {
        // TODO: Make the repo root check part of activation.
        if (messageOnError) {
            vscode.window.showErrorMessage('File is not in a git repo');
        }
        return;
    }

    var filePath = path.resolve(file).substring(gitRepo.length + 1);

    var spawn = child_process.exec;

    const arg = [`-f ${filePath}`];

    const child = spawn(`wpiformat -f ${filePath}`, {
        cwd: gitRepo
    });
    
    child.on('exit', function (code, signal) {
        if (code === 0) return;
        if (messageOnError) {
            vscode.window.showInformationMessage('child process exited with ' +
                        `code ${code} and signal ${signal}`);
        }
        });
}
