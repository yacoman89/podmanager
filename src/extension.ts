import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    console.log('Podmanager extension is now active!');

    const podmanTreeDataProvider = new PodmanTreeDataProvider();
    const treeView = vscode.window.createTreeView('podmanView', { treeDataProvider: podmanTreeDataProvider });
    context.subscriptions.push(treeView);

    const refreshCommand = vscode.commands.registerCommand('podmanager.refreshView', () => {
        podmanTreeDataProvider.refresh();
    });

    const startPodmanMachineCommand = vscode.commands.registerCommand('podmanager.startPodmanMachine', async () => {
        try {
            const isRunning = await checkPodmanMachineStatus();
            if (isRunning) {
                vscode.window.showInformationMessage('Podman machine is already running.');
            } else {
                const answer = await vscode.window.showInformationMessage(
                    'Podman machine is not running. Do you want to start it?',
                    'Yes', 'No'
                );
                if (answer === 'Yes') {
                    await execAsync('podman machine start');
                    vscode.window.showInformationMessage('Podman machine started successfully');
                    podmanTreeDataProvider.refresh();
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to start Podman machine: ' + error);
        }
    });

    const deleteContainerCommand = vscode.commands.registerCommand('podmanager.deleteContainer', async (item: PodmanItem) => {
        const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete container ${item.id}?`, 'Yes', 'No');
        if (answer === 'Yes') {
            try {
                await execAsync(`podman container rm -f ${item.id}`);
                vscode.window.showInformationMessage(`Container ${item.id} deleted successfully`);
                podmanTreeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete container ${item.id}: ` + error);
            }
        }
    });

    const deleteImageCommand = vscode.commands.registerCommand('podmanager.deleteImage', async (item: PodmanItem) => {
        const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete image ${item.id}?`, 'Yes', 'No');
        if (answer === 'Yes') {
            try {
                await execAsync(`podman image rm -f ${item.id}`);
                vscode.window.showInformationMessage(`Image ${item.id} deleted successfully`);
                podmanTreeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete image ${item.id}: ` + error);
            }
        }
    });

    const deleteVolumeCommand = vscode.commands.registerCommand('podmanager.deleteVolume', async (item: PodmanItem) => {
        const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete volume ${item.id}?`, 'Yes', 'No');
        if (answer === 'Yes') {
            try {
                await execAsync(`podman volume rm -f ${item.id}`);
                vscode.window.showInformationMessage(`Volume ${item.id} deleted successfully`);
                podmanTreeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete volume ${item.id}: ` + error);
            }
        }
    });

    const deleteNetworkCommand = vscode.commands.registerCommand('podmanager.deleteNetwork', async (item: PodmanItem) => {
        const answer = await vscode.window.showWarningMessage(`Are you sure you want to delete network ${item.id}?`, 'Yes', 'No');
        if (answer === 'Yes') {
            try {
                await execAsync(`podman network rm -f ${item.id}`);
                vscode.window.showInformationMessage(`Network ${item.id} deleted successfully`);
                podmanTreeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete network ${item.id}: ` + error);
            }
        }
    });

    const startContainerCommand = vscode.commands.registerCommand('podmanager.startContainer', async (item: PodmanItem) => {
        try {
            await execAsync(`podman container start ${item.id}`);
            vscode.window.showInformationMessage(`Container ${item.id} started successfully`);
            podmanTreeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start container ${item.id}: ` + error);
        }
    });

    const stopContainerCommand = vscode.commands.registerCommand('podmanager.stopContainer', async (item: PodmanItem) => {
        try {
            await execAsync(`podman container stop ${item.id}`);
            vscode.window.showInformationMessage(`Container ${item.id} stopped successfully`);
            podmanTreeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stop container ${item.id}: ` + error);
        }
    });

    const restartContainerCommand = vscode.commands.registerCommand('podmanager.restartContainer', async (item: PodmanItem) => {
        try {
            await execAsync(`podman container restart ${item.id}`);
            vscode.window.showInformationMessage(`Container ${item.id} restarted successfully`);
            podmanTreeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restart container ${item.id}: ` + error);
        }
    });

    const openInTerminalCommand = vscode.commands.registerCommand('podmanager.openInTerminal', async (item: PodmanItem) => {
        if (item.id) {
            try {
                const terminal = vscode.window.createTerminal(`Podman: ${item.label}`);
                terminal.sendText(`podman exec -it ${item.id} /bin/sh`);
                terminal.show();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open terminal for container ${item.id}: ${error}`);
            }
        }
    });

    // Updated Compose commands
    const composeUpCommand = vscode.commands.registerCommand('podmanager.composeUp', async (uri?: vscode.Uri) => {
        await runComposeCommand('up -d', uri);
        podmanTreeDataProvider.refresh();
    });

    const composeStartCommand = vscode.commands.registerCommand('podmanager.composeStart', async (item: PodmanItem) => {
        await runComposeCommand('start', undefined, item.composeProject);
        podmanTreeDataProvider.refresh();
    });

    const composeStopCommand = vscode.commands.registerCommand('podmanager.composeStop', async (item: PodmanItem) => {
        await runComposeCommand('stop', undefined, item.composeProject);
        podmanTreeDataProvider.refresh();
    });

    const composeRestartCommand = vscode.commands.registerCommand('podmanager.composeRestart', async (item: PodmanItem) => {
        await runComposeCommand('restart', undefined, item.composeProject);
        podmanTreeDataProvider.refresh();
    });

    const composeDownCommand = vscode.commands.registerCommand('podmanager.composeDown', async (item: PodmanItem) => {
        const answer = await vscode.window.showWarningMessage(
            `Are you sure you want to stop and remove all compose containers for ${item.composeProject}?`,
            'Yes', 'No'
        );
        if (answer === 'Yes') {
            await runComposeCommand('down', undefined, item.composeProject);
            podmanTreeDataProvider.refresh();
        }
    });

    context.subscriptions.push(
        refreshCommand,
        startPodmanMachineCommand,
        deleteContainerCommand,
        startContainerCommand,
        stopContainerCommand,
        restartContainerCommand,
        openInTerminalCommand,
        deleteImageCommand,
        deleteVolumeCommand,
        deleteNetworkCommand,
        composeUpCommand,
        composeStartCommand,
        composeStopCommand,
        composeRestartCommand,
        composeDownCommand
    );

    checkPodmanMachineStatus();
}

async function checkPodmanMachineStatus(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('podman machine list --format "{{.Name}}|{{.Running}}"');
        const machines = stdout.split('\n').filter(line => line.trim() !== '');
        const runningMachine = machines.find(machine => machine.split('|')[1] === 'Running');
        return !!runningMachine;
    } catch (error) {
        vscode.window.showErrorMessage('Failed to check Podman machine status: ' + error);
        return false;
    }
}

async function runComposeCommand(command: string, uri?: vscode.Uri, composeProject?: string) {
    let composeFile: string | undefined;

    if (uri) {
        composeFile = uri.fsPath;
    } else if (composeProject) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder is open');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const composeFileNames = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

        for (const fileName of composeFileNames) {
            const filePath = path.join(rootPath, fileName);
            if (fs.existsSync(filePath)) {
                composeFile = filePath;
                break;
            }
        }
    }

    if (!composeFile && !composeProject) {
        vscode.window.showErrorMessage('No compose file found');
        return;
    }

    vscode.window.showInformationMessage(`Starting Podman Compose ${command}...`);

    try {
        let cmd = `podman-compose`;
        if (composeFile) {
            cmd += ` -f "${composeFile}"`;
        } else if (composeProject) {
            cmd += ` -p "${composeProject}"`;
        }
        cmd += ` ${command}`;

        const { stdout, stderr } = await execAsync(cmd);
        vscode.window.showInformationMessage(`Podman Compose ${command} executed successfully`);
        if (stderr) {
            vscode.window.showWarningMessage(`Podman Compose ${command} completed with warnings: ${stderr}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute Podman Compose ${command}: ${error}`);
    }
}

class PodmanTreeDataProvider implements vscode.TreeDataProvider<PodmanItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PodmanItem | undefined | null | void> = new vscode.EventEmitter<PodmanItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PodmanItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private refreshTimeout: NodeJS.Timeout | null = null;

    refresh(): void {
      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
      }
      this.refreshTimeout = setTimeout(() => {
        this._onDidChangeTreeData.fire();
        this.refreshTimeout = null;
      }, 300); // Adjust the delay as needed
    }

    getTreeItem(element: PodmanItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PodmanItem): Promise<PodmanItem[]> {
        if (!element) {
            return [
                new PodmanItem('Containers', vscode.TreeItemCollapsibleState.Collapsed, 'containers'),
                new PodmanItem('Images', vscode.TreeItemCollapsibleState.Collapsed, 'images'),
                new PodmanItem('Volumes', vscode.TreeItemCollapsibleState.Collapsed, 'volumes'),
                new PodmanItem('Networks', vscode.TreeItemCollapsibleState.Collapsed, 'networks')
            ];
        }

        switch (element.label) {
            case 'Containers':
                return this.getContainers();
            case 'Images':
                return this.getImages();
            case 'Volumes':
                return this.getVolumes();
            case 'Networks':
                return this.getNetworks();
            default:
                if (element.contextValue === 'compose-group') {
                    return element.children || [];
                }
                return [];
        }
    }

    private async getContainers(): Promise<PodmanItem[]> {
        try {
            const { stdout: containerStdout } = await execAsync('podman container ls -a --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.Labels}}"');
            const containers = containerStdout.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const [id, name, status, labels] = line.split('|');
                    const isRunning = status.startsWith('Up');
                    const isCompose = labels.includes('com.docker.compose.project');
                    const composeProject = isCompose ? this.extractComposeProject(labels) : '';
                    return { id, name, status, isRunning, isCompose, composeProject };
                });

            const regularContainers = containers
                .filter(c => !c.isCompose)
                .map(c => new PodmanItem(`${c.name} (${c.id})`, vscode.TreeItemCollapsibleState.None, 'container', c.id, c.status, c.isRunning));

            const composeContainers = containers.filter(c => c.isCompose);
            
            if (composeContainers.length > 0) {
                const composeGroups = this.groupComposeContainers(composeContainers);
                const composeGroupItems = Object.entries(composeGroups).map(([project, containers], index) => {
                    const groupItem = new PodmanItem(`Compose Group ${index + 1}: ${project}`, vscode.TreeItemCollapsibleState.Expanded, 'compose-group', undefined, undefined, undefined, project);
                    groupItem.children = containers.map(c => 
                        new PodmanItem(`${c.name} (${c.id})`, vscode.TreeItemCollapsibleState.None, 'compose-container', c.id, c.status, c.isRunning, project)
                    );
                    return groupItem;
                });
                return [...regularContainers, ...composeGroupItems];
            }

            return regularContainers;
        } catch (error) {
            vscode.window.showErrorMessage('Failed to get containers: ' + error);
            return [];
        }
    }
    
    private extractComposeProject(labels: string): string {
        const projectLabel = labels.split(',').find(label => label.startsWith('com.docker.compose.project='));
        return projectLabel ? projectLabel.split('=')[1] : 'Unknown Project';
    }

    private groupComposeContainers(containers: any[]): { [key: string]: any[] } {
        return containers.reduce((groups: { [key: string]: any[] }, container) => {
            const project = container.composeProject;
            if (!groups[project]) {
                groups[project] = [];
            }
            groups[project].push(container);
            return groups;
        }, {});
    }

    private async getImages(): Promise<PodmanItem[]> {
        try {
            const { stdout } = await execAsync('podman image ls --format "{{.ID}}|{{.Repository}}:{{.Tag}}"');
            return stdout.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const [id, name] = line.split('|');
                    return new PodmanItem(`${name} (${id})`, vscode.TreeItemCollapsibleState.None, 'image', id);
                });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to get images: ' + error);
            return [];
        }
    }

    private async getVolumes(): Promise<PodmanItem[]> {
        try {
            const { stdout } = await execAsync('podman volume ls --format "{{.Name}}|{{.Driver}}"');
            return stdout.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const [name, driver] = line.split('|');
                    return new PodmanItem(`${name} (${driver})`, vscode.TreeItemCollapsibleState.None, 'volume', name);
                });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to get volumes: ' + error);
            return [];
        }
    }

    private async getNetworks(): Promise<PodmanItem[]> {
        try {
            const { stdout } = await execAsync('podman network ls --format "{{.Name}}|{{.Driver}}"');
            return stdout.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const [name, driver] = line.split('|');
                    return new PodmanItem(`${name} (${driver})`, vscode.TreeItemCollapsibleState.None, 'network', name);
                });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to get networks: ' + error);
            return [];
        }
    }
}

class PodmanItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly id?: string,
        public readonly status?: string,
        public readonly isRunning?: boolean,
        public readonly composeProject?: string,
        public children?: PodmanItem[]
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.iconPath = this.getIconPath();
        this.tooltip = this.getTooltip();
        this.command = this.getCommand();
    }
    
    private getIconPath(): vscode.ThemeIcon | { light: string; dark: string } | undefined {
        switch (this.contextValue) {
            case 'container':
            case 'compose-container':
                return this.isRunning
                    ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'))
                    : new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.red'));
            case 'image':
                return new vscode.ThemeIcon('file');
            case 'volume':
                return new vscode.ThemeIcon('database');
            case 'network':
                return new vscode.ThemeIcon('globe');
            case 'compose-group':
                return new vscode.ThemeIcon('layers');
            default:
                return undefined;
        }
    }

    private getTooltip(): string | undefined {
        if (this.contextValue === 'container' || this.contextValue === 'compose-container') {
            return `ID: ${this.id}\nStatus: ${this.status}`;
        }
        return undefined;
    }

    private getCommand(): vscode.Command | undefined {
        if (this.contextValue === 'container' || this.contextValue === 'compose-container') {
            return {
                command: 'podmanager.openInTerminal',
                title: 'Open in Terminal',
                arguments: [this]
            };
        }
        return undefined;
    }
}

export function deactivate() {}