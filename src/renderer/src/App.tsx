import { useStore } from './store';
import { CommandForm } from './components/CommandForm';
import { CommandHistoryPalette } from './components/CommandHistoryPalette';
import { Palette } from './components/Palette';
import { ProjectSection } from './components/ProjectSection';
import { ProjectsDialog } from './components/ProjectsDialog';
import { DialogHost } from './components/DialogHost';
import { ConfigBanner, Notices } from './components/Notices';
import { SearchBar } from './components/SearchBar';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { TerminalArea } from './components/TerminalArea';
import { TestsPanel } from './components/TestsPanel';
import { DockerPortsPanel } from './components/DockerPortsPanel';
import { TransferDialogs } from './components/TransferDialogs';
import { VariablesDialog } from './components/VariablesDialog';
import { WorkspacesDialog } from './components/WorkspacesDialog';

export function App(): JSX.Element {
  const sidebarVisible = useStore((s) => s.ui?.sidebar.visible);
  return (
    <div className="app" data-testid="app-root">
      <TabBar />
      <ConfigBanner />
      <div className="main">
        {sidebarVisible && <Sidebar projectSection={<ProjectSection />} />}
        <div className="terminal-column">
          <SearchBar />
          <TerminalArea />
        </div>
      </div>
      <StatusBar />
      <Notices />
      <CommandForm />
      <ProjectsDialog />
      <Palette />
      <CommandHistoryPalette />
      <SettingsDialog />
      <TransferDialogs />
      <WorkspacesDialog />
      <TestsPanel />
      <DockerPortsPanel />
      <VariablesDialog />
      <DialogHost />
    </div>
  );
}
