import { useMemo, useState } from 'react'
import AccountDialogs from '../features/dialogs/AccountDialogs'
import AppManagementDialogs from '../features/dialogs/AppManagementDialogs'
import ProjectDialogs from '../features/dialogs/ProjectDialogs'
import TemplateDialogs from '../features/dialogs/TemplateDialogs'

export default function AppDialogs({
  accountDialog,
  appDialog = null,
  appVersion = '0.0.0',
  accountForm,
  accountDialogUsername = '',
  accountStatus,
  applyTemplateConfirmation,
  busy,
  canCloseProjectDialog = false,
  bulkTemplateCount,
  changePassword,
  changeUsername,
  confirmApplyTemplateSelection,
  confirmMergeNodeIntoPhoto,
  createProject,
  currentUser,
  desktopEnvironment = false,
  desktopProjectPickerLoading = false,
  desktopProjectPickerProjects = [],
  desktopServerProfiles = [],
  deleteNode,
  deleteAccount,
  deleteTemplate,
  deleteNodeOpen,
  confirmRemoveIdentificationTemplate,
  deleteProject,
  deleteProjectText,
  desktopClientId,
  error,
  exportFileName,
  exportMediaTree,
  exportProject,
  handleDialogEnter,
  hasBulkSelection,
  identificationTemplates,
  importArchiveFile,
  importInputRef,
  importProject,
  importProjectName,
  importTemplateDialog,
  importTemplateFromProject,
  projectApiKeyInput,
  identificationTemplateRemovalCount,
  identificationTemplateRemovalNodes,
  mergePhotoConfirmation,
  mobileConnectionCount,
  newNodeDialog,
  newNodeName,
  onOpenManageAccounts = null,
  onCheckForUpdates = null,
  onOpenDesktopProject = null,
  onSelectDesktopServerProfile = null,
  projects,
  renameProject,
  logoutUser,
  saveProjectOpenAiKey,
  selectedNode,
  selectedDesktopServerProfileId = null,
  selectedProjectId,
  serverDisconnectDialogOpen = false,
  sessionDialogOpen,
  setAccountDialog,
  setAppDialog,
  setAccountForm,
  setApplyTemplateConfirmation,
  setDeleteNodeOpen,
  setDeleteProjectText,
  setExportFileName,
  setIdentificationTemplateRemovalNodeId,
  setImportProjectName,
  setImportTemplateDialog,
  setNewNodeDialog,
  setNewNodeName,
  setProjectApiKeyInput,
  setSessionDialogOpen,
  setShowProjectDialog,
  setShowProjectId,
  projectName = '',
  setProjectName,
  setMergePhotoConfirmation,
  showProjectDialog,
  handleServerDisconnectDismiss,
  submitNewNode,
  submitTemplateDialog,
  transferProgress,
  tree,
  bulkSelectionCount,
  templateDialog,
  setTemplateDialog,
  updateStatus = '',
  onConfirmClearCache = null,
}) {
  const [openProjectFilter, setOpenProjectFilter] = useState(null)
  const [connectedAccountFilter, setConnectedAccountFilter] = useState(false)

  const importableProjects = useMemo(
    () =>
      (projects || []).filter(
        (project) =>
          project.id !== selectedProjectId && Array.isArray(project.identificationTemplates) && project.identificationTemplates.length > 0,
      ),
    [projects, selectedProjectId],
  )
  const selectedImportProject =
    importableProjects.find((project) => project.id === importTemplateDialog?.sourceProjectId) || null
  const importableTemplates = selectedImportProject?.identificationTemplates || []
  const resolvedAccountDialogUsername = accountDialogUsername || currentUser?.username || ''

  return (
    <>
      <AppManagementDialogs
        appDialog={appDialog}
        appVersion={appVersion}
        busy={busy}
        desktopClientId={desktopClientId}
        handleServerDisconnectDismiss={handleServerDisconnectDismiss}
        mobileConnectionCount={mobileConnectionCount}
        onCheckForUpdates={onCheckForUpdates}
        onConfirmClearCache={onConfirmClearCache}
        serverDisconnectDialogOpen={serverDisconnectDialogOpen}
        sessionDialogOpen={sessionDialogOpen}
        setAppDialog={setAppDialog}
        setSessionDialogOpen={setSessionDialogOpen}
        updateStatus={updateStatus}
      />

      <AccountDialogs
        accountDialog={accountDialog}
        accountForm={accountForm}
        accountStatus={accountStatus}
        busy={busy}
        changePassword={changePassword}
        changeUsername={changeUsername}
        deleteAccount={deleteAccount}
        error={error}
        handleDialogEnter={handleDialogEnter}
        logoutUser={logoutUser}
        resolvedAccountDialogUsername={resolvedAccountDialogUsername}
        setAccountDialog={setAccountDialog}
        setAccountForm={setAccountForm}
      />

      <ProjectDialogs
        busy={busy}
        canCloseProjectDialog={canCloseProjectDialog}
        connectedAccountFilter={connectedAccountFilter}
        createProject={createProject}
        currentUser={currentUser}
        deleteProject={deleteProject}
        deleteProjectText={deleteProjectText}
        desktopEnvironment={desktopEnvironment}
        desktopProjectPickerLoading={desktopProjectPickerLoading}
        desktopProjectPickerProjects={desktopProjectPickerProjects}
        desktopServerProfiles={desktopServerProfiles}
        error={error}
        exportFileName={exportFileName}
        exportMediaTree={exportMediaTree}
        exportProject={exportProject}
        handleDialogEnter={handleDialogEnter}
        importArchiveFile={importArchiveFile}
        importInputRef={importInputRef}
        importProject={importProject}
        importProjectName={importProjectName}
        onOpenDesktopProject={onOpenDesktopProject}
        onOpenManageAccounts={onOpenManageAccounts}
        onSelectDesktopServerProfile={onSelectDesktopServerProfile}
        openProjectFilter={openProjectFilter}
        projectApiKeyInput={projectApiKeyInput}
        projectName={projectName}
        projects={projects}
        renameProject={renameProject}
        saveProjectOpenAiKey={saveProjectOpenAiKey}
        selectedDesktopServerProfileId={selectedDesktopServerProfileId}
        selectedProjectId={selectedProjectId}
        setConnectedAccountFilter={setConnectedAccountFilter}
        setDeleteProjectText={setDeleteProjectText}
        setExportFileName={setExportFileName}
        setImportProjectName={setImportProjectName}
        setOpenProjectFilter={setOpenProjectFilter}
        setProjectApiKeyInput={setProjectApiKeyInput}
        setProjectName={setProjectName}
        setShowProjectDialog={setShowProjectDialog}
        setShowProjectId={setShowProjectId}
        showProjectDialog={showProjectDialog}
        transferProgress={transferProgress}
        tree={tree}
      />

      <TemplateDialogs
        applyTemplateConfirmation={applyTemplateConfirmation}
        bulkSelectionCount={bulkSelectionCount}
        bulkTemplateCount={bulkTemplateCount}
        busy={busy}
        confirmApplyTemplateSelection={confirmApplyTemplateSelection}
        confirmMergeNodeIntoPhoto={confirmMergeNodeIntoPhoto}
        confirmRemoveIdentificationTemplate={confirmRemoveIdentificationTemplate}
        deleteNode={deleteNode}
        deleteNodeOpen={deleteNodeOpen}
        deleteTemplate={deleteTemplate}
        error={error}
        handleDialogEnter={handleDialogEnter}
        hasBulkSelection={hasBulkSelection}
        identificationTemplateRemovalCount={identificationTemplateRemovalCount}
        identificationTemplateRemovalNodes={identificationTemplateRemovalNodes}
        identificationTemplates={identificationTemplates}
        importTemplateDialog={importTemplateDialog}
        importTemplateFromProject={importTemplateFromProject}
        importableProjects={importableProjects}
        importableTemplates={importableTemplates}
        mergePhotoConfirmation={mergePhotoConfirmation}
        newNodeDialog={newNodeDialog}
        newNodeName={newNodeName}
        selectedImportProject={selectedImportProject}
        selectedNode={selectedNode}
        setApplyTemplateConfirmation={setApplyTemplateConfirmation}
        setDeleteNodeOpen={setDeleteNodeOpen}
        setIdentificationTemplateRemovalNodeId={setIdentificationTemplateRemovalNodeId}
        setImportTemplateDialog={setImportTemplateDialog}
        setMergePhotoConfirmation={setMergePhotoConfirmation}
        setNewNodeDialog={setNewNodeDialog}
        setNewNodeName={setNewNodeName}
        setShowProjectDialog={setShowProjectDialog}
        setTemplateDialog={setTemplateDialog}
        showProjectDialog={showProjectDialog}
        submitNewNode={submitNewNode}
        submitTemplateDialog={submitTemplateDialog}
        templateDialog={templateDialog}
      />
    </>
  )
}
